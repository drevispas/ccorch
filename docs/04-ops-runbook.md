# CCOrch Operational Runbook

This runbook provides step-by-step operational procedures for deploying, managing, and troubleshooting the Claude Code Orchestrator (CCOrch).

## Table of Contents

1. [Local Deployment](#1-local-deployment)
2. [Environment Variables](#2-environment-variables)
3. [Database Management](#3-database-management)
4. [Admin Transition Usage](#4-admin-transition-usage)
5. [Troubleshooting](#5-troubleshooting)
6. [Monitoring](#6-monitoring)

---

## 1. Local Deployment

### Prerequisites

- Node.js (LTS version, v18 or higher)
- pnpm (v8 or higher)
- Git

### Deployment Steps

```bash
# 1. Clone the repository
git clone <repository-url>
cd ccorch

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env and configure required variables (see section 2 below)

# 4. Run database migrations
pnpm prisma migrate deploy

# 5. Build the application
pnpm build

# 6. Start the server
pnpm start
```

The server will start on the port specified in `.env` (default: 3000).

### Verification

```bash
# Check server health
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","uptime":X,"database":"connected","timestamp":"..."}
```

### Development Mode

```bash
# Run in watch mode with hot reload
pnpm dev
```

---

## 2. Environment Variables

All environment variables are defined in `.env` file. Copy `.env.example` to `.env` and configure:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | HTTP server port | `3000` | No |
| `NODE_ENV` | Environment (development/production/test) | `development` | No |
| `DATABASE_URL` | SQLite database path | `file:./dev.db` | **Yes** |
| `LOG_LEVEL` | Logging level (trace/debug/info/warn/error) | `info` | No |
| `API_KEY_ADMIN` | API key for admin endpoints | (none) | No* |
| `HOOK_SECRET` | Shared secret for hook authentication | (none) | No* |

\* Required for production deployments

### Generating Secure Keys

```bash
# Generate API_KEY_ADMIN
openssl rand -base64 32

# Generate HOOK_SECRET
openssl rand -base64 32
```

### Production Configuration Example

```bash
PORT=3000
NODE_ENV=production
DATABASE_URL=file:./production.db
LOG_LEVEL=warn
API_KEY_ADMIN=<your-secure-admin-key>
HOOK_SECRET=<your-secure-hook-secret>
```

---

## 3. Database Management

CCOrch uses SQLite with Prisma ORM.

### Database Location

The database file is specified by `DATABASE_URL` in `.env`:
- Default: `./dev.db`
- Production: `./production.db` (or custom path)

### Backup

```bash
# Backup database
sqlite3 dev.db ".backup backup-$(date +%Y%m%d-%H%M%S).db"

# Or using cp
cp dev.db backup-$(date +%Y%m%d-%H%M%S).db
```

### Restore

```bash
# Restore from backup
sqlite3 dev.db ".restore backup-20250101-120000.db"

# Or using cp
cp backup-20250101-120000.db dev.db
```

### Migrations

```bash
# Apply migrations (production)
pnpm prisma migrate deploy

# Create new migration (development)
pnpm prisma migrate dev --name migration-name

# Reset database (WARNING: deletes all data)
pnpm prisma migrate reset
```

### Database Studio

```bash
# Open Prisma Studio (GUI for database inspection)
pnpm prisma studio
```

Access at: http://localhost:5555

### Manual Queries

```bash
# Open SQLite CLI
sqlite3 dev.db

# Example queries:
sqlite> SELECT id, status, chain_name FROM workflows LIMIT 10;
sqlite> SELECT COUNT(*) FROM workflows WHERE status = 'ACTIVE';
sqlite> .exit
```

### Maintenance Tasks

#### Clean up stale workflows

```bash
# Run stale workflow cleanup (mark ACTIVE workflows older than 1 hour as FAILED)
# TODO: Expose via admin API endpoint
# For now, can be done manually via database:
sqlite3 dev.db "UPDATE workflows SET status = 'FAILED' WHERE status = 'ACTIVE' AND updated_at < $(date +%s%3N - 3600000);"
```

#### Archive old workflows

```bash
# Archive old workflows (delete COMPLETED > 30 days, FAILED > 90 days)
# TODO: Expose via admin API endpoint
# For now, can be done manually via database:

# Delete old COMPLETED workflows (older than 30 days)
sqlite3 dev.db "DELETE FROM workflows WHERE status = 'COMPLETED' AND updated_at < $(date +%s%3N - 2592000000);"

# Delete old FAILED workflows (older than 90 days)
sqlite3 dev.db "DELETE FROM workflows WHERE status = 'FAILED' AND updated_at < $(date +%s%3N - 7776000000);"
```

---

## 4. Admin Transition Usage

Admin transition API allows manual control of workflow state transitions.

**Endpoint**: `POST /api/workflows/:id/transition`

**Authentication**: Requires `Authorization: Bearer <API_KEY_ADMIN>` header

### Actions

| Action | Description | Use Case |
|--------|-------------|----------|
| `advance` | Move to next step | Force progression when agent succeeded but didn't report |
| `fail` | Mark workflow as FAILED | Manually abort stuck workflow |
| `retry` | Retry current step | Re-run failed agent step |
| `skip` | Skip current step | Bypass problematic step |

### Examples

#### Advance workflow to next step

```bash
curl -X POST http://localhost:3000/api/workflows/wf-abc-123/transition \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY_ADMIN>" \
  -d '{"action":"advance","reason":"Manual progression after verification"}'
```

#### Fail workflow

```bash
curl -X POST http://localhost:3000/api/workflows/wf-abc-123/transition \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY_ADMIN>" \
  -d '{"action":"fail","reason":"Requirements changed, aborting workflow"}'
```

#### Retry current step

```bash
curl -X POST http://localhost:3000/api/workflows/wf-abc-123/transition \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY_ADMIN>" \
  -d '{"action":"retry","reason":"Agent error, retrying step"}'
```

#### Skip current step

```bash
curl -X POST http://localhost:3000/api/workflows/wf-abc-123/transition \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY_ADMIN>" \
  -d '{"action":"skip","reason":"Skipping optional code review step"}'
```

### Response

Success (200):
```json
{
  "workflow_id": "wf-abc-123",
  "previous_step": 1,
  "current_step": 2,
  "next_agent": "code-reviewer-moderate",
  "status": "ACTIVE",
  "message": "Workflow advanced to step 2"
}
```

Error (404):
```json
{
  "error": "Workflow not found",
  "workflowId": "wf-abc-123"
}
```

---

## 5. Troubleshooting

### Common Issues

#### Issue: Database locked

**Symptoms**:
```
Error: SQLITE_BUSY: database is locked
```

**Cause**: Another process has the database locked

**Solution**:
```bash
# 1. Check for open connections
lsof dev.db

# 2. Kill processes holding locks
kill <PID>

# 3. If Prisma Studio is open, close it

# 4. Restart the server
pnpm start
```

#### Issue: Hook authentication failed

**Symptoms**:
```
Error: Hook authentication failed
```

**Cause**: `HOOK_SECRET` mismatch between CCOrch and Claude Code

**Solution**:
```bash
# 1. Verify HOOK_SECRET in .env
cat .env | grep HOOK_SECRET

# 2. Verify HOOK_SECRET is exported in shell environment
echo $HOOK_SECRET

# 3. Check Claude Code hook configuration includes X-Hook-Secret header
cat ~/.claude/settings.json | jq '.hooks.UserPromptSubmit[0].hooks[0].command'
# Should contain: -H 'X-Hook-Secret: $HOOK_SECRET'

# 4. Ensure they match - update if needed

# 5. Restart CCOrch
pnpm start
```

#### Issue: Workflows not being created

**Symptoms**: UserPromptSubmit hook fires but no workflows appear in database

**Cause**: Missing opt-in trigger prefix in user prompt

**Solution**:

Ensure prompts start with `\cco` or `\c2o` trigger:

```
\cco Implement REST API for authentication
```

Without the trigger, orchestration is skipped. The UserPromptSubmit hook will still fire, but CCOrch will return an empty response and no workflow will be created.

**Debugging**:
```bash
# 1. Check CCOrch logs for "no_trigger" reason
cat logs/pm2-combined.log | jq 'select(.reason == "no_trigger")'

# 2. Verify Claude Code settings.json is configured correctly
cat ~/.claude/settings.json | jq '.hooks.UserPromptSubmit'

# 3. Test with a trigger-prefixed prompt
# In Claude Code: \cco Test workflow creation
```

#### Issue: Stale workflows accumulating

**Symptoms**: Many ACTIVE workflows that never complete

**Cause**: Agent crashes or hook failures leaving workflows orphaned

**Solution**:
```bash
# Option 1: Run cleanup manually (see Database Management section)

# Option 2: Check logs for agent errors
tail -f logs/pm2-combined.log | grep ERROR

# Option 3: Manually fail specific workflow via admin API
curl -X POST http://localhost:3000/api/workflows/wf-abc-123/transition \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY_ADMIN>" \
  -d '{"action":"fail","reason":"Orphaned workflow cleanup"}'
```

#### Issue: Server won't start

**Symptoms**:
```
Error: Environment validation failed
```

**Cause**: Missing or invalid environment variables

**Solution**:
```bash
# 1. Check .env file exists
ls -la .env

# 2. Verify required variables
cat .env

# 3. Ensure DATABASE_URL is set
echo $DATABASE_URL

# 4. Check for syntax errors in .env (no spaces around =)
# Correct:   PORT=3000
# Incorrect: PORT = 3000
```

#### Issue: Database migrations failed

**Symptoms**:
```
Error: Migration failed to apply
```

**Cause**: Database schema mismatch or corruption

**Solution**:
```bash
# Option 1: Reset database (DANGER: deletes all data)
pnpm prisma migrate reset

# Option 2: Drop and recreate (safer)
rm dev.db
pnpm prisma migrate deploy

# Option 3: Restore from backup
cp backup-latest.db dev.db
pnpm prisma migrate deploy
```

### Debugging Tips

#### Enable debug logging

```bash
# Set in .env
LOG_LEVEL=debug

# Restart server
pnpm start
```

#### Check application logs

```bash
# View logs in development
pnpm dev

# View PM2 logs in production
pm2 logs ccorch

# View structured logs
cat logs/pm2-combined.log | jq '.'
```

#### Inspect workflow state

```bash
# Get workflow details
curl http://localhost:3000/api/workflows/wf-abc-123/status

# View all active workflows
sqlite3 dev.db "SELECT id, chain_name, current_step, status FROM workflows WHERE status = 'ACTIVE';"
```

---

## 6. Monitoring

### Health Check

**Endpoint**: `GET /health`

```bash
curl http://localhost:3000/health
```

**Response** (healthy):
```json
{
  "status": "ok",
  "uptime": 3600,
  "database": "connected",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

**Response** (unhealthy):
```json
{
  "status": "error",
  "uptime": 3600,
  "database": "disconnected",
  "error": "Database connection failed",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

**HTTP Status Codes**:
- `200`: System healthy
- `503`: System unhealthy (database down)

### Metrics (Placeholder)

CCOrch logs metrics to console with `[METRIC]` prefix. These are placeholders for future Prometheus integration.

```bash
# View metrics in logs
tail -f logs/pm2-combined.log | grep METRIC
```

**Current metrics**:
- `workflow_created_total`: Counter of workflows created
- `workflow_completed_total`: Counter of workflows completed
- `workflow_failed_total`: Counter of workflows failed
- `hook_latency_ms`: Histogram of hook processing time
- `api_request_duration_ms`: Histogram of API request duration

**TODO**: Integrate with Prometheus
1. Install `prom-client`
2. Expose `/metrics` endpoint
3. Configure Prometheus scraping
4. Set up Grafana dashboards

### Log Locations

**Development**:
- Console output (stdout/stderr)

**Production** (PM2):
```bash
# Combined logs
pm2 logs ccorch

# Error logs only
pm2 logs ccorch --err

# Specific number of lines
pm2 logs ccorch --lines 100
```

**Log Format**: JSON (structured logging via pino)

**Example log entry**:
```json
{
  "level": 30,
  "time": 1705315800000,
  "pid": 12345,
  "hostname": "server",
  "requestId": "req-abc-123",
  "workflowId": "wf-xyz-789",
  "msg": "Workflow created"
}
```

### Alerting (Future)

**TODO**: Set up alerts for:
- Health check failures (trigger oncall)
- High error rates (>5% failures)
- Database connection issues
- Stale workflow accumulation (>100 ACTIVE workflows older than 1 hour)

---

## Appendix

### Useful Commands

```bash
# Check server status
pnpm start & sleep 2 && curl http://localhost:3000/health

# View database schema
pnpm prisma studio

# Run tests
pnpm test

# Type check
pnpm tsc --noEmit

# Lint code
pnpm lint

# Format code
pnpm format
```

### File Locations

| File | Purpose |
|------|---------|
| `.env` | Environment configuration |
| `dev.db` | SQLite database (development) |
| `production.db` | SQLite database (production) |
| `prisma/schema.prisma` | Database schema definition |
| `prisma/migrations/` | Database migration history |
| `logs/` | Application logs (if configured) |
| `.claude/settings.json` | Claude Code configuration (on user's machine) |

### Port Configuration

CCOrch listens on the port specified in `PORT` environment variable (default: 3000).

**Common port conflicts**:
- Port 3000 in use: Set `PORT=3001` in `.env`
- Check what's using a port: `lsof -i :3000`

### Security Checklist

Production deployment checklist:

- [ ] `API_KEY_ADMIN` set to secure random value (32+ characters)
- [ ] `HOOK_SECRET` set to secure random value (32+ characters)
- [ ] `NODE_ENV=production` in `.env`
- [ ] `LOG_LEVEL=warn` or `error` (not `debug`)
- [ ] `.env` file permissions: `chmod 600 .env`
- [ ] Database file permissions: `chmod 600 production.db`
- [ ] Server behind firewall (only expose necessary ports)
- [ ] HTTPS enabled (use reverse proxy like nginx)
- [ ] Regular database backups configured

---

**Version**: 1.0
**Last Updated**: 2025-01-15
**Maintainer**: CCOrch Team
