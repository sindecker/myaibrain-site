# Graph Report - C:\Users\sinde\projects\myaibrain-site  (2026-05-07)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 80 nodes · 153 edges · 12 communities (9 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 11|Community 11]]

## God Nodes (most connected - your core abstractions)
1. `fetch()` - 13 edges
2. `print_table()` - 9 edges
3. `generateLicenseKey()` - 9 edges
4. `_color()` - 8 edges
5. `verify_all()` - 7 edges
6. `verifyStripeSignature()` - 7 edges
7. `jsonResponse()` - 7 edges
8. `verifyLicenseKey()` - 7 edges
9. `handleBillingPortal()` - 7 edges
10. `handleLicenseRefresh()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `verify_all()` --calls--> `check_artifact()`  [EXTRACTED]
  verify-prod.py → verify-public.py
- `onRequestPost()` --calls--> `sendLicenseEmail()`  [EXTRACTED]
  functions/api/community/register.js → archive/20260412_pages_function_deletion/stripe.js
- `verifyStripeSignature()` --calls--> `hmacSHA256()`  [EXTRACTED]
  workers/stripe-webhook/src/index.js → archive/20260412_pages_function_deletion/stripe.js
- `generateLicenseKey()` --calls--> `hmacSHA256()`  [EXTRACTED]
  workers/stripe-webhook/src/index.js → archive/20260412_pages_function_deletion/stripe.js
- `verifyStripeSignature()` --calls--> `toHex()`  [EXTRACTED]
  workers/stripe-webhook/src/index.js → archive/20260412_pages_function_deletion/stripe.js

## Communities (12 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.36
Nodes (14): extractLicenseKey(), fetch(), formEncode(), handleBillingPortal(), handleBillingStatus(), handleCreateCheckout(), handleLicenseRefresh(), handleLogin() (+6 more)

### Community 1 - "Community 1"
Cohesion: 0.47
Nodes (8): bold(), _color(), dim(), green(), _is_tty(), print_table(), Print a green/red status table., yellow()

### Community 3 - "Community 3"
Cohesion: 0.47
Nodes (8): hmacSHA256(), sendLicenseEmail(), toHex(), onRequestPost(), base64UrlEncode(), generateLicenseKey(), hexEncode(), verifyStripeSignature()

### Community 5 - "Community 5"
Cohesion: 0.6
Nodes (5): load_manifest(), main(), Verify every route in the manifest. Returns (all_green, results_list)., red(), verify_all()

### Community 7 - "Community 7"
Cohesion: 0.6
Nodes (3): escapeHtml(), openModal(), submit()

### Community 8 - "Community 8"
Cohesion: 0.7
Nodes (4): computeHmacHex(), extractKey(), onRequest(), validateKey()

### Community 9 - "Community 9"
Cohesion: 0.5
Nodes (4): check_artifact(), fetch_url(), Fetch a URL and return (body_text, error_msg). Body is None on error., Check one artifact. Returns dict with id, passed, errors[].

## Knowledge Gaps
- **5 isolated node(s):** `Run a single route smoke test. Returns (passed, status_code, body, error).`, `Verify every route in the manifest. Returns (all_green, results_list).`, `Print a green/red status table.`, `Fetch a URL and return (body_text, error_msg). Body is None on error.`, `Check one artifact. Returns dict with id, passed, errors[].`
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `onRequestPost()` connect `Community 3` to `Community 6`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `generateLicenseKey()` connect `Community 3` to `Community 0`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **What connects `Run a single route smoke test. Returns (passed, status_code, body, error).`, `Verify every route in the manifest. Returns (all_green, results_list).`, `Print a green/red status table.` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._