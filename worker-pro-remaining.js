// Cloudflare Worker — /pro-remaining endpoint
// Returns number of remaining Pro launch slots (200 - active subscriptions)
// Deploy: wrangler deploy --name myaibrain-api

const TOTAL_SLOTS = 200;
const PRO_PRODUCT_ID = 'prod_UGaM6hcHDxqPz6'; // AIBrain Pro

export default {
  async fetch(request, env) {
    // CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60', // cache 1 min
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    try {
      // Count active subscriptions for the Pro product
      const stripeResponse = await fetch(
        `https://api.stripe.com/v1/subscriptions?status=active&limit=100`,
        {
          headers: {
            'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
          },
        }
      );

      const data = await stripeResponse.json();

      // Count subscriptions that include the Pro product
      let proCount = 0;
      if (data.data) {
        for (const sub of data.data) {
          for (const item of sub.items.data) {
            if (item.price && item.price.product === PRO_PRODUCT_ID) {
              proCount++;
            }
          }
        }
      }

      // Also count redeemed promotion codes (free Pro access given to creators)
      const promoResponse = await fetch(
        `https://api.stripe.com/v1/promotion_codes?active=true&limit=100`,
        {
          headers: {
            'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
            'Stripe-Version': '2024-12-18.acacia',
          },
        }
      );

      const promoData = await promoResponse.json();
      let redeemedCount = 0;
      if (promoData.data) {
        for (const promo of promoData.data) {
          if (promo.times_redeemed > 0) {
            redeemedCount++;
          }
        }
      }

      const totalUsed = proCount + redeemedCount;
      const remaining = Math.max(0, TOTAL_SLOTS - totalUsed);

      return new Response(JSON.stringify({
        remaining,
        total: TOTAL_SLOTS,
        used: totalUsed,
        subscriptions: proCount,
        redeemed_promos: redeemedCount,
      }), { headers });

    } catch (error) {
      // On error, return full slots (don't break the page)
      return new Response(JSON.stringify({
        remaining: TOTAL_SLOTS,
        total: TOTAL_SLOTS,
        error: 'Could not fetch subscription count',
      }), { headers });
    }
  },
};
