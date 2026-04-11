#!/usr/bin/env python3
"""
verify-prod.py — Production smoke test for myaibrain.org customer routes.

Reads customer_routes.json and runs the smoke test for every route.
Each smoke test verifies the route exists at the edge and responds with
the contracted shape, WITHOUT requiring real secrets — the auth-deny path
proves the route is wired correctly.

Usage:
    python verify-prod.py                  # one-shot, exit 0 if all green
    python verify-prod.py --retry          # retry failures up to 60s (post-deploy)
    python verify-prod.py --json           # JSON output for programmatic consumption
    python verify-prod.py --route stripe_webhook  # only test one route by id

Exit codes:
    0 — all routes green
    1 — one or more routes red
    2 — manifest file missing or invalid
    3 — verify-prod itself failed (network down, etc)

This is the gate that catches every "working but not working" Stripe break
at deploy time. It is wired into deploy.sh and the GitHub Action smoke cron.
"""

import argparse
import json
import shlex
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

MANIFEST_PATH = Path(__file__).parent / "customer_routes.json"
CURL_TIMEOUT_SEC = 10
RETRY_MAX_WAIT_SEC = 60
RETRY_INTERVAL_SEC = 5

# ANSI color codes — only emit if stdout is a TTY
def _is_tty():
    return sys.stdout.isatty()

def _color(code, s):
    if not _is_tty():
        return s
    return f"\033[{code}m{s}\033[0m"

def green(s): return _color("32", s)
def red(s): return _color("31", s)
def yellow(s): return _color("33", s)
def bold(s): return _color("1", s)
def dim(s): return _color("2", s)


def load_manifest():
    if not MANIFEST_PATH.exists():
        print(red(f"FATAL: manifest not found at {MANIFEST_PATH}"), file=sys.stderr)
        sys.exit(2)
    try:
        with open(MANIFEST_PATH, encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        print(red(f"FATAL: manifest is not valid JSON: {e}"), file=sys.stderr)
        sys.exit(2)


def run_smoke(route, base_url):
    """Run a single route smoke test. Returns (passed, status_code, body, error)."""
    url = base_url + route["url_path"]
    smoke = route.get("smoke_test", {})
    extra_args = smoke.get("curl_args", "")
    # Build curl command — always silent, capture status + body separately
    cmd = [
        "curl",
        "-s",
        "-o", "-",
        "-w", "\n__HTTP_STATUS__:%{http_code}",
        "--max-time", str(CURL_TIMEOUT_SEC),
        "--retry", "0",
    ]
    if extra_args:
        cmd += shlex.split(extra_args)
    cmd.append(url)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=CURL_TIMEOUT_SEC + 2)
    except subprocess.TimeoutExpired:
        return (False, 0, "", f"curl timeout after {CURL_TIMEOUT_SEC}s")
    except FileNotFoundError:
        return (False, 0, "", "curl not found in PATH")
    if result.returncode != 0:
        return (False, 0, "", f"curl exit {result.returncode}: {result.stderr.strip()[:200]}")

    out = result.stdout
    if "__HTTP_STATUS__:" not in out:
        return (False, 0, "", "curl did not return status marker")
    body, status_part = out.rsplit("\n__HTTP_STATUS__:", 1)
    try:
        status = int(status_part.strip())
    except ValueError:
        return (False, 0, body, f"could not parse status: {status_part!r}")

    expected_status = smoke.get("expected_status")
    expected_status_in = smoke.get("expected_status_in")
    expected_substring = smoke.get("expected_body_substring", "")

    if expected_status is not None:
        if status != expected_status:
            return (False, status, body, f"status {status} != expected {expected_status}")
    elif expected_status_in is not None:
        if status not in expected_status_in:
            return (False, status, body, f"status {status} not in {expected_status_in}")
    else:
        return (False, status, body, "no expected_status or expected_status_in defined")

    if expected_substring and expected_substring not in body:
        snippet = body[:80].replace("\n", " ")
        return (False, status, body, f"body missing {expected_substring!r} (got: {snippet!r})")

    return (True, status, body, None)


def verify_all(manifest, retry=False, route_filter=None):
    """Verify every route in the manifest. Returns (all_green, results_list)."""
    base_url = manifest["_meta"]["base_url"]
    routes = manifest["routes"]
    if route_filter:
        routes = [r for r in routes if r["id"] == route_filter]
        if not routes:
            print(red(f"FATAL: route id {route_filter!r} not found in manifest"), file=sys.stderr)
            sys.exit(2)

    pending = list(routes)
    results = []
    deadline = time.time() + RETRY_MAX_WAIT_SEC if retry else None

    while pending:
        batch = pending
        pending = []
        for route in batch:
            passed, status, body, err = run_smoke(route, base_url)
            results.append({
                "id": route["id"],
                "method": route["method"],
                "url_path": route["url_path"],
                "owner": route["owner"],
                "passed": passed,
                "status": status,
                "error": err,
            })
            if not passed and deadline is not None and time.time() < deadline:
                pending.append(route)
                # Remove from results — we'll re-add on retry
                results.pop()
        if pending and deadline is not None and time.time() < deadline:
            wait = min(RETRY_INTERVAL_SEC, max(0, deadline - time.time()))
            if wait > 0:
                time.sleep(wait)

    all_green = all(r["passed"] for r in results)
    return all_green, results


def print_table(results, manifest):
    """Print a green/red status table."""
    base = manifest["_meta"]["base_url"]
    print()
    print(bold(f"verify-prod  {base}  ({datetime.now().isoformat(timespec='seconds')})"))
    print(dim("=" * 80))
    width_id = max(len(r["id"]) for r in results) + 2
    width_method = 6
    width_path = max(len(r["url_path"]) for r in results) + 2
    for r in results:
        if r["passed"]:
            mark = green("[ OK ]")
            status_str = green(str(r["status"]))
            err_str = ""
        else:
            mark = red("[FAIL]")
            status_str = red(str(r["status"]))
            err_str = "  " + red(r["error"] or "")
        print(f"  {mark}  {r['id']:<{width_id}} {r['method']:<{width_method}} {r['url_path']:<{width_path}} {status_str}{err_str}")
    print(dim("=" * 80))
    passed = sum(1 for r in results if r["passed"])
    total = len(results)
    summary = f"{passed}/{total} routes green"
    if passed == total:
        print(green(bold(f"  PASS  {summary}")))
    else:
        print(red(bold(f"  FAIL  {summary}")))
    print()


def main():
    p = argparse.ArgumentParser(description="Production smoke test for myaibrain.org")
    p.add_argument("--retry", action="store_true", help="Retry failures up to 60s (post-deploy use)")
    p.add_argument("--json", action="store_true", help="Output JSON instead of human table")
    p.add_argument("--route", help="Test only one route by id")
    args = p.parse_args()

    manifest = load_manifest()
    all_green, results = verify_all(manifest, retry=args.retry, route_filter=args.route)

    if args.json:
        print(json.dumps({
            "timestamp": datetime.now().isoformat(),
            "base_url": manifest["_meta"]["base_url"],
            "all_green": all_green,
            "passed": sum(1 for r in results if r["passed"]),
            "total": len(results),
            "results": results,
        }, indent=2))
    else:
        print_table(results, manifest)

    sys.exit(0 if all_green else 1)


if __name__ == "__main__":
    main()
