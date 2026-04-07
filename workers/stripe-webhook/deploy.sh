#!/usr/bin/env bash
# Deploy the Stripe webhook worker to Cloudflare
#
# Prerequisites:
#   - wrangler CLI authenticated (`wrangler login`)
#   - myaibrain.org domain configured in Cloudflare
#   - Resend domain verified for myaibrain.org
#
# Manual steps after deploy:
#   - Stripe dashboard: add webhook endpoint https://myaibrain.org/api/webhooks/stripe
#     - Select event: checkout.session.completed
#   - Stripe dashboard: set payment link success_url to https://myaibrain.org/success.html
#   - Stripe dashboard: add metadata.tier = "pro" (or "team"/"enterprise") to each product

set -euo pipefail
cd "$(dirname "$0")"

echo "=== Setting secrets ==="
echo "You will be prompted for each secret value."
echo ""

echo "1/3: STRIPE_WEBHOOK_SECRET (whsec_... from Stripe webhook settings)"
wrangler secret put STRIPE_WEBHOOK_SECRET

echo ""
echo "2/3: AIBRAIN_SIGNING_KEY (must match AIBRAIN_SIGNING_KEY env used by clients)"
wrangler secret put AIBRAIN_SIGNING_KEY

echo ""
echo "3/3: RESEND_API_KEY (from resend.com dashboard)"
wrangler secret put RESEND_API_KEY

echo ""
echo "=== Deploying worker ==="
wrangler deploy

echo ""
echo "=== Done ==="
echo "Worker deployed to: https://myaibrain.org/api/webhooks/stripe"
echo ""
echo "Remaining manual steps:"
echo "  1. Stripe dashboard -> Webhooks -> Add endpoint:"
echo "     URL: https://myaibrain.org/api/webhooks/stripe"
echo "     Events: checkout.session.completed"
echo "  2. Stripe payment links -> Each link -> After payment:"
echo "     Success URL: https://myaibrain.org/success.html"
echo "  3. Stripe products -> metadata -> tier = pro|team|enterprise"
