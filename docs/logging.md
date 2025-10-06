# CCOrch Logging Guide

This document describes the logging architecture, configuration, and retention policies for CCOrch.

## Table of Contents

1. [Logging Architecture](#logging-architecture)
2. [Log Levels](#log-levels)
3. [Log Format](#log-format)
4. [Log Retention Policy](#log-retention-policy)
5. [Loki + Grafana Setup](#loki--grafana-setup)
6. [Querying Logs](#querying-logs)
7. [Best Practices](#best-practices)

---

## Logging Architecture

CCOrch uses **Pino** for structured logging with the following features:

- **Structured JSON logs** in production for machine parsing
- **Pretty-printed logs** in development for human readability
- **Request ID propagation** for distributed tracing
- **Workflow ID context** for workflow-specific log filtering
- **Configurable log levels** via `LOG_LEVEL` environment variable

### Log Flow

```
Application → Pino Logger → stdout/stderr → Log Aggregator → Storage
```

**Development**:
```
Application → Pino (pretty) → Console
```

**Production**:
```
Application → Pino (JSON) → stdout → PM2 → File → Loki → Grafana
```

---

## Log Levels

Pino supports the following log levels (from lowest to highest):

| Level | Numeric Value | Usage | Example |
|-------|---------------|-------|---------|
| `trace` | 10 | Very detailed debugging | Function entry/exit |
| `debug` | 20 | Detailed debugging | Variable values, flow control |
| `info` | 30 | **Default** - General information | Workflow created, step completed |
| `warn` | 40 | Warning conditions | Deprecated API usage, retries |
| `error` | 50 | Error conditions | Database connection failed |
| `fatal` | 60 | Fatal errors causing exit | Unrecoverable errors |

### Configuration

Set log level via `LOG_LEVEL` environment variable:

```bash
# Development (verbose)
LOG_LEVEL=debug

# Production (essential only)
LOG_LEVEL=warn
```

---

## Log Format

### Development (Pretty-Printed)

```
[10:30:45 UTC] INFO: Workflow created
    workflowId: "wf-abc-123"
    chainName: "backend-development"
    complexity: "moderate"
```

### Production (JSON)

```json
{
  "level": 30,
  "time": 1705315845000,
  "pid": 12345,
  "hostname": "ccorch-prod-01",
  "requestId": "req-xyz-789",
  "workflowId": "wf-abc-123",
  "chainName": "backend-development",
  "complexity": "moderate",
  "msg": "Workflow created"
}
```

### Key Fields

| Field | Description |
|-------|-------------|
| `level` | Numeric log level (30 = info) |
| `time` | Unix timestamp (milliseconds) |
| `pid` | Process ID |
| `hostname` | Server hostname |
| `requestId` | Unique request identifier (from express-request-id) |
| `workflowId` | Workflow UUID (when applicable) |
| `msg` | Human-readable message |
| Additional fields | Context-specific data |

---

## Log Retention Policy

### Production Retention Policy

CCOrch follows a **7-day retention policy** for production logs to balance storage costs with debugging needs.

| Log Type | Retention | Rationale |
|----------|-----------|-----------|
| Application logs | **7 days** | Recent debugging window |
| Error logs | **7 days** | Error investigation period |
| Audit logs | **90 days** | Compliance requirements |
| Metrics | **30 days** | Performance analysis |

### Storage Estimates

**Assumptions**:
- Average log entry: ~500 bytes
- Average workflow: 20 log entries
- Daily workflow volume: 1000 workflows
- Daily log volume: ~10 MB

**7-day storage**: ~70 MB (uncompressed), ~10 MB (compressed with gzip)

### Retention Implementation

**With Loki** (recommended):
```yaml
# loki-config.yaml
limits_config:
  retention_period: 168h  # 7 days
```

**Without Loki** (manual cleanup):
```bash
# Add to crontab (run daily at 2 AM)
0 2 * * * find /var/log/ccorch -name "*.log" -mtime +7 -delete
```

### Archive Strategy

**Long-term archival** (optional):
- Archive to S3/GCS after 7 days
- Compress with gzip
- Lifecycle policy: Delete after 90 days

```bash
# Example: Archive old logs to S3
aws s3 sync /var/log/ccorch s3://ccorch-logs-archive/$(date +%Y-%m-%d)/ \
  --exclude "*" --include "*.log" --storage-class GLACIER
```

---

## Loki + Grafana Setup

**Loki** is a horizontally-scalable log aggregation system designed for cloud-native applications. **Grafana** provides visualization and querying.

### Architecture

```
PM2 (stdout) → Promtail → Loki → Grafana
```

### Installation

#### 1. Install Loki and Promtail

**Docker Compose** (recommended):

```yaml
# docker-compose.yml
version: "3"

services:
  loki:
    image: grafana/loki:2.9.0
    ports:
      - "3100:3100"
    volumes:
      - ./loki-config.yaml:/etc/loki/local-config.yaml
      - loki-data:/loki
    command: -config.file=/etc/loki/local-config.yaml

  promtail:
    image: grafana/promtail:2.9.0
    volumes:
      - ./promtail-config.yaml:/etc/promtail/config.yaml
      - /var/log:/var/log
      - ./logs:/logs
    command: -config.file=/etc/promtail/config.yaml

  grafana:
    image: grafana/grafana:10.0.0
    ports:
      - "3001:3000"
    volumes:
      - grafana-data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin

volumes:
  loki-data:
  grafana-data:
```

#### 2. Configure Loki

**loki-config.yaml**:

```yaml
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    address: 127.0.0.1
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
    final_sleep: 0s
  chunk_idle_period: 5m
  chunk_retain_period: 30s

schema_config:
  configs:
    - from: 2020-05-15
      store: boltdb
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

storage_config:
  boltdb:
    directory: /loki/index
  filesystem:
    directory: /loki/chunks

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h  # 7 days retention
  retention_period: 168h

chunk_store_config:
  max_look_back_period: 168h

table_manager:
  retention_deletes_enabled: true
  retention_period: 168h
```

#### 3. Configure Promtail

**promtail-config.yaml**:

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  # CCOrch PM2 logs
  - job_name: ccorch
    static_configs:
      - targets:
          - localhost
        labels:
          job: ccorch
          __path__: /logs/pm2-*.log

    # Parse JSON logs
    pipeline_stages:
      - json:
          expressions:
            level: level
            time: time
            msg: msg
            workflowId: workflowId
            requestId: requestId

      - labels:
          level:
          workflowId:

      - timestamp:
          source: time
          format: Unix

      - output:
          source: msg
```

#### 4. Start Stack

```bash
docker-compose up -d
```

#### 5. Configure Grafana

1. Access Grafana: http://localhost:3001
2. Login: `admin` / `admin`
3. Add Loki data source:
   - URL: http://loki:3100
4. Import CCOrch dashboard (see below)

### Grafana Dashboard

**CCOrch Log Dashboard** - Import JSON:

```json
{
  "dashboard": {
    "title": "CCOrch Logs",
    "panels": [
      {
        "title": "Recent Logs",
        "targets": [
          {
            "expr": "{job=\"ccorch\"}"
          }
        ]
      },
      {
        "title": "Error Logs",
        "targets": [
          {
            "expr": "{job=\"ccorch\"} |= \"ERROR\""
          }
        ]
      },
      {
        "title": "Workflow Logs",
        "targets": [
          {
            "expr": "{job=\"ccorch\",workflowId=~\".+\"}"
          }
        ]
      }
    ]
  }
}
```

---

## Querying Logs

### With Loki (LogQL)

**Recent logs**:
```logql
{job="ccorch"}
```

**Error logs only**:
```logql
{job="ccorch"} |= "ERROR"
```

**Specific workflow**:
```logql
{job="ccorch",workflowId="wf-abc-123"}
```

**Rate of errors**:
```logql
rate({job="ccorch"} |= "ERROR" [5m])
```

**Workflow creation events**:
```logql
{job="ccorch"} |= "Workflow created"
```

### Without Loki (grep/jq)

**Recent logs**:
```bash
tail -f logs/pm2-combined.log
```

**Error logs only**:
```bash
cat logs/pm2-error.log | jq 'select(.level == 50)'
```

**Specific workflow**:
```bash
cat logs/pm2-combined.log | jq 'select(.workflowId == "wf-abc-123")'
```

**Count errors by hour**:
```bash
cat logs/pm2-error.log | jq -r '.time' | cut -c1-13 | uniq -c
```

---

## Best Practices

### 1. Use Structured Logging

**Good** (structured):
```typescript
logger.info(
  { workflowId, chainName, complexity },
  'Workflow created'
);
```

**Bad** (string interpolation):
```typescript
logger.info(`Workflow created: ${workflowId} with chain ${chainName}`);
```

### 2. Include Context

Always include relevant context:
- `requestId` for HTTP requests
- `workflowId` for workflow operations
- `stepNumber` for agent transitions
- `error` object for errors

```typescript
logger.error(
  {
    err: error,
    workflowId,
    stepNumber,
    agentRole
  },
  'Agent execution failed'
);
```

### 3. Use Appropriate Log Levels

- `debug`: Development debugging only
- `info`: Normal operations (workflow created, completed)
- `warn`: Recoverable issues (retries, deprecations)
- `error`: Failures requiring attention (database errors)

### 4. Don't Log Sensitive Data

**Never log**:
- API keys
- User passwords
- Authentication tokens
- Personal identifiable information (PII)

**Redact if necessary**:
```typescript
logger.info(
  { apiKey: apiKey.substring(0, 8) + '...' },
  'API key validated'
);
```

### 5. Log Performance Metrics

Include timing information:
```typescript
const startTime = Date.now();
// ... operation ...
const duration = Date.now() - startTime;

logger.info(
  { workflowId, duration: `${duration}ms` },
  'Workflow processed'
);
```

### 6. Use Log Sampling for High Volume

For very high-frequency logs, sample:
```typescript
if (Math.random() < 0.1) {  // 10% sample rate
  logger.debug({ details }, 'High frequency event');
}
```

---

## Monitoring and Alerts

### Recommended Alerts

**Error Rate Alert**:
```yaml
alert: HighErrorRate
expr: rate({job="ccorch"} |= "ERROR" [5m]) > 1
for: 5m
annotations:
  summary: High error rate detected (>1 error/sec)
```

**No Logs Alert** (service down):
```yaml
alert: NoLogs
expr: rate({job="ccorch"} [5m]) == 0
for: 5m
annotations:
  summary: No logs received from CCOrch
```

**Stale Workflows Alert**:
```yaml
alert: StaleWorkflows
expr: count_over_time({job="ccorch"} |= "Workflow stale" [1h]) > 10
annotations:
  summary: High number of stale workflows detected
```

---

## Resources

- **Pino Documentation**: https://getpino.io/
- **Loki Documentation**: https://grafana.com/docs/loki/
- **LogQL Guide**: https://grafana.com/docs/loki/latest/logql/
- **Grafana Documentation**: https://grafana.com/docs/grafana/

---

**Version**: 1.0
**Last Updated**: 2025-01-15
