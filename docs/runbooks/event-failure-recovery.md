# AETHRA — Event Failure Recovery & Dead-Letter Runbook

> Phase 0 · Distributed Systems Operations · v0.1.0

---

## 1. Event Resilience Architecture

In an event-driven microservices architecture, network partitions, temporary downstream outages, schema mismatches, and poisoned payloads are inevitable.

AETHRA enforces a **multi-tiered failure defense pipeline**:

```mermaid
graph TD
    EVENT[Incoming Kafka Event] --> INBOX{Check inbox_events}
    INBOX -->|Duplicate| ACK_SKIP[ACK & Skip: Deduplicated]
    INBOX -->|New Message| PROCESS[Execute Domain Logic]
    
    PROCESS -->|Success| COMMIT[Commit Transaction & Write to inbox_events]
    PROCESS -->|Transient Error: Timeout/DB Busy| RETRY[Retry with Exponential Backoff]
    
    RETRY -->|Max 5 Retries Exceeded| DLQ_PRODUCE[Publish to Dead-Letter Topic: {topic}.dlq]
    DLQ_PRODUCE --> DLQ_ACK[ACK Original Message]
    
    DLQ_PRODUCE --> ALARM[CloudWatch / PagerDuty Alert Triggered]
    ALARM --> ADMIN[Engineer Reviews DLQ Payload]
    ADMIN --> FIX[Deploy Bugfix or Fix Corrupt Data]
    ADMIN --> REPLAY[Replay Script: Forward from DLQ to Main Topic]
```

---

## 2. Retry Policies & Backoff Standard

Consumer microservices configure retry policies using BullMQ or Kafka consumer middleware:

| Parameter | Default Value | Description |
|---|---|---|
| **Max Retry Attempts** | `5` | Maximum inline attempts before routing to Dead-Letter Queue |
| **Initial Backoff** | `1,000 ms` (1 second) | Initial delay before attempt 1 |
| **Backoff Multiplier** | `2.0` (Exponential) | Multiplier applied on each failure |
| **Maximum Backoff** | `60,000 ms` (60 seconds)| Cap on retry sleep duration |
| **Jitter Factor** | `0.2` ($\pm 20\%$) | Randomization added to prevent thundering herd spikes |

---

## 3. Dead-Letter Queue (DLQ) Standard

Every Kafka topic has a designated Dead-Letter Topic:
- Primary Topic: `quotation.accepted.v1`
- Dead-Letter Topic: `quotation.accepted.v1.dlq`

### DLQ Message Metadata Header Envelope
When a message is redirected to the DLQ, the consumer wraps it with diagnostic metadata:
```json
{
  "failedAt": "2026-11-03T10:35:12.450Z",
  "consumerGroup": "project-service-quotation-consumer",
  "originalTopic": "quotation.accepted.v1",
  "originalPartition": 2,
  "originalOffset": 14592,
  "attemptCount": 5,
  "error": {
    "name": "ForeignKeyConstraintException",
    "message": "Customer property 'uuid-xyz' not found in local projection cache",
    "stack": "Error: Customer property...\n at ProjectService.createFromQuote (...)"
  },
  "rawPayload": { ... }
}
```

---

## 4. Operational Recovery Runbooks

### Runbook 1: Inspecting Dead-Letter Messages
Using the local Redpanda Console or production CLI:
```bash
# Consume and inspect the last 10 messages from DLQ
rpk topic consume quotation.accepted.v1.dlq -n 10 --format json
```

### Runbook 2: Reprocessing / Replaying Messages from DLQ
Once the root cause (e.g. downstream service outage or bugfix) is resolved:
```bash
# Execute the automated replay script
pnpm --filter project-service events:replay-dlq \
  --topic=quotation.accepted.v1.dlq \
  --targetTopic=quotation.accepted.v1 \
  --max=50
```

### Runbook 3: Replaying from a Historical Kafka Timestamp
If a new microservice is provisioned (or if a database was restored from a snapshot) and needs to re-read all events from a specific point in time:
```bash
# Reset consumer group offset to a specific ISO timestamp
rpk group seek project-service-quotation-consumer \
  --to-timestamp 2026-11-01T00:00:00Z \
  --topics quotation.accepted.v1
```

---

## 5. Outbox Worker Stuck Job Recovery

If an outbox worker container crashes or restarts while processing outbox records:
1. Pending outbox records are protected by an `acquired_at TIMESTAMPTZ` and `lock_timeout_ms = 30000`.
2. Any record stuck in `processing` status for $> 60 \text{ seconds}$ is automatically reclaimed by the next outbox poll iteration (`WHERE status = 'pending' OR (status = 'processing' AND acquired_at < NOW() - INTERVAL '60 seconds')`).
3. Outbox table size is monitored. If `SELECT COUNT(*) FROM outbox_events WHERE status = 'pending'` exceeds 500, a high-severity alert fires on Datadog/CloudWatch.
