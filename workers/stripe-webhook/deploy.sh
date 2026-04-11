#!/usr/bin/env bash
# Deploy the Stripe webhook + billing Worker to Cloudflare
#
# Prerequisites:
#   - wrangler CLI authenticated (`wrangler login`) OR npx wrangler will work
#   - myaibrain.org zone exists in Cloudflare
#   - Resend domain verified for myaibrain.org
#   - .decker_env (or equivalent) sourced in the calling shell with the 8 vars below
#
# Usage:
#   set -a; source ~/.decker_env; set +a
#   ./deploy.sh
#
# Manual Stripe dashboard steps after first deploy:
#   - Webhooks -> Add endpoint: https://myaibrain.org/api/webhooks/stripe
#     Select events: checkout.session.completed, customer.subscription.updated,
#                    customer.subscription.deleted, invoice.payment_failed
#   - Each Payment Link / Product: metadata.tier = "pro" | "team" | "enterprise"

set -euo pipefail
cd "$(dirname "$0")"

# Map env -> Worker secret name. The Worker uses STRIPE_API_KEY internally;
# the .decker_env names this STRIPE_SECRET_KEY (the live sk_live_... key).
declare -A SECRETS=(
  [STRIPE_WEBHOOK_SECRET]="${STRIPE_WEBHOOK_SECRET:-}"
  [AIBRAIN_SIGNING_KEY]="${AIBRAIN_SIGNING_KEY:-}"
  [RESEND_API_KEY]="${RESEND_API_KEY:-}"
  [STRIPE_API_KEY]="${STRIPE_SECRET_KEY:-}"
  [STRIPE_PRICE_PRO_MONTHLY]="${STRIPE_PRICE_PRO_MONTHLY:-}"
  [STRIPE_PRICE_PRO_YEARLY]="${STRIPE_PRICE_PRO_YEARLY:-}"
  [STRIPE_PRICE_TEAM_MONTHLY]="${STRIPE_PRICE_TEAM_MONTHLY:-}"
  [STRIPE_PRICE_TEAM_YEARLY]="${STRIPE_PRICE_TEAM_YEARLY:-}"
)

# Verify all 8 vars are present in the calling environment
missing=()
for name in "${!SECRETS[@]}"; do
  if [[ -z "${SECRETS[$name]}" ]]; then
    missing+=("$name")
  fi
done
if (( ${#missing[@]} > 0 )); then
  echo "ERROR: missing env vars in calling shell: ${missing[*]}" >&2
  echo "Hint: set -a; source ~/.decker_env; set +a" >&2
  exit 1
fi

echo "=== Setting 8 secrets on aibrain-stripe-webhook ==="
for name in STRIPE_WEBHOOK_SECRET AIBRAIN_SIGNING_KEY RESEND_API_KEY STRIPE_API_KEY \
            STRIPE_PRICE_PRO_MONTHLY STRIPE_PRICE_PRO_YEARLY \
            STRIPE_PRICE_TEAM_MONTHLY STRIPE_PRICE_TEAM_YEARLY; do
  echo "  -> $name"
  printf '%s' "${SECRETS[$name]}" | npx --yes wrangler secret put "$name" >/dev/null 2>&1
done

echo ""
echo "=== Deploying worker ==="
npx --yes wrangler deploy

echo ""
echo "=== Done ==="
echo "Worker deployed. Routes:"
echo "  POST https://myaibrain.org/api/webhooks/stripe"
echo "  GET/POST https://myaibrain.org/api/billing/portal"
echo "  GET/POST https://myaibrain.org/api/billing/status"
echo "  GET/POST https://myaibrain.org/api/license/refresh"
echo "  POST https://myaibrain.org/api/checkout"
