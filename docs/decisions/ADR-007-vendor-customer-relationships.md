# ADR-007: Explicit Vendor-Customer Relationship Grants

> Status: **Accepted**  
> Date: 2026-11-03  
> Deciders: Application Security Engineer, Principal Architect  

---

## 1. Context

In the Indian renewable energy ecosystem, customer accounts cannot be modeled as the private property of a single vendor:
- A factory owner might hire Vendor A (Solar EPC) to construct a 200kW rooftop installation.
- Two years later, the same customer might contract Vendor B (Energy Storage Specialist) for a battery energy storage system (BESS).
- Simultaneously, the customer might contract Vendor C (Third-Party O&M Specialist) for annual cleaning and preventive maintenance.

If customer records or properties contain a hardcoded `vendor_id` or single tenant discriminator:
1. Customers would be forced to create multiple duplicate accounts across vendors.
2. Competing vendors could accidentally gain visibility into each other's contracts, pricing, and installation histories.
3. Revoking access for a vendor after contract completion would be prone to data leaks.

## 2. Decision

We establish an **Explicit Grant-Based Multi-Vendor Governance Architecture** owned by the dedicated **Vendor Relationship Service**:

1. **Independent Customer Sovereignty:**
   - Customer accounts and customer properties reside in `customer_db` and are **not** owned by any single vendor organization.
2. **Explicit, Granular Relationship Grants:**
   - A vendor can access customer data *only* if an explicit record exists in `vendor_customer_relationships` with `status = 'active'`.
   - Access is granularly scoped via:
     - `purpose_id`: e.g. `epc_installation`, `amc_service`, `energy_audit`.
     - `property_access_grants`: Explicitly authorizes access to specific physical properties (e.g. Plant 1 vs. Plant 2).
     - `installation_access_grants`: Limits access to specific equipment setups (e.g. Inverter Array 1).
3. **Audited Digital Consent:**
   - Customer authorization is recorded in an immutable `customer_consents` table capturing legal consent text hash, signatory Identity user ID, timestamp, IP address, and user agent.
4. **Immediate Revocation Propagation:**
   - When a customer revokes vendor access (or when a contract expires):
     - An audit record is logged in `access_revocation_history`.
     - The event `vendor_relationship.revoked.v1` is broadcast to Kafka.
     - All dependent microservices (Quotation, Project, Service Management, Document) immediately evict cached permissions in Redis, terminating vendor access instantly.

## 3. Consequences

### Positive
- Strict data privacy: Vendor A can never see proposals, pricing, or contracts created by Vendor B for the same customer.
- Customer-centric architecture: Customers have a unified mobile portal view of all their renewable assets across different vendors.
- Regulatory compliance: Complies fully with India's Digital Personal Data Protection (DPDP) Act 2023 regarding user consent management and right to withdraw consent.

### Negative / Trade-offs
- Increased authorization complexity: Access verification requires checking both vendor tenancy and relationship grant records.
- Mitigated via distributed caching of active grants in Redis.

## 4. Alternatives Considered

- **Implicit Vendor Ownership (Customer Belongs to Vendor):** Rejected. Breaks the fundamental reality of the renewable energy market and forces customer account duplication.
- **Global Unrestricted Customer Access Once Connected:** Rejected due to unacceptable data privacy and confidentiality violations between competing vendors.
