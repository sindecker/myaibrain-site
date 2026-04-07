/**
 * aibrain-stripe-webhook — Cloudflare Worker
 *
 * Handles Stripe checkout.session.completed webhooks:
 *   1. Verifies Stripe signature (HMAC-SHA256)
 *   2. Generates a Pro/Team/Enterprise license key (matching aibrain_licensing.py)
 *   3. Emails the key to the customer via Resend
 *   4. Returns 200 to Stripe
 *
 * Required secrets (set via `wrangler secret put`):
 *   STRIPE_WEBHOOK_SECRET  — whsec_... from Stripe webhook settings
 *   AIBRAIN_SIGNING_KEY    — must match AIBRAIN_SIGNING_KEY env on clients
 *   RESEND_API_KEY         — Resend.com API key
 *
 * Manual setup:
 *   - Stripe dashboard: set webhook endpoint to https://myaibrain.org/api/webhooks/stripe
 *   - Stripe dashboard: set payment link success_url to https://myaibrain.org/success.html
 *   - Resend dashboard: verify myaibrain.org domain for sending
 */

export default {
  async fetch(request, env) {
    // Only accept POST
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Read body as text for signature verification
    const body = await request.text();
    const sigHeader = request.headers.get("stripe-signature");

    if (!sigHeader) {
      return new Response("Missing stripe-signature header", { status: 400 });
    }

    // 1. Verify Stripe webhook signature
    const signatureValid = await verifyStripeSignature(
      body,
      sigHeader,
      env.STRIPE_WEBHOOK_SECRET
    );

    if (!signatureValid) {
      return new Response("Invalid signature", { status: 401 });
    }

    // Parse the event
    let event;
    try {
      event = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    // Only process checkout completions
    if (event.type !== "checkout.session.completed") {
      return jsonResponse({ received: true, action: "ignored", type: event.type });
    }

    // 2. Extract customer info from the checkout session
    const session = event.data.object;
    const email = session.customer_email || session.customer_details?.email || "";
    const tier = session.metadata?.tier || "pro";
    const customerId = session.customer || "";
    const subscriptionId = session.subscription || "";

    if (!email) {
      // Can't deliver a key without an email — log but return 200 so Stripe
      // doesn't retry endlessly. The key can be generated manually.
      console.error("checkout.session.completed with no email", {
        sessionId: session.id,
        customerId,
      });
      return jsonResponse({ received: true, action: "no_email", session_id: session.id });
    }

    // 3. Generate license key (matches aibrain_licensing.py generate_key exactly)
    const key = await generateLicenseKey(
      tier,
      email,
      customerId,
      subscriptionId,
      env.AIBRAIN_SIGNING_KEY
    );

    // 4. Email the key to the customer
    const emailSent = await sendKeyEmail(email, tier, key, env);

    return jsonResponse({
      status: "ok",
      action: "key_delivered",
      email_sent: emailSent,
      tier,
      session_id: session.id,
    });
  },
};

// ---------------------------------------------------------------------------
// Stripe signature verification
// ---------------------------------------------------------------------------

/**
 * Verify Stripe webhook signature using HMAC-SHA256.
 *
 * Stripe sends: t=<timestamp>,v1=<signature>[,v1=<signature>...]
 * Expected: HMAC-SHA256(secret, "<timestamp>.<body>")
 *
 * Also rejects events older than 5 minutes to prevent replay attacks.
 */
async function verifyStripeSignature(body, sigHeader, secret) {
  // Parse header parts
  const parts = {};
  const v1Sigs = [];
  for (const item of sigHeader.split(",")) {
    const eqIdx = item.indexOf("=");
    if (eqIdx === -1) continue;
    const key = item.slice(0, eqIdx).trim();
    const val = item.slice(eqIdx + 1).trim();
    if (key === "v1") {
      v1Sigs.push(val);
    } else {
      parts[key] = val;
    }
  }

  const timestamp = parts["t"];
  if (!timestamp || v1Sigs.length === 0) {
    return false;
  }

  // Reject events older than 5 minutes (replay protection)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (isNaN(age) || age > 300) {
    return false;
  }

  // Compute expected signature
  const payload = `${timestamp}.${body}`;
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBytes = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(payload));
  const computed = hexEncode(new Uint8Array(sigBytes));

  // Stripe may send multiple v1 signatures (key rotation) — match any
  return v1Sigs.some((sig) => timingSafeEqual(computed, sig));
}

// ---------------------------------------------------------------------------
// License key generation — mirrors aibrain_licensing.py generate_key()
// ---------------------------------------------------------------------------

/**
 * Generate a license key matching the Python implementation exactly.
 *
 * Format: TIER-BASE64_PAYLOAD-HMAC_SIGNATURE
 *
 * - Payload is JSON with compact separators (",", ":"), no spaces
 * - Base64 is URL-safe with padding stripped
 * - Signature is HMAC-SHA256(signing_key, base64_payload) truncated to 16 hex chars
 */
async function generateLicenseKey(tier, email, customerId, subscriptionId, signingKey) {
  const validTiers = ["free", "pro", "team", "enterprise"];
  if (!validTiers.includes(tier.toLowerCase())) {
    tier = "pro";
  }
  tier = tier.toLowerCase();

  // Build payload — same keys as Python: t, e, x, sc, ss, ts
  const payload = {
    t: tier,
    e: email,
    x: "",               // expires_at — empty = never
    sc: customerId,       // stripe_customer_id
    ss: subscriptionId,   // stripe_subscription_id
    ts: new Date().toISOString(),
  };

  // Compact JSON — Python uses separators=(",", ":") which produces no spaces
  const payloadJson = JSON.stringify(payload);
  // JSON.stringify with no space args already produces compact output: {"t":"pro","e":"..."}
  // Python's separators=(",", ":") produces the same format

  // URL-safe base64 with padding stripped — matches Python's urlsafe_b64encode().rstrip("=")
  const payloadB64 = base64UrlEncode(payloadJson);

  // HMAC-SHA256 of the base64 payload, truncated to first 16 hex chars
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBytes = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(payloadB64));
  const sigHex = hexEncode(new Uint8Array(sigBytes)).slice(0, 16);

  return `${tier.toUpperCase()}-${payloadB64}-${sigHex}`;
}

// ---------------------------------------------------------------------------
// Email delivery via Resend
// ---------------------------------------------------------------------------

async function sendKeyEmail(email, tier, key, env) {
  const tierTitle = tier.charAt(0).toUpperCase() + tier.slice(1);

  const textBody = [
    `Thank you for subscribing to AIBrain ${tierTitle}!`,
    "",
    "Your license key:",
    key,
    "",
    "Activate it by running:",
    "  aibrain setup",
    "",
    "When prompted, paste your key.",
    "",
    "Or activate directly:",
    `  aibrain license activate "${key}"`,
    "",
    "Or via Python:",
    "  from aibrain_licensing import activate_key, save_license, validate_key, reset_cache",
    `  save_license("${key}")`,
    "  reset_cache()",
    "",
    "What you now have access to:",
  ];

  // Add tier-specific feature list
  const features = {
    pro: [
      "- 3 concurrent agents (up from 1)",
      "- 200 workflows with skill learning",
      "- Brain marketplace access",
      "- 50,000 memory capacity",
      "- BGE-base embedding model",
    ],
    team: [
      "- 10 concurrent agents",
      "- Full mesh merge (multi-agent intelligence)",
      "- Team brain sharing",
      "- 200,000 memory capacity",
      "- Everything in Pro",
    ],
    enterprise: [
      "- Unlimited agents",
      "- Swarm training (100+ agents)",
      "- Custom embedding models",
      "- Priority support",
      "- Everything in Team",
    ],
  };

  if (features[tier]) {
    textBody.push(...features[tier]);
  }

  textBody.push(
    "",
    "If you have any questions, reply to this email.",
    "",
    "-- AIBrain Team",
    "https://myaibrain.org"
  );

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AIBrain <noreply@myaibrain.org>",
        to: email,
        subject: `Your AIBrain ${tierTitle} License Key`,
        text: textBody.join("\n"),
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Resend API error:", response.status, errBody);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to send email:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * URL-safe base64 encode with padding stripped.
 * Matches Python: base64.urlsafe_b64encode(data).decode().rstrip("=")
 */
function base64UrlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  // Convert to standard base64 via btoa
  let base64 = btoa(String.fromCharCode(...bytes));
  // Make URL-safe: + -> -, / -> _
  base64 = base64.replace(/\+/g, "-").replace(/\//g, "_");
  // Strip padding
  base64 = base64.replace(/=+$/, "");
  return base64;
}

/** Hex-encode a Uint8Array. */
function hexEncode(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Both strings must be the same length (hex-encoded signatures).
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Return a JSON response with proper headers. */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
