# Orchestrator Engine Scripts

This directory contains utility scripts for managing the orchestrator engine.

## cleanup.sh

A comprehensive cleanup script that removes temporary files and workflow data from the orchestrator engine.

### What it cleans:

- **`state/`** - All workflow state files and active/completed workflow data
- **`logs/`** - All orchestration log files
- **`alerts/`** - All alert files
- **`archive/`** - All archived workflow data

### Usage:

#### Direct script execution:
```bash
# Show what would be deleted (dry run)
./scripts/cleanup.sh --dry-run

# Interactive cleanup with confirmation
./scripts/cleanup.sh

# Force cleanup without confirmation
./scripts/cleanup.sh --force

# Show help
./scripts/cleanup.sh --help
```

#### NPM scripts:
```bash
# Dry run to see what would be deleted
npm run cleanup:dry-run

# Interactive cleanup with confirmation
npm run cleanup

# Force cleanup without confirmation
npm run cleanup:force
```

### Features:

- ✅ **Safe by default** - Requires confirmation before deleting files
- ✅ **Dry run mode** - Preview what will be deleted without actually removing files
- ✅ **Force mode** - Skip confirmation for automation/scripts
- ✅ **Server detection** - Warns if orchestrator server is running
- ✅ **Colorized output** - Clear visual feedback with colors and emojis
- ✅ **Directory preservation** - Removes files but keeps directory structure
- ✅ **Error handling** - Graceful handling of missing directories or permissions issues

### When to use:

- Before starting fresh workflow testing
- When debugging workflow state issues
- To clean up after development/testing sessions
- Before deploying to clean environment
- When storage space is needed

### Example output:

```
🧹 Orchestrator Engine Cleanup
Engine directory: /path/to/orchestrator/engine

🚀 Starting cleanup...

📂 State directory: 22 files, 14 subdirectories
   ✅ Cleaned

📂 Logs directory: 1 files, 0 subdirectories
   ✅ Cleaned

📂 Alerts directory: 1 files, 0 subdirectories
   ✅ Cleaned

📂 Archive directory: Already clean (0 files, 0 subdirectories)

✅ Cleanup completed successfully!
All temporary files and workflow data have been removed
```

## Safety Notes:

- The script will **never delete** the orchestrator source code or configuration files
- Only temporary data files are removed - directories are preserved
- **Always run with `--dry-run` first** to preview what will be deleted
- The script warns if the orchestrator server is running and prompts before continuing
- All deletions are logged to show exactly what was removed