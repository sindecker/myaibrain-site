// Pricing countdown — fetches remaining Pro slots from API
// Deployed as inline script on landing page
(function() {
  const TOTAL_SLOTS = 200;
  const API_URL = 'https://myaibrain-api.deckerops.workers.dev/pro-remaining';

  function updateCountdown(remaining) {
    const elements = document.querySelectorAll('.countdown-remaining');
    elements.forEach(el => {
      el.textContent = remaining;
      // Add urgency color when low
      if (remaining <= 20) {
        el.style.color = '#ff4444';
        el.style.fontWeight = 'bold';
      } else if (remaining <= 50) {
        el.style.color = '#ff8800';
      }
    });

    const noteElements = document.querySelectorAll('.price-note');
    noteElements.forEach(el => {
      if (el.textContent.includes('200 users') || el.textContent.includes('remaining')) {
        el.innerHTML = 'Launch price — <span class="countdown-remaining" style="font-weight:bold;">' + remaining + '</span> of 200 spots remaining';
      }
    });
  }

  // Try to fetch live count, fall back to 200
  fetch(API_URL)
    .then(r => r.json())
    .then(data => updateCountdown(data.remaining || TOTAL_SLOTS))
    .catch(() => updateCountdown(TOTAL_SLOTS));
})();
