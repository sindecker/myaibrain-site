/**
 * Cloudflare Pages Function — AIBrain Public Stats Proxy
 * Route: GET /api/stats
 *
 * Fetches from the AIBrain backend /public/stats endpoint and returns
 * JSON with CORS headers. No auth required — public funnel metrics only.
 *
 * Environment variables (set in CF Pages dashboard):
 *   AIBRAIN_BACKEND_URL  — e.g. https://api.myaibrain.org or http://76.13.198.228:8001
 *                          Defaults to the VPS backend if not set.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const DEFAULT_BACKEND = "http://76.13.198.228:8001";

export async function onRequestGet(context) {
  const { env, request } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const backendBase = (env.AIBRAIN_BACKEND_URL || DEFAULT_BACKEND).replace(/\/$/, "");
  const statsUrl = `${backendBase}/public/stats`;

  try {
    const upstream = await fetch(statsUrl, {
      method: "GET",
      headers: { "User-Agent": "myaibrain-metrics/1.0" },
      // CF Workers have a 30s subrequest timeout by default
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: "backend unavailable", status: upstream.status }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const data = await upstream.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        // Mirror the 5-min backend cache with a CF edge cache layer
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("Stats fetch failed:", err.message);
    return new Response(
      JSON.stringify({ error: "fetch failed", detail: err.message }),
      { status: 503, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
}

// Handle OPTIONS preflight
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
