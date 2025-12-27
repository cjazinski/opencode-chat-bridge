#!/bin/bash
#
# Install OpenCode Chat Bridge systemd services
#
# Usage: ./install-services.sh [--uninstall]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Detect paths
OPENCODE_PATH=$(which opencode 2>/dev/null || echo "")
NODE_PATH=$(which node 2>/dev/null || echo "")
CURRENT_PATH="$PATH"

# Use user services (no sudo required)
SYSTEMD_DIR="$HOME/.config/systemd/user"
SYSTEMCTL="systemctl --user"

uninstall_services() {
    echo "=== Uninstalling OpenCode Chat Bridge Services ==="
    echo ""
    
    info "Stopping services..."
    $SYSTEMCTL stop opencode-chat-bridge.service 2>/dev/null || true
    $SYSTEMCTL stop opencode-server.service 2>/dev/null || true
    
    info "Disabling services..."
    $SYSTEMCTL disable opencode-chat-bridge.service 2>/dev/null || true
    $SYSTEMCTL disable opencode-server.service 2>/dev/null || true
    
    info "Removing service files..."
    rm -f "$SYSTEMD_DIR/opencode-server.service"
    rm -f "$SYSTEMD_DIR/opencode-chat-bridge.service"
    
    info "Reloading systemd..."
    $SYSTEMCTL daemon-reload
    
    echo ""
    info "Uninstall complete!"
}

install_services() {
    echo "=== OpenCode Chat Bridge Service Installer ==="
    echo ""
    
    mkdir -p "$SYSTEMD_DIR"
    info "Installing user services to $SYSTEMD_DIR"
    
    # Check prerequisites
    echo ""
    info "Checking prerequisites..."
    
    if [ ! -f "$PROJECT_DIR/.env" ]; then
        error ".env file not found at $PROJECT_DIR/.env"
        echo "  Please copy .env.example to .env and configure it first."
        exit 1
    fi
    echo "  - .env file found"
    
    if [ ! -d "$PROJECT_DIR/dist" ]; then
        error "dist/ directory not found. Please run 'npm run build' first."
        exit 1
    fi
    echo "  - dist/ directory found"
    
    if [ -z "$OPENCODE_PATH" ]; then
        error "opencode command not found in PATH"
        exit 1
    fi
    echo "  - opencode found at $OPENCODE_PATH"
    
    if [ -z "$NODE_PATH" ]; then
        error "node command not found in PATH"
        exit 1
    fi
    echo "  - node found at $NODE_PATH"
    
    # Generate service files with correct paths
    echo ""
    info "Generating service files..."
    
    # OpenCode Server service
    cat > "$SYSTEMD_DIR/opencode-server.service" << EOF
[Unit]
Description=OpenCode Server (Headless)
Documentation=https://opencode.ai/docs/server
After=network.target

[Service]
Type=simple

# Working directory - default project location
WorkingDirectory=$HOME/projects

# Environment setup
Environment="HOME=$HOME"
Environment="PATH=$CURRENT_PATH"

# Start OpenCode server on localhost, port 4096
ExecStart=$OPENCODE_PATH serve --hostname 127.0.0.1 --port 4096

# Restart on failure
Restart=on-failure
RestartSec=5

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=opencode-server

[Install]
WantedBy=default.target
EOF
    echo "  - Created opencode-server.service"
    
    # Chat Bridge service
    cat > "$SYSTEMD_DIR/opencode-chat-bridge.service" << EOF
[Unit]
Description=OpenCode Chat Bridge (Telegram Bot)
Documentation=https://github.com/jazinski/opencode-chat-bridge
After=network.target opencode-server.service
Wants=opencode-server.service

[Service]
Type=simple

# Working directory
WorkingDirectory=$PROJECT_DIR

# Environment setup
Environment="HOME=$HOME"
Environment="PATH=$CURRENT_PATH"
Environment="NODE_ENV=production"

# Load environment from .env file
EnvironmentFile=$PROJECT_DIR/.env

# Connect to the OpenCode server service
Environment="OPENCODE_SERVER_URL=http://127.0.0.1:4096"

# Start the chat bridge
ExecStart=$NODE_PATH $PROJECT_DIR/dist/index.js

# Restart on failure
Restart=on-failure
RestartSec=5

# Give OpenCode server time to start
ExecStartPre=/bin/sleep 2

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=opencode-chat-bridge

[Install]
WantedBy=default.target
EOF
    echo "  - Created opencode-chat-bridge.service"
    
    # Reload systemd
    echo ""
    info "Reloading systemd..."
    $SYSTEMCTL daemon-reload
    
    # Enable services
    echo ""
    info "Enabling services..."
    $SYSTEMCTL enable opencode-server.service
    $SYSTEMCTL enable opencode-chat-bridge.service
    
    echo ""
    echo "=== Installation Complete ==="
    echo ""
    echo "Services installed but NOT started. Commands:"
    echo ""
    echo "  Start services:"
    echo "    systemctl --user start opencode-server opencode-chat-bridge"
    echo ""
    echo "  Stop services:"
    echo "    systemctl --user stop opencode-chat-bridge opencode-server"
    echo ""
    echo "  Check status:"
    echo "    systemctl --user status opencode-server opencode-chat-bridge"
    echo ""
    echo "  View logs:"
    echo "    journalctl --user -u opencode-server -f"
    echo "    journalctl --user -u opencode-chat-bridge -f"
    echo ""
    echo "  Restart after code changes:"
    echo "    npm run build && systemctl --user restart opencode-chat-bridge"
    echo ""
    warn "For services to run at boot (without login), enable linger:"
    echo "    sudo loginctl enable-linger $USER"
    echo ""
}

# Main
case "${1:-}" in
    --uninstall|-u)
        uninstall_services
        ;;
    --help|-h)
        echo "Usage: $0 [--uninstall]"
        echo ""
        echo "Options:"
        echo "  --uninstall, -u   Remove installed services"
        echo "  --help, -h        Show this help"
        ;;
    *)
        install_services
        ;;
esac
