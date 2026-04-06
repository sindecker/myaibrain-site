/**
 * Community registration endpoint.
 * Stores email + metadata in KV for follow-up.
 * Called from setup wizard and landing page.
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { email, source, version, platform, timestamp } = body;

    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Store in KV (COMMUNITY namespace) if available
    const entry = {
      email,
      source: source || "landing",
      version: version || "unknown",
      platform: platform || "unknown",
      registered_at: timestamp || new Date().toISOString(),
    };

    if (env.COMMUNITY) {
      // KV key: email (deduplicated)
      await env.COMMUNITY.put(`user:${email}`, JSON.stringify(entry));

      // Also append to a counter
      const countStr = await env.COMMUNITY.get("stats:total_registrations");
      const count = parseInt(countStr || "0") + 1;
      await env.COMMUNITY.put("stats:total_registrations", count.toString());
    }

    return new Response(
      JSON.stringify({ ok: true, message: "Welcome to the community!" }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
