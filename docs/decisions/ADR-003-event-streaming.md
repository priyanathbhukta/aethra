# ADR-003: Kafka-Compatible Event Streaming with Outbox and Inbox Patterns

> Status: **Accepted**  
> Date: 2026-11-03  
> Deciders: Principal Distributed Systems Architect, Integration Architect  

---

## 1. Context

In the AETHRA microservices architecture, business operations frequently span multiple services:
- A customer accepting a quotation triggers project creation, customer relationship activation, stock reservations, and client notifications.
- Receiving goods against a procurement PO updates inventory ledgers and adjusts purchase order balances.

Executing these distributed workflows via chains of synchronous HTTP REST calls causes high latency, tight runtime coupling, and cascading failures. Conversely, relying on simple message queues without persistence prevents event replaying, audit logging, and multiple independent consumer groups.

## 2. Decision

We adopt an **Apache Kafka-compatible event streaming backbone** combined with the **Transactional Outbox and Consumer Inbox patterns**:

1. **Broker Standard:**
   - Production / Staging: **Amazon Managed Streaming for Apache Kafka (Amazon MSK)**.
   - Local Development & CI: **Redpanda** (a lightweight, C++ Kafka-compatible binary requiring zero ZooKeeper or JVM overhead).
2. **Transactional Outbox Pattern:**
   - Services never publish directly to Kafka inside an application database transaction.
   - Instead, the service transactionally inserts the event into a local `outbox_events` table inside the same PostgreSQL transaction that mutates domain state.
   - An independent outbox publisher worker reads pending outbox entries and publishes them reliably to Kafka.
3. **Consumer Inbox Pattern & Idempotency:**
   - Consumer microservices write the incoming `event_id` to an `inbox_events` table with a unique constraint.
   - If a duplicate message arrives due to network retries, the consumer skips processing, guaranteeing strict business idempotency.
4. **Dead-Letter Topics (DLQ):**
   - Events that fail repeatedly due to terminal errors are routed to `{topic}.dlq` for administrator inspection and manual replay.

## 3. Consequences

### Positive
- **Guaranteed At-Least-Once Delivery with Exactly-Once Business Semantics:** No lost events if Kafka is briefly unavailable during an application transaction.
- **Event Replayability:** New services (e.g. future AI demand forecasting or new reporting models) can replay historical events from the beginning of the topic stream.
- **Decoupled Workflows:** Downstream services can be offline for maintenance without failing upstream user actions.

### Negative / Trade-offs
- Eventual consistency: UI must be designed to accommodate asynchronous completion (e.g., polling or WebSocket notification for quote $\to$ project creation).
- Operational overhead of monitoring Kafka topic lag and outbox publisher latency.

## 4. Alternatives Considered

- **Synchronous REST Chains:** Rejected due to tight coupling and risk of cascading failure across services.
- **RabbitMQ:** Rejected because RabbitMQ does not support high-retention event replaying, partition-based ordered scaling per tenant, or distributed log streaming.
- **AWS SQS/SNS:** Considered for AWS native deployment, but rejected for local development parity (no clean offline developer story) and lack of deterministic partition ordering compared to Kafka/Redpanda.
