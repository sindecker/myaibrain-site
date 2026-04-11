#!/usr/bin/env python3
"""
verify-public.py — Public-content drift detector for AIBrain marketing surface.

Reads public_artifacts.json and verifies that every public-facing content
artifact (README, CHANGELOG, marketing page) reflects the current product
state per aibrain_live_truth_v1_4_0.md.

For each artifact:
  1. Fetch its URL (raw.githubusercontent.com for repos, live URL for the
     landing page)
  2. Assert every `must_contain` substring is present
  3. Assert every `must_not_contain` substring is absent
  4. Print a green/red table

Exit codes:
    0 — every artifact is current
    1 — one or more artifacts are stale
    2 — manifest file missing or invalid
    3 — verify-public itself failed (network down, etc)

This is the second half of the structural fix for "stale public content sat
on the internet for 5 days while production moved" — verify-prod catches
broken customer routes, verify-public catches outdated marketing content.
Both run on the same 15-minute GitHub Action cron and Telegram-page on red.

Usage:
    python verify-public.py             # one-shot, exit 0 if all green
    python verify-public.py --json      # JSON output for programmatic use
    python verify-public.py --artifact sindecker_aibrain_readme  # one only
"""

import argparse
import json
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

MANIFEST_PATH = Path(__file__).parent / "public_artifacts.json"
FETCH_TIMEOUT_SEC = 15


def _is_tty():
    return sys.stdout.isatty()

def _color(code, s):
    if not _is_tty():
        return s
    return f"\033[{code}m{s}\033[0m"

def green(s): return _color("32", s)
def red(s):   return _color("31", s)
def yellow(s):return _color("33", s)
def bold(s):  return _color("1", s)
def dim(s):   return _color("2", s)


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


def fetch_url(url):
    """Fetch a URL and return (body_text, error_msg). Body is None on error."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "verify-public/1.0 (+https://myaibrain.org)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT_SEC) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return (body, None)
    except urllib.error.HTTPError as e:
        return (None, f"HTTP {e.code}")
    except urllib.error.URLError as e:
        return (None, f"URLError: {e.reason}")
    except Exception as e:
        return (None, f"{type(e).__name__}: {e}")


def check_artifact(artifact):
    """Check one artifact. Returns dict with id, passed, errors[]."""
    if artifact.get("skip_until_populated"):
        return {
            "id": artifact["id"],
            "passed": True,
            "skipped": True,
            "errors": [],
            "url": artifact["url"],
        }
    body, fetch_err = fetch_url(artifact["url"])
    if fetch_err:
        return {
            "id": artifact["id"],
            "passed": False,
            "skipped": False,
            "errors": [f"fetch failed: {fetch_err}"],
            "url": artifact["url"],
        }

    errors = []
    for needle in artifact.get("must_contain", []):
        if needle not in body:
            errors.append(f"missing required: {needle!r}")
    for needle in artifact.get("must_not_contain", []):
        if needle in body:
            errors.append(f"contains stale:  {needle!r}")

    return {
        "id": artifact["id"],
        "passed": len(errors) == 0,
        "skipped": False,
        "errors": errors,
        "url": artifact["url"],
    }


def verify_all(manifest, artifact_filter=None):
    artifacts = manifest["artifacts"]
    if artifact_filter:
        artifacts = [a for a in artifacts if a["id"] == artifact_filter]
        if not artifacts:
            print(red(f"FATAL: artifact id {artifact_filter!r} not found in manifest"), file=sys.stderr)
            sys.exit(2)

    results = [check_artifact(a) for a in artifacts]
    all_green = all(r["passed"] for r in results)
    return all_green, results


def print_table(results, manifest):
    print()
    print(bold(f"verify-public  ({datetime.now().isoformat(timespec='seconds')})"))
    print(dim(f"  current version (per live truth): {manifest['_meta']['current_version']}"))
    print(dim("=" * 80))
    width_id = max(len(r["id"]) for r in results) + 2
    for r in results:
        if r.get("skipped"):
            mark = yellow("[SKIP]")
        elif r["passed"]:
            mark = green("[ OK ]")
        else:
            mark = red("[FAIL]")
        print(f"  {mark}  {r['id']:<{width_id}} {dim(r['url'])}")
        for err in r["errors"]:
            print(f"         {red('· ' + err)}")
    print(dim("=" * 80))
    passed = sum(1 for r in results if r["passed"])
    total = len(results)
    if passed == total:
        print(green(bold(f"  PASS  {passed}/{total} public artifacts current")))
    else:
        print(red(bold(f"  FAIL  {passed}/{total} public artifacts current")))
    print()


def main():
    p = argparse.ArgumentParser(description="Public content drift detector for AIBrain marketing surface")
    p.add_argument("--json", action="store_true", help="Output JSON instead of human table")
    p.add_argument("--artifact", help="Test only one artifact by id")
    args = p.parse_args()

    manifest = load_manifest()
    all_green, results = verify_all(manifest, artifact_filter=args.artifact)

    if args.json:
        print(json.dumps({
            "timestamp": datetime.now().isoformat(),
            "current_version": manifest["_meta"]["current_version"],
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
