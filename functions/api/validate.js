/**
 * Cloudflare Pages Function — AIBrain License Key Validator
 * Route: GET|POST /api/validate
 *
 * Validates HMAC-signed AIBrain license keys offline (no DB lookup).
 * Mirrors the logic in aibrain_licensing.py::validate_key()
 *
 * Key format: TIER-BASE64URL_PAYLOAD-HMAC_SIG
 *   - TIER         = "PRO" | "TEAM" (uppercase in key, lowercase in payload)
 *   - PAYLOAD      = URL-safe base64 (no padding) of JSON:
 *                    { t, e, x, sc, ss, ts }
 *   - HMAC_SIG     = first 16 hex chars of HMAC-SHA256(payload_b64, signing_key)
 *
 * Environment variables (set in CF Pages dashboard):
 *   LICENSE_SIGNING_KEY  — shared secret (default: "aibrain-license-v1")
 *
 * Returns:
 *   { valid: bool, tier: "pro"|"team"|null, email: string, reason?: string }
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
};

const VALID_TIERS = new Set(["pro", "team", "enterprise"]);

// ---------------------------------------------------------------------------
// Crypto helpers (Web Crypto API — no Node.js deps)
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

async function computeHmacHex(signingKey, message) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Validation logic (mirrors aibrain_licensing.py::validate_key)
// ---------------------------------------------------------------------------

async function validateKey(key, signingKey) {
  if (!key || typeof key !== "string") {
    return { valid: false, tier: null, email: null, reason: "No key provided" };
  }

  // Split into exactly 3 parts on the first two hyphens
  const parts = key.split("-");
  if (parts.length < 3) {
    return { valid: false, tier: null, email: null, reason: "Invalid key format" };
  }

  // TIER is the first segment; payload_b64 is middle; sig is last 16-char hex
  // Note: email in payload may contain hyphens after b64 encoding is negligible,
  // but the real split boundary is: first segment = tier, last segment = 16-char sig,
  // everything in between is the payload (handles any hypothetical hyphen in b64).
  const tierLabel = parts[0];
  const sig = parts[parts.length - 1];
  const payloadB64 = parts.slice(1, -1).join("-");

  const tier = tierLabel.toLowerCase();

  if (!VALID_TIERS.has(tier)) {
    return { valid: false, tier: null, email: null, reason: `Unknown tier: ${tier}` };
  }

  // Verify HMAC — sign over payload_b64 only (matches Python: hmac.new(_SIGNING_KEY, payload_b64.encode(), ...))
  const fullHex = await computeHmacHex(signingKey, payloadB64);
  const expectedSig = fullHex.slice(0, 16);

  if (sig !== expectedSig) {
    return { valid: false, tier: null, email: null, reason: "Invalid signature" };
  }

  // Decode payload — re-add stripped base64 padding
  let payload;
  try {
    const padded = payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
    // atob requires standard base64; convert URL-safe chars back first
    const standard = padded.replace(/-/g, "+").replace(/_/g, "/");
    payload = JSON.parse(atob(standard));
  } catch (err) {
    return { valid: false, tier: null, email: null, reason: `Corrupt payload: ${err.message}` };
  }

  const email = payload.e || null;
  const expiresAt = payload.x || "";

  // Check expiry (empty string or null = never expires)
  if (expiresAt) {
    try {
      const expDate = new Date(expiresAt);
      if (isNaN(expDate.getTime())) {
        return { valid: false, tier: null, email, reason: "Invalid expiry date in payload" };
      }
      if (Date.now() > expDate.getTime()) {
        return { valid: false, tier: null, email, reason: `License expired: ${expiresAt}` };
      }
    } catch (_) {
      return { valid: false, tier: null, email, reason: "Could not parse expiry date" };
    }
  }

  return { valid: true, tier, email };
}

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

async function extractKey(request) {
  const url = new URL(request.url);

  // GET: ?key=...
  const fromQuery = url.searchParams.get("key");
  if (fromQuery) return fromQuery.trim();

  // POST: JSON body { "key": "..." }
  if (request.method === "POST") {
    try {
      const body = await request.json();
      if (body && typeof body.key === "string") return body.key.trim();
    } catch (_) {
      // Fall through — return null to signal bad body
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Only accept GET and POST
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response(
      JSON.stringify({ valid: false, tier: null, email: null, reason: "Method not allowed" }),
      { status: 405, headers: JSON_HEADERS }
    );
  }

  const signingKey = env.LICENSE_SIGNING_KEY || "aibrain-license-v1";

  let key;
  try {
    key = await extractKey(request);
  } catch (err) {
    return new Response(
      JSON.stringify({ valid: false, tier: null, email: null, reason: "Could not parse request" }),
      { status: 400, headers: JSON_HEADERS }
    );
  }

  if (!key) {
    return new Response(
      JSON.stringify({ valid: false, tier: null, email: null, reason: "Missing 'key' parameter" }),
      { status: 400, headers: JSON_HEADERS }
    );
  }

  let result;
  try {
    result = await validateKey(key, signingKey);
  } catch (err) {
    return new Response(
      JSON.stringify({ valid: false, tier: null, email: null, reason: "Internal validation error" }),
      { status: 500, headers: JSON_HEADERS }
    );
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: JSON_HEADERS,
  });
}
