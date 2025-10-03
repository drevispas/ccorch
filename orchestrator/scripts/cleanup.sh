#!/bin/bash

# Orchestrator Cleanup Script
#
# This script removes temporary files and data from the orchestrator engine directories
# while preserving the directory structure for future use.
#
# Directories cleaned:
# - state/: All workflow state files and active/completed workflow data
# - logs/: All log files
# - alerts/: All alert files
# - archive/: All archived workflow data
#
# Usage: ./cleanup.sh [--dry-run] [--force] [--no-confirm]
#   --dry-run:    Show what would be deleted without actually deleting
#   --force:      Skip confirmation prompt
#   --no-confirm: Skip confirmation prompt (same as --force)

set -euo pipefail

# Script directory and engine root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_DIR="$(dirname "$SCRIPT_DIR")"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Flags
DRY_RUN=false
FORCE=false
NO_CONFIRM=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --no-confirm)
      NO_CONFIRM=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--force] [--no-confirm]"
      echo "  --dry-run:    Show what would be deleted without actually deleting"
      echo "  --force:      Skip confirmation prompt"
      echo "  --no-confirm: Skip confirmation prompt (same as --force)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Function to print colored output
print_status() {
  local color=$1
  local message=$2
  echo -e "${color}${message}${NC}"
}

# Function to remove files/directories
cleanup_directory() {
  local dir_path=$1
  local description=$2

  if [[ ! -d "$dir_path" ]]; then
    print_status "$YELLOW" "⚠️  Directory not found: $dir_path"
    return 0
  fi

  # Count files to be removed
  local file_count=0
  if [[ -n "$(find "$dir_path" -mindepth 1 -type f 2>/dev/null || true)" ]]; then
    file_count=$(find "$dir_path" -mindepth 1 -type f | wc -l)
  fi

  local subdir_count=0
  if [[ -n "$(find "$dir_path" -mindepth 1 -type d 2>/dev/null || true)" ]]; then
    subdir_count=$(find "$dir_path" -mindepth 1 -type d | wc -l)
  fi

  if [[ $file_count -eq 0 && $subdir_count -eq 0 ]]; then
    print_status "$BLUE" "📂 $description: Already clean (0 files, 0 subdirectories)"
    return 0
  fi

  print_status "$YELLOW" "📂 $description: $file_count files, $subdir_count subdirectories"

  if [[ "$DRY_RUN" == "true" ]]; then
    print_status "$BLUE" "   [DRY RUN] Would remove:"
    find "$dir_path" -mindepth 1 | sed 's/^/     /'
  else
    # Remove all contents but preserve the directory
    find "$dir_path" -mindepth 1 -delete 2>/dev/null || true
    print_status "$GREEN" "   ✅ Cleaned"
  fi
}

# Main cleanup function
main() {
  print_status "$BLUE" "🧹 Orchestrator Engine Cleanup"
  print_status "$BLUE" "Engine directory: $ENGINE_DIR"
  echo

  # Confirm before proceeding (unless --force or --no-confirm is used)
  if [[ "$FORCE" != "true" && "$NO_CONFIRM" != "true" && "$DRY_RUN" != "true" ]]; then
    print_status "$YELLOW" "⚠️  This will remove all files from the following directories:"
    echo "   • state/ (workflow state files)"
    echo "   • state-simple/ (simplified workflow state)"
    echo "   • results/ (agent results)"
    echo "   • logs/ (log files)"
    echo "   • alerts/ (alert files)"
    echo "   • archive/ (archived workflows)"
    echo
    read -p "Are you sure you want to continue? (y/N): " -r
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      print_status "$YELLOW" "❌ Cleanup cancelled"
      exit 0
    fi
    echo
  fi

  # Check if orchestrator server is running
  if pgrep -f "orchestrator-server" > /dev/null; then
    print_status "$RED" "⚠️  Warning: Orchestrator server appears to be running!"
    print_status "$YELLOW" "   Consider stopping it first: pkill -f orchestrator-server"

    if [[ "$FORCE" != "true" && "$NO_CONFIRM" != "true" && "$DRY_RUN" != "true" ]]; then
      read -p "Continue anyway? (y/N): " -r
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "$YELLOW" "❌ Cleanup cancelled"
        exit 0
      fi
    fi
    echo
  fi

  # Perform cleanup
  print_status "$GREEN" "🚀 Starting cleanup..."
  echo

  cleanup_directory "$ENGINE_DIR/state" "State directory"
  cleanup_directory "$ENGINE_DIR/state-simple" "Simplified state directory"
  cleanup_directory "$ENGINE_DIR/results" "Results directory"
  cleanup_directory "$ENGINE_DIR/logs" "Logs directory"
  cleanup_directory "$ENGINE_DIR/alerts" "Alerts directory"
  cleanup_directory "$ENGINE_DIR/archive" "Archive directory"

  echo
  if [[ "$DRY_RUN" == "true" ]]; then
    print_status "$BLUE" "🔍 Dry run completed - no files were actually removed"
    print_status "$BLUE" "Run without --dry-run to perform actual cleanup"
  else
    print_status "$GREEN" "✅ Cleanup completed successfully!"
    print_status "$GREEN" "All temporary files and workflow data have been removed"
  fi
}

# Trap to handle script interruption
trap 'print_status "$RED" "❌ Cleanup interrupted"; exit 1' INT TERM

# Run main function
main "$@"