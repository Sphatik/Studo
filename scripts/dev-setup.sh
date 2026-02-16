#!/bin/bash

# Studo Bot - Development Environment Setup Script
# This script installs pre-commit hooks and development dependencies

set -e  # Exit on error

# ANSI Color codes for rich terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# Unicode symbols
CHECK_MARK="✓"
CROSS_MARK="✗"
ARROW="→"
GEAR="⚙"
ROCKET="🚀"
PACKAGE="📦"
HOOK="🪝"
SHIELD="🛡"

print_header() {
  echo -e "\n${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}${CYAN}  $1${RESET}"
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
}

print_success() {
  echo -e "${GREEN}${CHECK_MARK}${RESET} $1"
}

print_error() {
  echo -e "${RED}${CROSS_MARK}${RESET} $1"
}

print_warning() {
  echo -e "${YELLOW}⚠${RESET}  $1"
}

print_info() {
  echo -e "${BLUE}${ARROW}${RESET} $1"
}

print_step() {
  echo -e "${MAGENTA}${GEAR}${RESET} $1"
}

# Detect OS
detect_os() {
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if grep -qi microsoft /proc/version 2>/dev/null; then
      echo "wsl"
    else
      echo "linux"
    fi
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macos"
  else
    echo "unknown"
  fi
}

# Check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Main setup function
main() {
  clear
  echo -e "${BOLD}${ROCKET}  ${MAGENTA}Studo Bot - Development Setup${RESET}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""

  OS_TYPE=$(detect_os)
  print_info "Detected OS: ${BOLD}$OS_TYPE${RESET}"
  echo ""

  # Step 1: Check Node.js and npm
  print_header "1. Checking Node.js Environment"
  
  if ! command_exists node; then
    print_error "Node.js is not installed"
    echo -e "   Please install Node.js from https://nodejs.org/"
    exit 1
  fi
  
  if ! command_exists npm; then
    print_error "npm is not installed"
    echo -e "   Please install npm"
    exit 1
  fi
  
  NODE_VERSION=$(node --version)
  NPM_VERSION=$(npm --version)
  print_success "Node.js ${BOLD}$NODE_VERSION${RESET} installed"
  print_success "npm ${BOLD}$NPM_VERSION${RESET} installed"
  echo ""

  # Step 2: Check/Install pre-commit
  print_header "2. Setting up pre-commit Framework"
  
  if command_exists pre-commit; then
    PRECOMMIT_VERSION=$(pre-commit --version | awk '{print $2}')
    print_success "pre-commit ${BOLD}$PRECOMMIT_VERSION${RESET} already installed"
  else
    print_warning "pre-commit not found, attempting to install..."
    
    # Try to install via pip/pip3
    if command_exists pip3; then
      print_step "Installing pre-commit via pip3..."
      if pip3 install pre-commit --user; then
        print_success "pre-commit installed successfully via pip3"
        
        # Add user bin to PATH if needed
        export PATH="$HOME/.local/bin:$PATH"
        
        if command_exists pre-commit; then
          PRECOMMIT_VERSION=$(pre-commit --version | awk '{print $2}')
          print_success "pre-commit ${BOLD}$PRECOMMIT_VERSION${RESET} is now available"
        fi
      else
        print_error "Failed to install pre-commit via pip3"
      fi
    elif command_exists pip; then
      print_step "Installing pre-commit via pip..."
      if pip install pre-commit --user; then
        print_success "pre-commit installed successfully via pip"
        
        # Add user bin to PATH if needed
        export PATH="$HOME/.local/bin:$PATH"
        
        if command_exists pre-commit; then
          PRECOMMIT_VERSION=$(pre-commit --version | awk '{print $2}')
          print_success "pre-commit ${BOLD}$PRECOMMIT_VERSION${RESET} is now available"
        fi
      else
        print_error "Failed to install pre-commit via pip"
      fi
    elif [[ "$OS_TYPE" == "macos" ]] && command_exists brew; then
      print_step "Installing pre-commit via Homebrew..."
      if brew install pre-commit; then
        print_success "pre-commit installed successfully via Homebrew"
      else
        print_error "Failed to install pre-commit via Homebrew"
      fi
    else
      print_error "Could not automatically install pre-commit"
      echo ""
      echo -e "${YELLOW}${BOLD}Manual Installation Required:${RESET}"
      echo -e "  Please install pre-commit manually:"
      echo -e "    ${CYAN}pip3 install pre-commit${RESET}  (if you have Python/pip)"
      echo -e "    ${CYAN}brew install pre-commit${RESET}  (on macOS with Homebrew)"
      echo ""
      echo -e "  Then run this script again: ${CYAN}npm run dev-setup${RESET}"
      exit 1
    fi
    
    if ! command_exists pre-commit; then
      print_error "pre-commit installation failed or not in PATH"
      echo ""
      echo -e "${YELLOW}${BOLD}Troubleshooting:${RESET}"
      echo -e "  1. Ensure Python and pip are installed"
      echo -e "  2. Try: ${CYAN}pip3 install --user pre-commit${RESET}"
      echo -e "  3. Add to PATH: ${CYAN}export PATH=\"\$HOME/.local/bin:\$PATH\"${RESET}"
      echo -e "  4. Restart your terminal and run: ${CYAN}npm run dev-setup${RESET}"
      exit 1
    fi
  fi
  echo ""

  # Step 3: Install npm dependencies
  print_header "3. Installing npm Dependencies"
  
  print_step "Installing ESLint and Prettier..."
  if npm install; then
    print_success "npm dependencies installed successfully"
  else
    print_error "Failed to install npm dependencies"
    exit 1
  fi
  echo ""

  # Step 4: Install pre-commit hooks
  print_header "4. Installing Git Hooks"
  
  if [ ! -d ".git" ]; then
    print_error "Not a git repository"
    echo -e "   Initialize git first: ${CYAN}git init${RESET}"
    exit 1
  fi
  
  print_step "Installing pre-commit hooks into .git/hooks/..."
  if pre-commit install; then
    print_success "Git hooks installed successfully"
  else
    print_error "Failed to install pre-commit hooks"
    exit 1
  fi
  
  # Initialize secrets baseline if it doesn't exist
  if [ ! -f ".secrets.baseline" ]; then
    print_step "Creating secrets baseline..."
    if detect-secrets scan --baseline .secrets.baseline > /dev/null 2>&1; then
      print_success "Secrets baseline created"
    else
      print_warning "Could not create secrets baseline (will be created on first commit)"
    fi
  fi
  echo ""

  # Step 5: Validate setup
  print_header "5. Validating Setup"
  
  print_step "Running hook validation..."
  
  # Check if hooks are installed
  if [ -f ".git/hooks/pre-commit" ]; then
    print_success "pre-commit hook installed in .git/hooks/"
  else
    print_error "pre-commit hook file not found"
  fi
  
  # Check configuration
  if [ -f ".pre-commit-config.yaml" ]; then
    print_success "pre-commit configuration found"
  else
    print_error "pre-commit configuration missing"
  fi
  
  if [ -f ".eslintrc.json" ]; then
    print_success "ESLint configuration found"
  else
    print_error "ESLint configuration missing"
  fi
  
  if [ -f ".prettierrc.json" ]; then
    print_success "Prettier configuration found"
  else
    print_error "Prettier configuration missing"
  fi
  
  echo ""
  print_step "Testing pre-commit hooks..."
  if pre-commit run --all-files > /dev/null 2>&1; then
    print_success "All hooks passed validation"
  else
    print_warning "Some hooks may have made changes or need attention"
    echo -e "   ${CYAN}This is normal for first-time setup${RESET}"
  fi
  echo ""

  # Final summary
  print_header "Setup Complete!"
  
  echo -e "${GREEN}${BOLD}${CHECK_MARK} Development environment is ready!${RESET}\n"
  
  echo -e "${BOLD}Installed Components:${RESET}"
  echo -e "  ${SHIELD} pre-commit framework"
  echo -e "  ${PACKAGE} ESLint (JavaScript linting)"
  echo -e "  ${PACKAGE} Prettier (code formatting)"
  echo -e "  ${HOOK} Git hooks (automatic checks on commit)"
  echo ""
  
  echo -e "${BOLD}Available Commands:${RESET}"
  echo -e "  ${CYAN}npm run lint${RESET}          - Run ESLint on src/"
  echo -e "  ${CYAN}npm run lint:fix${RESET}      - Run ESLint and fix issues"
  echo -e "  ${CYAN}npm run format${RESET}        - Format all files with Prettier"
  echo -e "  ${CYAN}npm run format:check${RESET}  - Check formatting without changes"
  echo -e "  ${CYAN}npm run precommit${RESET}     - Manually run all pre-commit hooks"
  echo ""
  
  echo -e "${BOLD}What Happens on Commit:${RESET}"
  echo -e "  ${ARROW} Trailing whitespace removal"
  echo -e "  ${ARROW} End-of-file fixes"
  echo -e "  ${ARROW} YAML/JSON validation"
  echo -e "  ${ARROW} Merge conflict detection"
  echo -e "  ${ARROW} Large file prevention"
  echo -e "  ${ARROW} Secret/credential detection"
  echo -e "  ${ARROW} ESLint checks"
  echo -e "  ${ARROW} Prettier formatting"
  echo ""
  
  echo -e "${GREEN}${BOLD}You're all set! Happy coding! ${ROCKET}${RESET}\n"
}

# Run main function
main
