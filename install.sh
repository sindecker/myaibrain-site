#!/usr/bin/env bash
# aibrain installer for macOS / Linux
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/DeckerOps/aibrain/main/scripts/install.sh | bash
#
# Optional auto-setup:
#   AIBRAIN_AUTO_SETUP=1 bash <(curl -fsSL https://raw.githubusercontent.com/DeckerOps/aibrain/main/scripts/install.sh)

set -euo pipefail

# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "\n${CYAN}>>> $*${NC}"; }
ok()   { echo -e "    ${GREEN}[OK]${NC} $*"; }
warn() { echo -e "    ${YELLOW}[!] ${NC} $*"; }
fail() { echo -e "\n${RED}[FAIL]${NC} $*"; }

# Returns 0 if version string ($1) is >= 3.10
version_ge_310() {
    local ver="$1"
    local major minor
    major=$(echo "$ver" | cut -d. -f1)
    minor=$(echo "$ver" | cut -d. -f2)
    if [ "$major" -gt 3 ]; then return 0; fi
    if [ "$major" -eq 3 ] && [ "$minor" -ge 10 ]; then return 0; fi
    return 1
}

get_python_version() {
    local exe="$1"
    "$exe" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true
}

# --------------------------------------------------------------------------- #
# STEP 1: Detect Python 3.10+
# --------------------------------------------------------------------------- #

step "Detecting Python 3.10+ ..."

PYTHON_EXE=""
for cand in python3 python py; do
    if command -v "$cand" >/dev/null 2>&1; then
        ver=$(get_python_version "$cand")
        if [ -n "$ver" ] && version_ge_310 "$ver"; then
            PYTHON_EXE="$cand"
            ok "Found: '$cand' (Python $ver)"
            break
        elif [ -n "$ver" ]; then
            warn "'$cand' found but version $ver is below 3.10 -- skipping"
        fi
    fi
done

if [ -z "$PYTHON_EXE" ]; then
    fail "Python 3.10+ not found."
    echo ""
    echo "  Please install Python 3.11+ and re-run this script:"
    echo ""
    if [[ "${OSTYPE:-}" == "darwin"* ]]; then
        echo "    macOS (Homebrew):"
        echo "      brew install python@3.11"
    else
        echo "    Ubuntu/Debian:"
        echo "      sudo apt update && sudo apt install python3.11 python3-pip"
        echo ""
        echo "    Fedora/RHEL:"
        echo "      sudo dnf install python3.11"
    fi
    echo ""
    echo "    Or download from: https://www.python.org/downloads/"
    exit 1
fi

# --------------------------------------------------------------------------- #
# STEP 2: pip install aibrain
# --------------------------------------------------------------------------- #

step "Installing aibrain via pip ..."

if ! "$PYTHON_EXE" -m pip install -U aibrain; then
    fail "pip install failed."
    echo ""
    echo "  Try manually:"
    echo "    $PYTHON_EXE -m pip install -U aibrain"
    echo ""
    echo "  If pip is missing:"
    echo "    $PYTHON_EXE -m ensurepip --upgrade"
    exit 1
fi

ok "pip install succeeded"

# --------------------------------------------------------------------------- #
# STEP 3: Locate Scripts / bin directory
# --------------------------------------------------------------------------- #

step "Locating Python bin directory ..."

SCRIPTS_DIR=""
SCRIPTS_DIR=$("$PYTHON_EXE" -c "import sysconfig; print(sysconfig.get_path('scripts'))") || true

if [ -z "$SCRIPTS_DIR" ]; then
    fail "Could not determine Python scripts directory."
    exit 1
fi

ok "Scripts dir: $SCRIPTS_DIR"

# --------------------------------------------------------------------------- #
# STEP 4: Add to PATH in shell rc files
# --------------------------------------------------------------------------- #

step "Updating PATH in shell startup files ..."

PATH_LINE="export PATH=\"\$PATH:$SCRIPTS_DIR\""
MARKER="# Added by aibrain installer"

# Collect rc files to update
RC_FILES=()
[ -f "$HOME/.bashrc" ]  && RC_FILES+=("$HOME/.bashrc")
[ -f "$HOME/.zshrc" ]   && RC_FILES+=("$HOME/.zshrc")
# Fallback: bash_profile when no .bashrc (common on macOS)
[ -f "$HOME/.bash_profile" ] && [ ! -f "$HOME/.bashrc" ] && RC_FILES+=("$HOME/.bash_profile")
# If nothing exists yet, default to .bashrc
[ ${#RC_FILES[@]} -eq 0 ] && RC_FILES+=("$HOME/.bashrc")

for rc in "${RC_FILES[@]}"; do
    if grep -qF "$SCRIPTS_DIR" "$rc" 2>/dev/null; then
        ok "Already present in $rc -- no change"
    else
        printf '\n%s\n%s\n' "$MARKER" "$PATH_LINE" >> "$rc"
        ok "Added to $rc"
    fi
done

# Refresh the current session immediately
export PATH="$PATH:$SCRIPTS_DIR"
ok "Refreshed current session PATH"

# --------------------------------------------------------------------------- #
# STEP 5: Verify aibrain command
# --------------------------------------------------------------------------- #

step "Verifying aibrain installation ..."

VERIFIED=0
if command -v aibrain >/dev/null 2>&1; then
    VERSION_OUT=$(aibrain --version 2>&1 || true)
    ok "aibrain --version: $VERSION_OUT"
    VERIFIED=1
else
    AIBRAIN_FULL="$SCRIPTS_DIR/aibrain"
    if [ -f "$AIBRAIN_FULL" ]; then
        VERSION_OUT=$("$AIBRAIN_FULL" --version 2>&1 || true)
        ok "aibrain --version (full path): $VERSION_OUT"
        VERIFIED=1
    fi
fi

if [ "$VERIFIED" -eq 0 ]; then
    warn "Could not run 'aibrain --version' in this session."
    echo ""
    echo "  aibrain IS installed. Run via full path until you open a new shell:"
    echo "    $SCRIPTS_DIR/aibrain"
    echo ""
    echo "  Or reload your shell:"
    echo "    source ~/.bashrc   # or: source ~/.zshrc"
fi

# --------------------------------------------------------------------------- #
# STEP 6: Optional auto-setup
# --------------------------------------------------------------------------- #

RUN_SETUP="${AIBRAIN_AUTO_SETUP:-0}"

if [ "$RUN_SETUP" = "1" ]; then
    step "Running aibrain setup --yes ..."
    if [ "$VERIFIED" -eq 1 ]; then
        aibrain setup --yes || warn "Setup had an issue. Run 'aibrain setup' manually."
    else
        "$SCRIPTS_DIR/aibrain" setup --yes || warn "Setup had an issue. Run 'aibrain setup' manually."
    fi
else
    echo ""
    echo -e "  ${CYAN}Run 'aibrain setup' to complete installation.${NC}"
fi

# --------------------------------------------------------------------------- #
# Done
# --------------------------------------------------------------------------- #

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  aibrain installed successfully!${NC}"
if [ "$VERIFIED" -eq 1 ]; then
    echo -e "${GREEN}  'aibrain' command is ready in this shell.${NC}"
else
    echo -e "${GREEN}  Open a new terminal or run 'source ~/.bashrc' to use 'aibrain'.${NC}"
fi
echo -e "${GREEN}========================================${NC}"
echo ""
