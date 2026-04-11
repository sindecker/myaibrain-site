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
    // --- Hard security guard: AIBRAIN_SIGNING_KEY MUST be set. ---
    // No hardcoded fallback: a public fallback would let anyone reading the
    // repo mint valid license keys. Fail loud at request time rather than
    // silently hash against `undefined` and produce unvalidatable keys.
    if (!env.AIBRAIN_SIGNING_KEY) {
      console.error("FATAL: AIBRAIN_SIGNING_KEY secret is not set on the Worker");
      return new Response(
        JSON.stringify({
          error:
            "AIBRAIN_SIGNING_KEY is not configured on this Worker. " +
            "Set it via `wrangler secret put AIBRAIN_SIGNING_KEY`.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const url = new URL(request.url);

    // --- Billing portal / status / license refresh routes (item 5 + 7) ---
    // These are GET/POST routes authenticated by a valid HMAC-signed license key
    // in the Authorization header. They talk to Stripe server-side and return
    // JSON. The Stripe secret key lives in env.STRIPE_API_KEY (server-only).
    if (url.pathname === "/api/billing/portal") {
      return handleBillingPortal(request, env);
    }
    if (url.pathname === "/api/billing/status") {
      return handleBillingStatus(request, env);
    }
    if (url.pathname === "/api/license/refresh") {
      return handleLicenseRefresh(request, env);
    }
    if (url.pathname === "/api/checkout") {
      return handleCreateCheckout(request, env);
    }

    // --- Stripe webhook (the original, unchanged behavior) ---
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

    // Subscription lifecycle events (item 6) — log only, no state push.
    // State is authoritative in Stripe; local clients pull on demand via
    // /api/billing/status. This preserves the stateless Worker model.
    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted" ||
      event.type === "invoice.payment_failed"
    ) {
      const obj = event.data?.object || {};
      console.log("subscription_event", {
        type: event.type,
        customer: obj.customer || "",
        subscription: obj.id || obj.subscription || "",
        status: obj.status || "",
        cancel_at_period_end: obj.cancel_at_period_end || false,
      });
      return jsonResponse({
        received: true,
        action: "logged",
        type: event.type,
      });
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
async function generateLicenseKey(tier, email, customerId, subscriptionId, signingKey, expiresAt = "") {
  const validTiers = ["free", "pro", "team", "enterprise"];
  if (!validTiers.includes(tier.toLowerCase())) {
    tier = "pro";
  }
  tier = tier.toLowerCase();

  // Build payload — same keys as Python: t, e, x, sc, ss, ts
  // `x` doubles as valid_until for rolling short-lived keys (item 7):
  // callers set it to subscription.current_period_end + 24h grace.
  const payload = {
    t: tier,
    e: email,
    x: expiresAt,         // expires_at / valid_until — empty = never
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

// ---------------------------------------------------------------------------
// License key verification (inverse of generateLicenseKey)
// ---------------------------------------------------------------------------

/**
 * Verify a license key and return its decoded payload, or null if invalid.
 * Format: TIER-BASE64URL_PAYLOAD-HEX_SIG16
 * Does NOT check expiry — callers decide grace behavior.
 */
async function verifyLicenseKey(key, signingKey) {
  if (!key || typeof key !== "string") return null;
  const parts = key.split("-");
  if (parts.length < 3) return null;
  // TIER-base64-sig — base64 might not contain "-" because URL-safe replaces / with _
  // but the tier prefix is a single segment and sig is the last segment.
  const tier = parts[0];
  const sigHex = parts[parts.length - 1];
  const payloadB64 = parts.slice(1, -1).join("-");

  // Recompute HMAC
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const macBytes = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(payloadB64));
  const expectedSigHex = hexEncode(new Uint8Array(macBytes)).slice(0, 16);
  if (!timingSafeEqual(expectedSigHex, sigHex)) return null;

  // Decode payload
  try {
    const b64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json = atob(b64 + pad);
    const payload = JSON.parse(json);
    return { tier: tier.toLowerCase(), payload };
  } catch {
    return null;
  }
}

/**
 * Extract a license key from the Authorization header.
 * Accepts: `Authorization: Bearer <key>` or `Authorization: <key>`.
 */
function extractLicenseKey(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth) return "";
  const trimmed = auth.trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return trimmed.slice(7).trim();
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Stripe API helpers (server-side only)
// ---------------------------------------------------------------------------

async function stripeFetch(env, path, init = {}) {
  if (!env.STRIPE_API_KEY) {
    throw new Error("STRIPE_API_KEY is not configured on the Worker");
  }
  const res = await fetch(`https://api.stripe.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.STRIPE_API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(init.headers || {}),
    },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Stripe API ${path} -> ${res.status}: ${body.slice(0, 200)}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Stripe API ${path} returned non-JSON`);
  }
}

function formEncode(obj) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    params.append(k, String(v));
  }
  return params.toString();
}

// ---------------------------------------------------------------------------
// Item 5 — /api/billing/portal
// ---------------------------------------------------------------------------

async function handleBillingPortal(request, env) {
  if (request.method !== "POST" && request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  const key = extractLicenseKey(request);
  const verified = await verifyLicenseKey(key, env.AIBRAIN_SIGNING_KEY);
  if (!verified) {
    return jsonResponse({ error: "Invalid or missing license key" }, 401);
  }
  const customerId = verified.payload.sc || "";
  if (!customerId) {
    return jsonResponse({ error: "License key has no Stripe customer ID" }, 400);
  }
  try {
    const session = await stripeFetch(env, "/v1/billing_portal/sessions", {
      method: "POST",
      body: formEncode({
        customer: customerId,
        return_url: "https://myaibrain.org/account/",
      }),
    });
    return jsonResponse({ portal_url: session.url });
  } catch (err) {
    console.error("billing_portal error:", err.message);
    return jsonResponse({ error: "Failed to create portal session" }, 502);
  }
}

// ---------------------------------------------------------------------------
// Item 5 — /api/billing/status
// ---------------------------------------------------------------------------

async function handleBillingStatus(request, env) {
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const key = extractLicenseKey(request);
  const verified = await verifyLicenseKey(key, env.AIBRAIN_SIGNING_KEY);
  if (!verified) {
    return jsonResponse({ error: "Invalid or missing license key" }, 401);
  }
  const customerId = verified.payload.sc || "";
  if (!customerId) {
    return jsonResponse({
      status: "no_customer",
      tier: verified.tier,
      current_period_end: null,
      cancel_at_period_end: false,
    });
  }
  try {
    const subs = await stripeFetch(
      env,
      `/v1/subscriptions?customer=${encodeURIComponent(customerId)}&limit=10`,
      { method: "GET" }
    );
    const active = (subs.data || []).find(
      (s) => s.status === "active" || s.status === "trialing"
    );
    if (!active) {
      return jsonResponse({
        status: "inactive",
        tier: "free",
        current_period_end: null,
        cancel_at_period_end: false,
      });
    }
    // Derive tier from subscription metadata or price lookup
    let tier = verified.tier;
    if (active.metadata && active.metadata.tier) {
      tier = active.metadata.tier;
    }
    return jsonResponse({
      status: active.status,
      tier,
      current_period_end: active.current_period_end,
      cancel_at_period_end: !!active.cancel_at_period_end,
      subscription_id: active.id,
    });
  } catch (err) {
    console.error("billing_status error:", err.message);
    return jsonResponse({ error: "Failed to query Stripe" }, 502);
  }
}

// ---------------------------------------------------------------------------
// Item 9 — /api/checkout (server-side Stripe Checkout session creation)
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Checkout session for a subscription tier.
 *
 * Body: {tier: "pro"|"team", interval?: "monthly"|"yearly",
 *        email?: string, client_reference_id?: string}
 * Returns: {checkout_url, session_id}
 *
 * This replaces the hardcoded `buy.stripe.com` Payment Links so that:
 *   1. client_reference_id flows into the webhook → per-user license_state write
 *   2. prices live in env (STRIPE_PRICE_PRO_MONTHLY, etc), not in HTML
 *   3. success/cancel URLs are fully controlled
 */
async function handleCreateCheckout(request, env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Body must be JSON" }, 400);
  }

  const tier = String(body.tier || "").toLowerCase();
  const interval = String(body.interval || "monthly").toLowerCase();
  const email = body.email || "";
  const clientReferenceId = body.client_reference_id || "";

  if (!["pro", "team"].includes(tier)) {
    return jsonResponse({ error: "Invalid tier — must be pro or team" }, 400);
  }
  if (!["monthly", "yearly"].includes(interval)) {
    return jsonResponse({ error: "Invalid interval" }, 400);
  }

  // Resolve price ID from Worker env (operator must set these via wrangler secret).
  const priceKey = `STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()}`;
  const priceId = env[priceKey];
  if (!priceId) {
    console.error(`checkout: ${priceKey} not configured on Worker`);
    return jsonResponse(
      { error: `Checkout not configured for ${tier}/${interval}` },
      503
    );
  }

  const params = {
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": 1,
    success_url: "https://myaibrain.org/success.html?session={CHECKOUT_SESSION_ID}",
    cancel_url: "https://myaibrain.org/#pricing",
    "metadata[tier]": tier,
    "subscription_data[metadata][tier]": tier,
  };
  if (email) params.customer_email = email;
  if (clientReferenceId) params.client_reference_id = clientReferenceId;

  try {
    const session = await stripeFetch(env, "/v1/checkout/sessions", {
      method: "POST",
      body: formEncode(params),
    });
    return jsonResponse({
      checkout_url: session.url,
      session_id: session.id,
    });
  } catch (err) {
    console.error("checkout error:", err.message);
    return jsonResponse({ error: "Failed to create checkout session" }, 502);
  }
}

// ---------------------------------------------------------------------------
// Item 7 — /api/license/refresh
// ---------------------------------------------------------------------------

/**
 * Rolling short-lived key refresh.
 *
 * Verifies the caller's current key, asks Stripe for the live subscription
 * state, and mints a NEW key whose embedded subscription fields reflect
 * current reality. The new key has the same `sc` (customer) but an updated
 * issued-at timestamp. Callers cache the returned key and re-refresh at the
 * 24h standard SaaS window.
 *
 * Expiry enforcement happens client-side via `valid_until` — the Worker does
 * not store any state. The client's local cache file is the source of the
 * refresh cadence, with the scheduled cron as a safety net.
 */
async function handleLicenseRefresh(request, env) {
  if (request.method !== "POST" && request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  const key = extractLicenseKey(request);
  const verified = await verifyLicenseKey(key, env.AIBRAIN_SIGNING_KEY);
  if (!verified) {
    return jsonResponse({ error: "Invalid or missing license key" }, 401);
  }
  const prev = verified.payload;
  const customerId = prev.sc || "";
  const email = prev.e || "";
  if (!customerId || !email) {
    return jsonResponse({ error: "License key missing customer or email" }, 400);
  }

  // Pull current subscription state from Stripe
  let tier = verified.tier;
  let subscriptionId = prev.ss || "";
  let validUntilIso = "";
  try {
    const subs = await stripeFetch(
      env,
      `/v1/subscriptions?customer=${encodeURIComponent(customerId)}&limit=10`,
      { method: "GET" }
    );
    const active = (subs.data || []).find(
      (s) => s.status === "active" || s.status === "trialing"
    );
    if (active) {
      if (active.metadata && active.metadata.tier) tier = active.metadata.tier;
      subscriptionId = active.id;
      // valid_until = current_period_end + 24h grace
      if (active.current_period_end) {
        const ms = (active.current_period_end + 86400) * 1000;
        validUntilIso = new Date(ms).toISOString();
      }
    } else {
      // No active sub — downgrade to free on refresh
      tier = "free";
      validUntilIso = new Date(Date.now() + 86400 * 1000).toISOString();
    }
  } catch (err) {
    console.error("license_refresh stripe lookup failed:", err.message);
    return jsonResponse({ error: "Failed to query Stripe" }, 502);
  }

  // Mint a fresh key with rolling validity
  const newKey = await generateLicenseKey(
    tier,
    email,
    customerId,
    subscriptionId,
    env.AIBRAIN_SIGNING_KEY,
    validUntilIso
  );
  return jsonResponse({
    license_key: newKey,
    tier,
    valid_until: validUntilIso,
    refreshed_at: new Date().toISOString(),
  });
}
