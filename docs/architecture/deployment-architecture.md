# AETHRA — AWS Deployment & Infrastructure Architecture

> Phase 0 · Cloud Infrastructure & DevOps · v0.1.0

---

## 1. Cloud Provider & Regional Strategy

AETHRA is deployed on **Amazon Web Services (AWS)** in the **`ap-south-1` (Mumbai, India)** region.

### Strategic Justification for Mumbai (`ap-south-1`)
1. **Compliance & Data Sovereignty:** Adheres strictly to the Digital Personal Data Protection (DPDP) Act 2023 and Reserve Bank of India (RBI) payment storage mandates.
2. **Ultra-Low Latency:** Sub-30ms round-trip latency to commercial and residential users across tier-1, tier-2, and tier-3 Indian cities.
3. **Service Availability:** Full native support for ECS Fargate, RDS Aurora PostgreSQL, ElastiCache Redis, Amazon MSK, and KMS.

---

## 2. Network Topology & VPC Segmentation

The AWS infrastructure is architected across **3 Availability Zones (AZs)** with 3 isolated subnet tiers:

```mermaid
graph TD
    subgraph "VPC: 10.0.0.0/16 (ap-south-1)"
        subgraph "Public Subnets (10.0.1.0/24, 10.0.2.0/24, 10.0.3.0/24)"
            ALB["Application Load Balancer<br/>(AWS WAF Enabled)"]
            NAT1["NAT Gateway AZ-1a"]
            NAT2["NAT Gateway AZ-1b"]
        end

        subgraph "Private Application Subnet (10.0.10.0/20, 10.0.20.0/20, 10.0.30.0/20)"
            ECS_BFF["ECS Fargate: Web & Mobile BFF"]
            ECS_CORE["ECS Fargate: Platform & Core Services (20+ tasks)"]
            ECS_WORKERS["ECS Fargate: Outbox & Notification Workers"]
        end

        subgraph "Isolated Data Subnet (10.0.50.0/20, 10.0.60.0/20, 10.0.70.0/20)"
            RDS[("RDS Multi-AZ PostgreSQL 16<br/>(19 Isolated DBs)")]
            REDIS[("ElastiCache Redis 7.x Cluster<br/>(Policy & Cache)")]
            MSK["Amazon MSK Kafka Cluster<br/>(Multi-AZ Brokers)")]
        end
    end

    Internet((Internet / Clients)) -->|Route 53 & CloudFront| ALB
    ALB -->|HTTPS :3000| ECS_BFF
    ECS_BFF -->|Internal REST / gRPC| ECS_CORE
    ECS_CORE -->|Port :5432| RDS
    ECS_CORE -->|Port :6379| REDIS
    ECS_CORE & ECS_WORKERS -->|Port :9092| MSK
    ECS_CORE -->|Outbound HTTPS via NAT| NAT1 & NAT2
```

---

## 3. Deployment Components Breakdown

### 3.1 Container Compute: AWS ECS Fargate
- Microservices run as containerized tasks managed by AWS ECS Fargate.
- **Why ECS Fargate over Kubernetes (EKS) for Phase 1:**
  - Zero control-plane management overhead.
  - Serverless container scaling without node-group provisioning or patching.
  - Native IAM task execution roles for seamless, secure Secrets Manager and S3 integration.
  - Documented operational threshold: Migration to EKS will be evaluated only when container count exceeds 150 tasks or when complex service mesh topologies are required.
- **Autoscaling:** AWS Application Auto Scaling scales service tasks based on CPU utilization (>70%) and Target Request Count per Target Group.

### 3.2 Database Tier: AWS RDS PostgreSQL 16 (Multi-AZ)
- **Initial Shared Cluster Topology:** A high-spec Multi-AZ RDS PostgreSQL cluster hosts the 19 logically separate databases (`identity_db`, `quotation_db`, etc.).
- **High Availability:** Synchronous standby replica in AZ-1b with automatic failover (<60 seconds).
- **Read Scalability:** Provisioned Read Replica for heavy analytical read models in `reporting_db`.
- **Database Credentials:** Each microservice has an isolated IAM/Secrets Manager database username and password with zero read/write permissions to adjacent service databases.

### 3.3 Event Streaming: Amazon MSK (Managed Streaming for Kafka)
- Amazon MSK deployed across 3 Availability Zones.
- Topic partitions are sized based on domain throughput (e.g., `inventory.stock` has 6 partitions; `audit.events` has 12 partitions).
- Data retention: 7 days default on operational topics; 30 days on audit topics.

### 3.4 In-Memory Cache: AWS ElastiCache Redis
- Multi-AZ cluster with auto-failover.
- Used exclusively for transient data:
  1. Distributed token blacklist & revocation sets.
  2. RBAC/ABAC cached permission matrices (TTL: 300s).
  3. API Gateway distributed rate limit counters.
  4. BullMQ background job queues.

### 3.5 Object Storage: AWS S3 Private Encrypted Bucket
- Private bucket with AWS KMS Server-Side Encryption (SSE-KMS).
- Direct internet access is blocked via S3 Block Public Access.
- Uploads and downloads execute strictly through presigned HMAC URLs with expiration windows of 15 minutes.
- S3 Lifecycle Rules transition raw upload files to Glacier Flexible Retrieval after 365 days.

---

## 4. Environment Separation Matrix

| Dimension | Development (`dev`) | Staging (`stage`) | Production (`prod`) |
|---|---|---|---|
| **AWS Account** | Isolated Dev Account | Isolated Non-Prod Account | Dedicated Production Account |
| **ECS Deployment** | Fargate Spot (Cost saving) | Fargate On-Demand (1 task/svc) | Fargate On-Demand (Min 2 tasks/svc, Multi-AZ) |
| **RDS PostgreSQL** | Single-AZ `db.t4g.medium` | Multi-AZ `db.r6g.large` | Multi-AZ `db.r6g.2xlarge` + Read Replica |
| **Redis** | Single Node `cache.t4g.small` | 2-node Cluster `cache.m6g.large` | 3-node Multi-AZ Cluster `cache.r6g.large` |
| **Kafka** | Redpanda Container / Local | MSK Serverless | Dedicated MSK 3-Broker Cluster |
| **S3 Buckets** | `aethra-files-dev` | `aethra-files-staging` | `aethra-files-prod` (KMS Customer Managed Key) |

---

## 5. High Availability, Disaster Recovery & Backup Strategy

### 5.1 Service Level Objectives (Proposed Targets)
- **Availability Target:** 99.9% uptime (excluding scheduled maintenance windows).
- **Recovery Point Objective (RPO):** $< 5 \text{ minutes}$ (RDS automated continuous WAL archiving).
- **Recovery Time Objective (RTO):** $< 30 \text{ minutes}$ (automated Multi-AZ failover and Terraform-driven task reconstitution).

### 5.2 Backup Strategy
- **RDS Automated Backups:** Continuous point-in-time recovery (PITR) retained for 35 days.
- **Daily Snapshots:** Automated cross-region encrypted snapshot copied to AWS Hyderabad (`ap-south-2`) at 02:00 IST daily.
- **S3 Bucket Versioning:** S3 Object Versioning enabled with MFA Delete to prevent accidental or malicious file overwrites.

---

## 6. Cost Optimization Architecture

1. **ECS Fargate Spot in Dev/Stage:** Utilizes AWS Fargate Spot for non-production environments, delivering up to 70% compute cost savings.
2. **Shared RDS Cluster in Phase 1:** Consolidating 19 service databases into one high-efficiency Multi-AZ RDS instance reduces idle baseline costs by over \$1,800/month compared to provisioning 19 individual RDS instances.
3. **CloudFront Asset Caching:** All Next.js static bundles and public equipment catalogue images are edge-cached on CloudFront, reducing ALB ingress bandwidth fees.
