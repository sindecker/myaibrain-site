#!/usr/bin/env bash
# AIBrain one-line installer (macOS / Linux / WSL)
#
# Usage:
#     curl -sSL https://myaibrain.org/install | sh
#     curl -sSL https://myaibrain.org/install.sh | sh
#
# What it does (honestly):
#   1. Detects OS (macOS / Linux / WSL) and refuses on unsupported platforms.
#   2. Finds a Python >= 3.10 on PATH (python3 / python / python3.11 / ...).
#   3. Creates an isolated venv at ~/.aibrain (override with AIBRAIN_HOME).
#   4. pip installs / upgrades the `aibrain` package from PyPI.
#   5. Symlinks the `aibrain` CLI into /usr/local/bin (or ~/.local/bin fallback).
#   6. Idempotent — re-running upgrades the existing install in place.
#
# It does NOT:
#   - Install Python for you.
#   - Touch any system Python site-packages.
#   - Run `aibrain setup` automatically (run it yourself after install).

set -eu

AIBRAIN_HOME="${AIBRAIN_HOME:-$HOME/.aibrain}"
VENV_DIR="$AIBRAIN_HOME/venv"
BIN_CANDIDATES=("/usr/local/bin" "$HOME/.local/bin")

say()  { printf '  %s\n' "$*"; }
die()  { printf '  ERROR: %s\n' "$*" >&2; exit 1; }

printf '\n'
printf '  AIBrain installer\n'
printf '  -----------------\n'
printf '\n'

# --- 1. OS detection ---------------------------------------------------------
uname_s="$(uname -s 2>/dev/null || echo unknown)"
case "$uname_s" in
    Darwin)          OS="macos" ;;
    Linux)
        if grep -qiE '(microsoft|wsl)' /proc/version 2>/dev/null; then
            OS="wsl"
        else
            OS="linux"
        fi ;;
    *)               die "Unsupported OS: $uname_s (macOS / Linux / WSL only). On Windows, use install.ps1." ;;
esac
say "Platform: $OS"

# --- 2. Python >= 3.10 -------------------------------------------------------
PYTHON=""
for candidate in python3.13 python3.12 python3.11 python3.10 python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
        ver="$("$candidate" -c 'import sys;print("%d.%d"%sys.version_info[:2])' 2>/dev/null || echo 0.0)"
        major="${ver%%.*}"
        minor="${ver##*.}"
        if [ "$major" -eq 3 ] && [ "$minor" -ge 10 ] 2>/dev/null; then
            PYTHON="$candidate"
            say "Python: $candidate ($ver)"
            break
        fi
    fi
done
[ -n "$PYTHON" ] || die "Python 3.10+ not found. Install from https://python.org/downloads/ then rerun."

# --- 3. Create / reuse isolated venv -----------------------------------------
mkdir -p "$AIBRAIN_HOME"
if [ -x "$VENV_DIR/bin/python" ]; then
    say "Reusing venv at $VENV_DIR"
else
    say "Creating venv at $VENV_DIR"
    "$PYTHON" -m venv "$VENV_DIR" || die "venv creation failed. On Debian/Ubuntu: sudo apt install python3-venv"
fi

# --- 4. pip install / upgrade aibrain ----------------------------------------
say "Installing aibrain from PyPI..."
"$VENV_DIR/bin/python" -m pip install --quiet --upgrade pip
"$VENV_DIR/bin/python" -m pip install --quiet --upgrade aibrain

VERSION="$("$VENV_DIR/bin/python" -m pip show aibrain 2>/dev/null | awk '/^Version:/ {print $2}')"
[ -n "$VERSION" ] || VERSION="unknown"
say "Installed aibrain $VERSION"

# --- 5. Symlink CLI ----------------------------------------------------------
CLI_SRC="$VENV_DIR/bin/aibrain"
[ -x "$CLI_SRC" ] || die "aibrain CLI missing at $CLI_SRC after install."

LINK_DIR=""
for dir in "${BIN_CANDIDATES[@]}"; do
    if [ -d "$dir" ] && [ -w "$dir" ]; then
        LINK_DIR="$dir"; break
    fi
done
if [ -z "$LINK_DIR" ] && [ -d /usr/local/bin ]; then
    # Try sudo-less alternative: create ~/.local/bin
    mkdir -p "$HOME/.local/bin" && LINK_DIR="$HOME/.local/bin"
fi

if [ -n "$LINK_DIR" ]; then
    ln -sf "$CLI_SRC" "$LINK_DIR/aibrain"
    say "Linked: $LINK_DIR/aibrain -> $CLI_SRC"
    case ":$PATH:" in
        *":$LINK_DIR:"*) ;;
        *) say "Note: $LINK_DIR is not on PATH. Add: export PATH=\"$LINK_DIR:\$PATH\"" ;;
    esac
else
    say "Note: could not write to /usr/local/bin or ~/.local/bin. Run directly: $CLI_SRC"
fi

printf '\n'
printf '  Done. Next steps:\n'
printf '      aibrain setup      # interactive configuration\n'
printf '      aibrain serve      # start the dashboard at http://localhost:8001\n'
printf '\n'
printf '  Upgrade any time by re-running this installer.\n'
printf '\n'
