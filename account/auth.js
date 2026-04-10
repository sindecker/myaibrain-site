/* Shared auth frontend helpers.

   API_BASE is the backend host — defaults to same origin. Override via
   <meta name="aibrain-api-base" content="https://api.myaibrain.org">.
   All fetches use credentials: 'include' so the HttpOnly session cookie
   is sent cross-origin when configured.
*/
(function () {
    const metaBase = document.querySelector('meta[name="aibrain-api-base"]');
    const API_BASE = (metaBase && metaBase.content) || window.AIBRAIN_API_BASE || '';

    async function apiCall(path, method, body) {
        const opts = {
            method: method || 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
        };
        if (body !== undefined) {
            opts.body = JSON.stringify(body);
        }
        let resp;
        try {
            resp = await fetch(API_BASE + path, opts);
        } catch (e) {
            throw { status: 0, detail: 'Network error — is the backend reachable?' };
        }
        let data = null;
        try { data = await resp.json(); } catch (_e) { /* no body */ }
        if (!resp.ok) {
            throw { status: resp.status, detail: (data && (data.detail || data.error)) || resp.statusText };
        }
        return data;
    }

    function showNotice(el, kind, msg) {
        if (!el) return;
        el.className = 'notice ' + kind;
        el.textContent = msg;
        el.style.display = 'block';
    }

    function clearNotice(el) {
        if (!el) return;
        el.style.display = 'none';
        el.textContent = '';
    }

    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function validatePassword(pw) {
        if (!pw || pw.length < 10) return 'Password must be at least 10 characters';
        if (!/[A-Za-z]/.test(pw)) return 'Password must contain letters';
        if (!/[^A-Za-z]/.test(pw)) return 'Password must contain a number or symbol';
        return null;
    }

    function getQueryParam(name) {
        return new URLSearchParams(window.location.search).get(name);
    }

    async function loadProviders() {
        try {
            const data = await apiCall('/auth/oauth/providers');
            return data.enabled || [];
        } catch (_e) {
            return [];
        }
    }

    function renderOauthButtons(container, providers, mode) {
        if (!container) return;
        const labels = {
            github: 'Continue with GitHub',
            google: 'Continue with Google',
            microsoft: 'Continue with Microsoft',
        };
        container.innerHTML = '';
        if (providers.length === 0) return;
        providers.forEach(function (p) {
            const btn = document.createElement('a');
            btn.className = 'oauth-btn ' + p;
            btn.href = API_BASE + '/auth/oauth/' + p + '/start';
            btn.innerHTML = '<span>' + (labels[p] || p) + '</span>';
            container.appendChild(btn);
        });
    }

    window.AIBrainAuth = {
        API_BASE: API_BASE,
        apiCall: apiCall,
        showNotice: showNotice,
        clearNotice: clearNotice,
        validateEmail: validateEmail,
        validatePassword: validatePassword,
        getQueryParam: getQueryParam,
        loadProviders: loadProviders,
        renderOauthButtons: renderOauthButtons,
    };
})();
