/**
 * Cloudflare Pages Function — PyPI stats proxy for AIBrain
 * Route: GET /api/pypi-stats
 *
 * Fetches from pypistats.org and returns combined recent + all-time counts.
 * Cached at the CF edge for 1 hour — pypistats updates once daily anyway.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const PYPISTATS_RECENT = "https://pypistats.org/api/packages/aibrain/recent";
const PYPISTATS_OVERALL = "https://pypistats.org/api/packages/aibrain/overall";

export async function onRequestGet(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    // Fetch both endpoints in parallel
    const [recentResp, overallResp] = await Promise.all([
      fetch(PYPISTATS_RECENT, { headers: { "User-Agent": "myaibrain-metrics/1.0" } }),
      fetch(PYPISTATS_OVERALL, { headers: { "User-Agent": "myaibrain-metrics/1.0" } }),
    ]);

    if (!recentResp.ok || !overallResp.ok) {
      throw new Error(`pypistats responded ${recentResp.status} / ${overallResp.status}`);
    }

    const [recent, overall] = await Promise.all([recentResp.json(), overallResp.json()]);

    // Sum all-time downloads (without_mirrors = real installs, excludes CDN mirrors)
    const allTime = overall.data
      .filter((r) => r.category === "without_mirrors")
      .reduce((sum, r) => sum + r.downloads, 0);

    const payload = {
      last_week: recent.data.last_week,
      last_month: recent.data.last_month,
      all_time: allTime,
      as_of: new Date().toISOString(),
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        // Cache for 1 hour — pypistats data is updated once a day
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    console.error("PyPI stats fetch failed:", err.message);
    return new Response(
      JSON.stringify({ error: "fetch failed", detail: err.message }),
      {
        status: 503,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
