#!/bin/bash

# install-local.sh - Install local development version of Gemini CLI
# This script builds and installs the local version for testing

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Determine the project directory
PROJECT_DIR=$(cd "$(dirname "$0")" && pwd)

echo -e "${BLUE}🔧 Gemini CLI Local Installation Script${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Check if we're in the right directory
if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
    echo -e "${RED}❌ Error: package.json not found. Please run this script from the gemini-cli project root.${NC}"
    exit 1
fi

# Check if this is the gemini-cli project
if ! grep -q '"@google/gemini-cli"' "$PROJECT_DIR/package.json"; then
    echo -e "${RED}❌ Error: This doesn't appear to be the gemini-cli project.${NC}"
    exit 1
fi

echo -e "${YELLOW}📍 Project directory: $PROJECT_DIR${NC}"
echo ""

# Step 1: Clean previous builds
echo -e "${BLUE}🧹 Step 1: Cleaning previous builds...${NC}"
npm run clean
echo ""

# Step 2: Install dependencies
echo -e "${BLUE}📦 Step 2: Installing dependencies...${NC}"
npm ci
echo ""

# Step 3: Build the project
echo -e "${BLUE}🔨 Step 3: Building the project...${NC}"
npm run build
echo ""

# Step 4: Create bundle
echo -e "${BLUE}📦 Step 4: Creating bundle...${NC}"
npm run bundle
echo ""

# Step 5: Install globally via npm link
echo -e "${BLUE}🔗 Step 5: Linking to global npm...${NC}"

# Unlink any existing version first
if command -v gemini &> /dev/null; then
    echo -e "${YELLOW}⚠️  Existing gemini installation found. Unlinking...${NC}"
    npm unlink -g @google/gemini-cli 2>/dev/null || true
fi

# Link the local version
npm link
echo ""

# Step 6: Verify installation
echo -e "${BLUE}✅ Step 6: Verifying installation...${NC}"

if command -v gemini &> /dev/null; then
    GEMINI_PATH=$(which gemini)
    echo -e "${GREEN}✅ gemini command available at: $GEMINI_PATH${NC}"
    
    # Test basic functionality
    echo -e "${BLUE}🧪 Testing basic functionality...${NC}"
    if gemini --version &> /dev/null; then
        VERSION=$(gemini --version 2>/dev/null | head -1)
        echo -e "${GREEN}✅ Version check passed: $VERSION${NC}"
    else
        echo -e "${YELLOW}⚠️  Version check failed, but command is available${NC}"
    fi
else
    echo -e "${RED}❌ Error: gemini command not found after installation${NC}"
    echo -e "${YELLOW}💡 Try running: export PATH=\"\$PATH:\$(npm bin -g)\"${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 Installation completed successfully!${NC}"
echo ""
echo -e "${BLUE}📝 Usage:${NC}"
echo "  - Run: ${GREEN}gemini --hijack -m your-model --yolo${NC}"
echo "  - For think mode: ${GREEN}gemini --hijack -m your-model --think --yolo${NC}"
echo "  - Development mode: ${GREEN}npm start -- [args]${NC}"
echo ""
echo -e "${BLUE}🔧 Development notes:${NC}"
echo "  - Your local changes are now active globally"
echo "  - To uninstall: ${YELLOW}npm unlink -g @google/gemini-cli${NC}"
echo "  - To reinstall after changes: ${YELLOW}npm run build && npm link${NC}"
echo ""
echo -e "${BLUE}🐛 Testing features:${NC}"
echo "  - Qwen <no_think> mode: ${GREEN}Default (hidden reasoning)${NC}"
echo "  - Qwen think mode: ${GREEN}Use --think flag${NC}"
echo "  - Tool hijacking: ${GREEN}Enabled with HIJACK_FORCE_FUNCTION_CALLS=true${NC}"
echo ""