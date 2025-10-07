#!/bin/bash

###############################################################################
# CCOrch Deployment Script
#
# Purpose: Automated deployment with validation steps
# Usage: ./scripts/deploy.sh
#
# Steps:
# 1. Run database migrations
# 2. Run tests
# 3. Build application
# 4. Start server (or use PM2 if available)
#
# Exit on any failure for safety
###############################################################################

set -e  # Exit immediately if any command fails
set -u  # Exit if undefined variable is used
set -o pipefail  # Exit if any command in a pipeline fails

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Print banner
echo "================================================================================"
echo "  CCOrch Deployment Script"
echo "================================================================================"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    log_error ".env file not found!"
    log_info "Please create .env file from .env.example:"
    echo "    cp .env.example .env"
    exit 1
fi

log_success ".env file found"

# Check if node_modules exists
if [ ! -d node_modules ]; then
    log_warning "node_modules not found, running pnpm install..."
    pnpm install
    log_success "Dependencies installed"
fi

# Step 1: Run database migrations
log_info "Step 1/4: Running database migrations..."
pnpm prisma migrate deploy
log_success "Database migrations completed"

# Step 2: Run tests
log_info "Step 2/4: Running tests..."
pnpm test
log_success "All tests passed"

# Step 3: Build application
log_info "Step 3/4: Building application..."
pnpm build
log_success "Build completed"

# Step 4: Start server
log_info "Step 4/4: Starting server..."

# Check if PM2 is available
if command -v pm2 &> /dev/null; then
    log_info "PM2 detected, using PM2 for process management..."

    # Check if ecosystem.config.js exists
    if [ -f ecosystem.config.js ]; then
        log_info "Using ecosystem.config.js configuration"
        pm2 start ecosystem.config.js
    else
        log_warning "ecosystem.config.js not found, using default PM2 config"
        pm2 start dist/server.js --name ccorch
    fi

    log_success "Server started with PM2"
    log_info "View logs: pm2 logs ccorch"
    log_info "View status: pm2 status"
    log_info "Stop server: pm2 stop ccorch"
else
    log_info "PM2 not detected, starting server with pnpm..."
    log_warning "For production, consider using PM2 for process management"
    log_info "Install PM2: npm install -g pm2"

    # Start server in background
    pnpm start &
    SERVER_PID=$!

    # Wait a moment for server to start
    sleep 2

    # Check if server is still running
    if kill -0 $SERVER_PID 2>/dev/null; then
        log_success "Server started (PID: $SERVER_PID)"
        log_info "Server is running in background"
        log_info "View logs: tail -f logs/ccorch.log (if configured)"
        log_info "Stop server: kill $SERVER_PID"
    else
        log_error "Server failed to start"
        exit 1
    fi
fi

echo ""
echo "================================================================================"
echo "  Deployment Complete!"
echo "================================================================================"
echo ""
log_info "Next steps:"
echo "  1. Verify health: curl http://localhost:\${PORT:-3000}/health"
echo "  2. Check logs: pm2 logs ccorch (or tail logs/ccorch.log)"
echo "  3. Run smoke tests: see docs/06-testing-smoke-tests.md"
echo ""
