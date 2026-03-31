/**
 * Cloudflare Pages Function — Stripe Webhook Handler
 * Route: POST /api/webhooks/stripe
 *
 * Handles checkout.session.completed events:
 *   1. Verifies Stripe webhook signature
 *   2. Generates HMAC-signed license key
 *   3. Sends license key email via Resend
 *
 * Environment variables (set in CF Pages dashboard):
 *   STRIPE_WEBHOOK_SECRET  — whsec_... from Stripe
 *   RESEND_API_KEY         — re_... from Resend
 *   LICENSE_SIGNING_KEY    — shared secret for HMAC (default: aibrain-license-v1)
 */

// --- Crypto helpers (Web Crypto API, no Node deps) ---

async function hmacSHA256(key, message) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return new Uint8Array(sig);
}

function toHex(buf) {
  return [...buf].map(b => b.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// --- Stripe signature verification ---

async function verifyStripeSignature(payload, sigHeader, secret) {
  const parts = Object.fromEntries(
    sigHeader.split(",").map(p => {
      const [k, v] = p.split("=", 2);
      return [k, v];
    })
  );

  const timestamp = parts.t;
  const expectedSig = parts.v1;

  if (!timestamp || !expectedSig) {
    throw new Error("Missing signature components");
  }

  // Reject if timestamp is more than 5 minutes old
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (age > 300) {
    throw new Error("Webhook timestamp too old");
  }

  const signedPayload = `${timestamp}.${payload}`;
  const mac = await hmacSHA256(secret, signedPayload);
  const computedSig = toHex(mac);

  if (computedSig !== expectedSig) {
    throw new Error("Signature mismatch");
  }

  return JSON.parse(payload);
}

// --- License key generation (mirrors aibrain_licensing.py) ---

async function generateLicenseKey(tier, email, customerId, subscriptionId, signingKey) {
  const payload = {
    t: tier,
    e: email,
    x: "",  // no expiration — subscription managed by Stripe
    sc: customerId,
    ss: subscriptionId,
    ts: new Date().toISOString(),
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const mac = await hmacSHA256(signingKey, payloadB64);
  const sig = toHex(mac).slice(0, 16);

  return `${tier.toUpperCase()}-${payloadB64}-${sig}`;
}

// --- Email via Resend ---

async function sendLicenseEmail(email, tier, licenseKey, resendApiKey) {
  const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <h1 style="color: #6c5ce7;">Welcome to aibrain ${tierName}!</h1>
      <p>Thanks for subscribing. Here's your license key:</p>
      <div style="background: #1a1a2e; color: #00ff88; padding: 20px; border-radius: 8px; font-family: monospace; font-size: 14px; word-break: break-all; margin: 20px 0;">
        ${licenseKey}
      </div>
      <h3>Activate your license:</h3>
      <pre style="background: #f5f5f5; padding: 16px; border-radius: 8px; overflow-x: auto;">pip install aibrain
aibrain license activate ${licenseKey}</pre>
      <h3>What's included in ${tierName}:</h3>
      ${tier === "pro" ? `
        <ul>
          <li>3 AI agents</li>
          <li>155+ workflows with skill learning</li>
          <li>Brain marketplace access</li>
          <li>Up to 50,000 memories with BGE embeddings</li>
        </ul>
      ` : `
        <ul>
          <li>10 AI agents</li>
          <li>Full mesh merge across agents</li>
          <li>Team brain sharing</li>
          <li>Up to 200,000 memories with BGE embeddings</li>
        </ul>
      `}
      <p>Questions? Reply to this email or reach us at support@myaibrain.org</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #999; font-size: 12px;">myaibrain.org — Give your AI agent a brain</p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "aibrain <hello@myaibrain.org>",
      to: [email],
      subject: `Your aibrain ${tierName} License Key`,
      html: html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API error: ${res.status} — ${err}`);
  }

  return await res.json();
}

// --- Main handler ---

export async function onRequestPost(context) {
  const { request, env } = context;

  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  const resendApiKey = env.RESEND_API_KEY;
  const signingKey = env.LICENSE_SIGNING_KEY || "aibrain-license-v1";

  if (!webhookSecret || !resendApiKey) {
    return new Response(JSON.stringify({ error: "Missing configuration" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Read raw body for signature verification
  const rawBody = await request.text();
  const sigHeader = request.headers.get("stripe-signature");

  if (!sigHeader) {
    return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify signature
  let event;
  try {
    event = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);
  } catch (err) {
    return new Response(JSON.stringify({ error: `Verification failed: ${err.message}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Only handle checkout completions
  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true, action: "ignored" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = event.data.object;
  const email = session.customer_email || session.customer_details?.email;
  const customerId = session.customer || "";
  const subscriptionId = session.subscription || "";

  // Determine tier from metadata or line items
  const metadata = session.metadata || {};
  let tier = metadata.tier || "pro";

  if (!email) {
    return new Response(JSON.stringify({ error: "No customer email in session" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Generate license key
  const licenseKey = await generateLicenseKey(tier, email, customerId, subscriptionId, signingKey);

  // Send email
  try {
    await sendLicenseEmail(email, tier, licenseKey, resendApiKey);
  } catch (err) {
    // Log but don't fail — Stripe will retry the webhook
    console.error("Email send failed:", err.message);
    return new Response(JSON.stringify({
      received: true,
      action: "key_generated",
      email_sent: false,
      error: err.message,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    received: true,
    action: "license_delivered",
    tier: tier,
    email: email,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
