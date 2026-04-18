/**
 * AIBrain feedback widget — vanilla JS, zero deps.
 * Drops into any static HTML page. Renders a floating button bottom-right.
 * On click: modal with email/category/message form. POSTs JSON to
 * https://myaibrain.org/api/feedback (routed to aibrain-feedback Worker).
 *
 * Loads async; all DOM work deferred until DOMContentLoaded to keep LCP clean.
 */
(function () {
  "use strict";

  var ENDPOINT = "https://myaibrain.org/api/feedback";
  var FALLBACK_EMAIL = "decker.ops@gmail.com";
  var MAX_MSG = 2000;

  var css = [
    ".aib-fb-btn{position:fixed;bottom:20px;right:20px;z-index:9998;",
    "background:#18181b;color:#F97316;border:1px solid #F59E0B;",
    "padding:10px 18px;border-radius:24px;font:600 14px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;",
    "cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.4);transition:transform .15s,background .15s}",
    ".aib-fb-btn:hover{background:#27272a;transform:translateY(-2px)}",
    ".aib-fb-btn:focus{outline:2px solid #F97316;outline-offset:2px}",
    ".aib-fb-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);",
    "display:flex;align-items:center;justify-content:center;padding:16px;",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif}",
    ".aib-fb-modal{background:#18181b;border:1px solid #27272a;border-radius:12px;",
    "padding:24px;max-width:480px;width:100%;color:#f4f4f5;max-height:90vh;overflow-y:auto}",
    ".aib-fb-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}",
    ".aib-fb-h h3{font-size:18px;font-weight:700;color:#F97316}",
    ".aib-fb-x{background:none;border:0;color:#71717a;font-size:24px;cursor:pointer;line-height:1;padding:0 4px}",
    ".aib-fb-x:hover{color:#f4f4f5}",
    ".aib-fb-field{margin-bottom:12px}",
    ".aib-fb-field label{display:block;font-size:13px;color:#a1a1aa;margin-bottom:4px}",
    ".aib-fb-field input,.aib-fb-field select,.aib-fb-field textarea{width:100%;",
    "background:#0a0a0a;border:1px solid #27272a;border-radius:6px;padding:8px 10px;",
    "color:#f4f4f5;font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;box-sizing:border-box}",
    ".aib-fb-field input:focus,.aib-fb-field select:focus,.aib-fb-field textarea:focus{",
    "outline:0;border-color:#F97316}",
    ".aib-fb-field textarea{resize:vertical;min-height:90px;font-family:inherit}",
    ".aib-fb-count{font-size:11px;color:#71717a;text-align:right;margin-top:2px}",
    ".aib-fb-submit{width:100%;background:#F97316;color:#000;border:0;border-radius:6px;",
    "padding:10px;font:600 14px -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;",
    "cursor:pointer;margin-top:6px}",
    ".aib-fb-submit:hover{background:#fb923c}",
    ".aib-fb-submit:disabled{background:#52525b;cursor:not-allowed}",
    ".aib-fb-msg{font-size:13px;margin-top:10px;padding:8px 10px;border-radius:6px}",
    ".aib-fb-ok{background:#052e1a;color:#86efac;border:1px solid #14532d}",
    ".aib-fb-err{background:#2d0a0a;color:#fca5a5;border:1px solid #7f1d1d}",
    ".aib-fb-err a{color:#fb923c}"
  ].join("");

  function inject() {
    var s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);

    var btn = document.createElement("button");
    btn.className = "aib-fb-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Open feedback form");
    btn.textContent = "Feedback";
    btn.addEventListener("click", openModal);
    document.body.appendChild(btn);
  }

  function openModal() {
    var overlay = document.createElement("div");
    overlay.className = "aib-fb-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML =
      '<div class="aib-fb-modal">' +
        '<div class="aib-fb-h"><h3>Send feedback</h3>' +
        '<button class="aib-fb-x" type="button" aria-label="Close">&times;</button></div>' +
        '<form class="aib-fb-form" novalidate>' +
          '<div class="aib-fb-field"><label for="aib-fb-email">Email *</label>' +
            '<input id="aib-fb-email" type="email" required maxlength="200" autocomplete="email"></div>' +
          '<div class="aib-fb-field"><label for="aib-fb-name">Name (optional)</label>' +
            '<input id="aib-fb-name" type="text" maxlength="100" autocomplete="name"></div>' +
          '<div class="aib-fb-field"><label for="aib-fb-cat">Category</label>' +
            '<select id="aib-fb-cat">' +
              '<option value="bug">Bug</option>' +
              '<option value="feature">Feature</option>' +
              '<option value="question" selected>Question</option>' +
              '<option value="other">Other</option>' +
            '</select></div>' +
          '<div class="aib-fb-field"><label for="aib-fb-msg">Message *</label>' +
            '<textarea id="aib-fb-msg" required maxlength="' + MAX_MSG + '"></textarea>' +
            '<div class="aib-fb-count"><span id="aib-fb-cnt">0</span>/' + MAX_MSG + '</div></div>' +
          '<button class="aib-fb-submit" type="submit">Send</button>' +
          '<div class="aib-fb-status"></div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(overlay);

    var close = function () { overlay.remove(); document.removeEventListener("keydown", esc); };
    var esc = function (e) { if (e.key === "Escape") close(); };
    overlay.querySelector(".aib-fb-x").addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.addEventListener("keydown", esc);

    var msgEl = overlay.querySelector("#aib-fb-msg");
    var cntEl = overlay.querySelector("#aib-fb-cnt");
    msgEl.addEventListener("input", function () { cntEl.textContent = msgEl.value.length; });

    overlay.querySelector("#aib-fb-email").focus();

    overlay.querySelector(".aib-fb-form").addEventListener("submit", function (e) {
      e.preventDefault();
      submit(overlay);
    });
  }

  function submit(overlay) {
    var email = overlay.querySelector("#aib-fb-email").value.trim();
    var name = overlay.querySelector("#aib-fb-name").value.trim();
    var category = overlay.querySelector("#aib-fb-cat").value;
    var message = overlay.querySelector("#aib-fb-msg").value.trim();
    var status = overlay.querySelector(".aib-fb-status");
    var btn = overlay.querySelector(".aib-fb-submit");

    status.className = "aib-fb-status";
    status.textContent = "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      status.className = "aib-fb-msg aib-fb-err";
      status.textContent = "Please enter a valid email.";
      return;
    }
    if (!message || message.length < 2) {
      status.className = "aib-fb-msg aib-fb-err";
      status.textContent = "Message cannot be empty.";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Sending...";

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, name: name, category: category, message: message })
    })
      .then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
      })
      .then(function (res) {
        if (res.ok && res.body && res.body.ok) {
          overlay.querySelector(".aib-fb-form").innerHTML =
            '<div class="aib-fb-msg aib-fb-ok">Thanks — ' + FALLBACK_EMAIL +
            ' will reply within 24h.</div>';
          setTimeout(function () { overlay.remove(); }, 4000);
        } else {
          var err = (res.body && res.body.error) || ("HTTP " + res.status);
          throw new Error(err);
        }
      })
      .catch(function (e) {
        status.className = "aib-fb-msg aib-fb-err";
        status.innerHTML = "Couldn't send (" + escapeHtml(e.message || "network error") +
          "). <a href=\"mailto:" + FALLBACK_EMAIL + "\">Email us directly</a> instead.";
        btn.disabled = false;
        btn.textContent = "Send";
      });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }
})();
