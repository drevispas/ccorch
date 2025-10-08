# CCOrch Hook Setup Guide

This guide explains how to configure Claude Code hooks to integrate with the Claude Code Orchestrator (CCOrch).

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Configuration](#configuration)
4. [Environment Setup](#environment-setup)
5. [Hook Authentication](#hook-authentication)
6. [Testing Your Setup](#testing-your-setup)
7. [Troubleshooting](#troubleshooting)
8. [Security Considerations](#security-considerations)

## Prerequisites

### Required Software

- **Claude Code**: Version with hooks support enabled
  - Check: Run `claude --version` to verify installation
  - Hooks feature must be enabled in your Claude Code installation

- **CCOrch Server**: Running on your local machine or accessible network
  - Default URL: `http://localhost:3000`
  - See [main README](../README.md) for installation instructions

- **curl**: Command-line tool for making HTTP requests
  - macOS/Linux: Pre-installed
  - Windows: Use Git Bash or WSL

### Verify Hooks Are Enabled

Check if Claude Code supports hooks:

```bash
# Look for hooks documentation
claude --help | grep -i hook

# Or check Claude Code settings directory
ls ~/.claude/settings.json
```

If hooks are not available, ensure you have the latest version of Claude Code with hooks support.

## Quick Start

**1. Start CCOrch Server**

```bash
cd /path/to/ccorch
pnpm dev
```

CCOrch should be running on `http://localhost:3000`.

**2. Create `.claude/settings.json`**

Create or edit `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -X POST -H 'Content-Type: application/json' -d @- http://localhost:3000/hooks/user-prompt-submit"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -X POST -H 'Content-Type: application/json' -d @- http://localhost:3000/hooks/post-tool-use"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -X POST http://localhost:3000/hooks/stop"
          }
        ]
      }
    ]
  }
}
```

**Note**: For local development, no authentication is configured. For production setup with authentication, see the [Local Development vs Production](#local-development-vs-production) section.

**3. Test the Integration**

Submit a prompt with the opt-in trigger in Claude Code:

```
\cco Implement REST API for user authentication
```

Verify CCOrch processes it by checking the logs:

```bash
# Check CCOrch logs for hook activity
# You should see UserPromptSubmit hook being processed
```

## ⚠️ Important: Opt-in Triggers Required

**CCOrch requires all prompts to start with an opt-in trigger prefix**. Without a trigger, your prompt will go directly to Claude Code without workflow orchestration.

### Supported Triggers

- `\cco` - **Claude Code Orchestrator** (recommended)
- `\c2o` - Claude 2 Orchestrator (alternative)

Triggers are **case-insensitive** and **require whitespace** after them.

### Examples

**✅ Valid Prompts**:
```
\cco Implement REST API for user authentication
\CCO Design database schema for blog platform
\c2o Fix authentication bug in login flow
\Cco Create React component for user profile
```

**❌ Invalid Prompts**:
```
Implement REST API                    ← No trigger - orchestration skipped
\ccoImplement                         ← No space - not recognized
cco Implement REST API                ← Missing backslash - not recognized
```

### Why Triggers?

**Explicit Activation**: Triggers ensure orchestration is intentional, not automatic for every prompt.

**Flexibility**: You can still use Claude Code normally for simple tasks without triggering multi-agent workflows.

**Control**: You decide when to use orchestration vs direct Claude Code interaction.

### How It Works

1. You submit: `\cco Design REST API for authentication`
2. CCOrch receives: `Design REST API for authentication` (trigger removed)
3. Workflow created with clean prompt
4. First agent receives task without trigger prefix

### What Happens Without a Trigger?

If you submit a prompt without `\cco` or `\c2o`:
- UserPromptSubmit hook still fires
- CCOrch receives the prompt
- **Orchestration is skipped** (no workflow created)
- Prompt goes directly to Claude Code
- No agent chain is executed

**To activate orchestration, always start your prompt with `\cco` or `\c2o`.**

## Configuration

### Claude Code Settings File

Claude Code hooks are configured in `~/.claude/settings.json`. This file tells Claude Code what commands to run when specific events occur.

#### File Location

- **macOS/Linux**: `~/.claude/settings.json`
- **Windows**: `%USERPROFILE%\.claude\settings.json`

### Hook Endpoints

| Hook | Endpoint | Purpose | Response |
|------|----------|---------|----------|
| `UserPromptSubmit` | `POST /hooks/user-prompt-submit` | User initiates task (with `\cco` trigger) | Agent injection prompt |
| `PostToolUse` | `POST /hooks/post-tool-use` | Agent completes Task tool (filters by tool_name='Task' and session_id) | Next agent prompt or completion message |
| `Stop` | `POST /hooks/stop` | Cleanup trigger | 200 OK (no message) |

**Note**: PostToolUse uses two-level filtering:
1. Only processes payloads where `tool_name='Task'` (ignores other tools)
2. Finds active workflow by matching `session_id` from hook payload

### Local Development vs Production

CCOrch supports two configuration modes depending on your environment.

#### Local Development (No Authentication)

For local development and testing, you can run without authentication:

**Configuration** (`~/.claude/settings.json`):
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -X POST -H 'Content-Type: application/json' -d @- http://localhost:3000/hooks/user-prompt-submit",
            "description": "CCOrch: Initiate workflow when user submits prompt"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -X POST -H 'Content-Type: application/json' -d @- http://localhost:3000/hooks/post-tool-use",
            "description": "CCOrch: Process agent results and determine next step"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -X POST http://localhost:3000/hooks/stop",
            "description": "CCOrch: Cleanup orphaned workflows"
          }
        ]
      }
    ]
  }
}
```

**Environment** (CCOrch `.env`):
```bash
# Don't set HOOK_SECRET for local development
# Authentication is disabled when HOOK_SECRET is not configured
```

#### Production (With Authentication)

For production deployments, use authentication with shared secret:

**Configuration** (`~/.claude/settings.json`):
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -X POST -H 'X-Hook-Secret: $HOOK_SECRET' -H 'Content-Type: application/json' -d @- https://ccorch.example.com/hooks/user-prompt-submit",
            "description": "CCOrch: Initiate workflow when user submits prompt"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -X POST -H 'X-Hook-Secret: $HOOK_SECRET' -H 'Content-Type: application/json' -d @- https://ccorch.example.com/hooks/post-tool-use",
            "description": "CCOrch: Process agent results and determine next step"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -X POST -H 'X-Hook-Secret: $HOOK_SECRET' https://ccorch.example.com/hooks/stop",
            "description": "CCOrch: Cleanup orphaned workflows"
          }
        ]
      }
    ]
  }
}
```

**Environment** (CCOrch `.env`):
```bash
HOOK_SECRET=your-secure-secret-here
```

**Shell Environment**:
```bash
export HOOK_SECRET=your-secure-secret-here
```

**Important**: The `HOOK_SECRET` in your shell environment must exactly match the `HOOK_SECRET` in CCOrch's `.env` file (case-sensitive).

### Customizing CCOrch URL

Replace `http://localhost:3000` or `https://ccorch.example.com` with your actual CCOrch server URL in all hook commands

## Environment Setup

### CCOrch Environment Variables

Create or edit `.env` in your CCOrch project directory:

```bash
# Server Configuration
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=file:./dev.db

# Logging
LOG_LEVEL=info

# Security - Hook Authentication
HOOK_SECRET=your-secure-hook-secret-here

# Security - Admin API Authentication (optional for dev)
API_KEY_ADMIN=your-secure-admin-key-here
```

### Generating Secure Secrets

For production environments, generate strong random secrets:

```bash
# Generate HOOK_SECRET (32 bytes, base64 encoded)
openssl rand -base64 32

# Generate API_KEY_ADMIN (32 bytes, base64 encoded)
openssl rand -base64 32
```

### Shell Environment Variables

For the hook commands to access `$HOOK_SECRET`, set it in your shell:

**macOS/Linux (bash/zsh)**:

```bash
# Add to ~/.bashrc or ~/.zshrc
export HOOK_SECRET="your-secure-hook-secret-here"
```

**Windows (PowerShell)**:

```powershell
# Add to PowerShell profile
$env:HOOK_SECRET = "your-secure-hook-secret-here"
```

**Important**: The `HOOK_SECRET` in your shell environment must match the `HOOK_SECRET` in CCOrch's `.env` file.

## Hook Authentication

CCOrch uses a shared secret to authenticate hook requests. This prevents unauthorized access and ensures only legitimate Claude Code instances can trigger workflows.

### Why Authentication?

**Security Benefits**:
- Prevents unauthorized workflow creation
- Protects against malicious hook payloads
- Ensures only your Claude Code instance can interact with CCOrch
- Guards against accidental public exposure of CCOrch endpoints

### Authentication Methods

#### Method 1: Shared Secret (Recommended)

The simplest and recommended method. CCOrch validates the `X-Hook-Secret` header.

**Configuration**:

1. Set `HOOK_SECRET` in CCOrch's `.env`:
   ```
   HOOK_SECRET=my-secure-secret-123
   ```

2. Set `HOOK_SECRET` in your shell environment:
   ```bash
   export HOOK_SECRET=my-secure-secret-123
   ```

3. Configure hooks to send the header:
   ```json
   {
     "hooks": {
       "UserPromptSubmit": {
         "command": "curl -X POST -H 'X-Hook-Secret: $HOOK_SECRET' -H 'Content-Type: application/json' -d @- http://localhost:3000/hooks/user-prompt-submit"
       }
     }
   }
   ```

**How It Works**:
1. Claude Code sends hook payload with `X-Hook-Secret: $HOOK_SECRET` header
2. CCOrch receives request and extracts header value
3. CCOrch compares header value to configured `HOOK_SECRET`
4. If match: Request processed
5. If mismatch or missing: `401 Unauthorized` returned

#### Method 2: No Authentication (Development Only)

For local development and testing, you can disable authentication:

**Configuration**:

1. Don't set `HOOK_SECRET` in CCOrch's `.env` (or leave it empty)

2. Remove authentication header from hook commands:
   ```json
   {
     "hooks": {
       "UserPromptSubmit": {
         "command": "curl -X POST -H 'Content-Type: application/json' -d @- http://localhost:3000/hooks/user-prompt-submit"
       }
     }
   }
   ```

**⚠️ Warning**: Never use this in production or when CCOrch is accessible from the network.

### Authentication Flow Diagram

```
┌─────────────┐                          ┌──────────────┐
│ Claude Code │                          │    CCOrch    │
└──────┬──────┘                          └──────┬───────┘
       │                                        │
       │  1. User submits prompt                │
       │                                        │
       │  2. UserPromptSubmit hook fires        │
       │                                        │
       │  3. POST /hooks/user-prompt-submit     │
       │     X-Hook-Secret: $HOOK_SECRET        │
       ├───────────────────────────────────────>│
       │                                        │
       │                     4. Validate secret │
       │                        ┌───────────────┤
       │                        │  Compare to   │
       │                        │  env.HOOK_    │
       │                        │  SECRET       │
       │                        └───────────────┤
       │                                        │
       │  5a. If valid: Agent injection prompt  │
       │<───────────────────────────────────────┤
       │                                        │
       │  5b. If invalid: 401 Unauthorized      │
       │     (request rejected)                 │
       │                                        │
```

## Testing Your Setup

### Manual Hook Testing

Use the test harness to verify your hooks are configured correctly:

**1. Test UserPromptSubmit Hook**

```bash
# Using test harness
pnpm harness:send user-prompt-submit tests/fixtures/user-prompt-submit-backend.json

# Expected: CCOrch returns agent injection prompt
```

**2. Test PostToolUse Hook**

```bash
# Using test harness
pnpm harness:send post-tool-use tests/fixtures/post-tool-use-architect.json

# Expected: CCOrch returns next agent prompt or completion message
```

**3. Test Stop Hook**

```bash
# Using test harness
pnpm harness:send stop tests/fixtures/stop-hook.json

# Expected: CCOrch returns 200 OK
```

### Testing with Claude Code

**1. Start CCOrch**

```bash
cd /path/to/ccorch
pnpm dev
```

**2. Submit a Test Prompt**

In Claude Code, submit a prompt with the opt-in trigger:

```
\cco Implement REST API for user authentication
```

**3. Verify Hook Activity**

Check CCOrch logs for:
- `UserPromptSubmit` hook received
- Workflow created
- Agent injection returned to Claude Code

**4. Follow the Workflow**

Claude Code should:
- Launch the specified subagent (e.g., `backend-architect-moderate`)
- Agent completes its task
- `PostToolUse` hook triggers
- CCOrch returns next agent or completion

### Testing Authentication

**Test 1: Valid Secret**

```bash
curl -X POST \
  -H "X-Hook-Secret: your-hook-secret" \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test","hook_event_name":"UserPromptSubmit","prompt":"\\cco test"}' \
  http://localhost:3000/hooks/user-prompt-submit

# Expected: 200 OK with agent injection response
```

**Test 2: Invalid Secret**

```bash
curl -X POST \
  -H "X-Hook-Secret: wrong-secret" \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test","hook_event_name":"UserPromptSubmit","prompt":"\\cco test"}' \
  http://localhost:3000/hooks/user-prompt-submit

# Expected: 401 Unauthorized
```

**Test 3: Missing Secret**

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test","hook_event_name":"UserPromptSubmit","prompt":"\\cco test"}' \
  http://localhost:3000/hooks/user-prompt-submit

# Expected: 401 Unauthorized (if HOOK_SECRET is configured)
```

## Troubleshooting

### Common Issues

#### 1. 401 Unauthorized - Hook Authentication Failed

**Symptoms**:
```
HTTP/1.1 401 Unauthorized
{"error": "Unauthorized"}
```

**Solutions**:

- **Verify HOOK_SECRET matches**:
  ```bash
  # Check CCOrch .env file
  grep HOOK_SECRET .env

  # Check shell environment variable
  echo $HOOK_SECRET
  ```

- **Ensure secret is exported**:
  ```bash
  # Add to ~/.bashrc or ~/.zshrc
  export HOOK_SECRET="your-secret-here"

  # Reload shell configuration
  source ~/.bashrc  # or source ~/.zshrc
  ```

- **Check hook command includes header**:
  ```json
  {
    "command": "curl -X POST -H 'X-Hook-Secret: $HOOK_SECRET' ..."
  }
  ```

#### 2. Connection Refused / ECONNREFUSED

**Symptoms**:
```
curl: (7) Failed to connect to localhost port 3000: Connection refused
```

**Solutions**:

- **Start CCOrch server**:
  ```bash
  cd /path/to/ccorch
  pnpm dev
  ```

- **Verify port**:
  ```bash
  # Check if CCOrch is running on port 3000
  lsof -i :3000
  # or
  netstat -an | grep 3000
  ```

- **Check firewall**: Ensure localhost connections are allowed

#### 3. Invalid Payload Format

**Symptoms**:
```
HTTP/1.1 400 Bad Request
{"error": "Invalid payload"}
```

**Solutions**:

- **Verify JSON structure**: Check payload matches expected format
  ```bash
  # Use jq to validate JSON
  cat tests/fixtures/user-prompt-submit-backend.json | jq .
  ```

- **Check required fields**:
  - `session_id` (string)
  - `hook_event_name` (string)
  - `prompt` (string for UserPromptSubmit)

- **Use test fixtures**: Reference `tests/fixtures/` for valid examples

#### 4. Hook Not Triggering

**Symptoms**: Claude Code doesn't send hook requests

**Solutions**:

- **Verify settings file exists**:
  ```bash
  cat ~/.claude/settings.json
  ```

- **Check JSON syntax**:
  ```bash
  # Validate JSON
  cat ~/.claude/settings.json | jq .
  ```

- **Restart Claude Code**: Changes to settings.json require restart

- **Check Claude Code version**: Ensure hooks feature is supported

#### 5. Workflow Not Created

**Symptoms**: CCOrch receives hook but no workflow appears in database

**Solutions**:

- **Check CCOrch logs**:
  ```bash
  # Look for errors in server output
  pnpm dev
  ```

- **Verify database connection**:
  ```bash
  # Check DATABASE_URL in .env
  grep DATABASE_URL .env

  # Verify database file exists
  ls -la dev.db
  ```

- **Run migrations**:
  ```bash
  pnpm prisma:migrate
  ```

#### 6. Environment Variable Not Expanding

**Symptoms**: Literal `$HOOK_SECRET` sent instead of value

**Solutions**:

- **Use single quotes in shell, not JSON**:
  ```json
  {
    "command": "curl -H 'X-Hook-Secret: $HOOK_SECRET' ..."
  }
  ```
  Note: Single quotes in the JSON string allow shell expansion

- **Hardcode for testing**:
  ```json
  {
    "command": "curl -H 'X-Hook-Secret: my-actual-secret' ..."
  }
  ```

- **Check shell supports expansion**: Some shells may not expand variables in this context

### Debug Mode

Enable debug logging in CCOrch to see detailed hook processing:

```bash
# In .env
LOG_LEVEL=debug

# Restart CCOrch
pnpm dev
```

### Testing Checklist

When troubleshooting, verify:

- [ ] CCOrch server is running (`pnpm dev`)
- [ ] `~/.claude/settings.json` exists and has valid JSON
- [ ] `HOOK_SECRET` is set in CCOrch `.env`
- [ ] `HOOK_SECRET` environment variable is exported in shell
- [ ] Both secrets match exactly (case-sensitive)
- [ ] Hook commands include `-d @-` to read payload from stdin
- [ ] Hook commands include `Content-Type: application/json` header
- [ ] CCOrch database exists and migrations are up to date

## Security Considerations

### Production Deployment

When deploying CCOrch in production:

**1. Use Strong Secrets**

```bash
# Generate cryptographically secure secrets
HOOK_SECRET=$(openssl rand -base64 32)
API_KEY_ADMIN=$(openssl rand -base64 32)

# Add to .env
echo "HOOK_SECRET=$HOOK_SECRET" >> .env
echo "API_KEY_ADMIN=$API_KEY_ADMIN" >> .env
```

**2. Protect .env File**

```bash
# Ensure .env is not committed
echo ".env" >> .gitignore

# Set restrictive permissions
chmod 600 .env
```

**3. Use HTTPS**

For remote CCOrch deployments, use HTTPS:

```json
{
  "hooks": {
    "UserPromptSubmit": {
      "command": "curl -X POST -H 'X-Hook-Secret: $HOOK_SECRET' -H 'Content-Type: application/json' -d @- https://ccorch.example.com/hooks/user-prompt-submit"
    }
  }
}
```

**4. Network Security**

- Run CCOrch behind a firewall
- Use VPN for remote access
- Consider mTLS for additional authentication
- Implement rate limiting to prevent abuse

**5. Secret Rotation**

Rotate `HOOK_SECRET` periodically:

```bash
# 1. Generate new secret
NEW_SECRET=$(openssl rand -base64 32)

# 2. Update CCOrch .env
sed -i "s/HOOK_SECRET=.*/HOOK_SECRET=$NEW_SECRET/" .env

# 3. Restart CCOrch
pnpm dev

# 4. Update shell environment
export HOOK_SECRET=$NEW_SECRET

# 5. Restart Claude Code
```

### Why Hook Authentication Matters

**Without Authentication**:
- Anyone on the network could send fake hook requests
- Malicious actors could create unlimited workflows
- Database could be filled with spam workflows
- Server resources could be exhausted (DoS)

**With Authentication**:
- Only authenticated requests are processed
- Workflows can be traced to legitimate sources
- Rate limiting can be applied per authenticated client
- Audit logs can track who created what workflows

## Additional Resources

- [Test Harness Guide](./test-harness.md) - Testing hooks without Claude Code
- [Claude Code Hooks Documentation](https://docs.claude.com/en/docs/claude-code/hooks.md) - Official hooks reference
- [CCOrch API Reference](./technical-spec.md#3-api-interface) - Detailed API documentation
- [Architecture Overview](./architecture.md) - How hooks fit into the system

## Getting Help

If you encounter issues not covered in this guide:

1. Check CCOrch logs for error messages
2. Review [GitHub Issues](https://github.com/your-org/ccorch/issues)
3. Consult [troubleshooting section](#troubleshooting)
4. Enable debug logging (`LOG_LEVEL=debug`)

## Quick Reference

### Essential Commands

```bash
# Start CCOrch
pnpm dev

# Test hook manually
pnpm harness:send user-prompt-submit tests/fixtures/user-prompt-submit-backend.json

# Validate hook response
pnpm harness:validate response.json

# Check environment variables
echo $HOOK_SECRET

# Generate secure secret
openssl rand -base64 32
```

### Configuration Files

- **Claude Code hooks**: `~/.claude/settings.json`
- **CCOrch environment**: `/path/to/ccorch/.env`
- **Hook secret**: Must match in both locations

### Hook Endpoints

- `POST /hooks/user-prompt-submit` - Initiate workflow
- `POST /hooks/post-tool-use` - Process agent results
- `POST /hooks/stop` - Cleanup workflows
