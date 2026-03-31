/**
 * Health check for the webhook endpoint.
 * GET /api/webhooks/stripe-health
 */
export async function onRequestGet() {
  return new Response(JSON.stringify({
    status: "ok",
    service: "aibrain-webhook",
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
