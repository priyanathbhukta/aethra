# AETHRA — System Context (C4 Level 1)

> Phase 0 · Distributed Systems Architecture · v0.1.0

---

## 1. System Context Diagram (C4 Level 1)

The following diagram illustrates the AETHRA platform boundary, external human actors across vendor and customer organizations, and external third-party service integrations.

```mermaid
C4Context
    title System Context Diagram for AETHRA Renewable Energy SaaS Platform

    Person(platform_admin, "Platform Administrator", "Oversees tenant subscriptions, platform health, global catalogue, and security compliance.")
    Person(vendor_owner, "Vendor Business Owner", "Oversees EPC sales, financial health, staff invitations, and branch operations.")
    Person(vendor_staff, "Vendor Staff", "Sales reps, solar design engineers, project managers, and field technicians.")
    Person(customer_owner, "Customer Account Owner", "Homeowner or facility manager who owns properties, signs quotes, and monitors plant performance.")
    Person(customer_user, "Customer Site User", "Family members, caretakers, or building tenants viewing solar generation.")

    Enterprise_Boundary(b0, "AETHRA SaaS Platform") {
        System(aethra_platform, "AETHRA Platform Core", "Microservices-based multi-tenant SaaS managing solar pre-sales, sizing, quotes, inventory, EPC execution, and O&M.")
    }

    System_Ext(oidc_provider, "OIDC Identity Provider", "AWS Cognito / Managed OIDC for user authentication, password hashing, and MFA.")
    System_Ext(payment_gateway, "Payment Gateways", "Razorpay / Cashfree for subscription billing and customer quotation deposits.")
    System_Ext(msg_providers, "Messaging & Communication", "AWS SES (Email), Kaleyra (SMS OTP), Gupshup / Meta (WhatsApp Business Notifications).")
    System_Ext(iot_inverters, "Inverter & BMS IoT Clouds", "Growatt Shine, Solis Cloud, Sungrow iSolarCloud for solar generation and battery telemetry.")
    System_Ext(gis_maps, "GIS & Solar Irradiance APIs", "Google Maps Platform / NREL NSRDB for rooftop geocoding and solar radiation data.")
    System_Ext(s3_storage, "Private Object Storage", "AWS S3 for encrypted storage of engineering drawings, quotation PDFs, and photos.")

    Rel(platform_admin, aethra_platform, "Manages global catalogue, monitors SaaS health, reviews audit logs", "HTTPS")
    Rel(vendor_owner, aethra_platform, "Configures organization, reviews margins, approves POs", "HTTPS / Web")
    Rel(vendor_staff, aethra_platform, "Captures leads, sizes solar arrays, executes installations, logs tickets", "HTTPS / Web & Mobile App")
    Rel(customer_owner, aethra_platform, "Approves quotations, tracks EPC progress, views generation, requests service", "HTTPS / Mobile & Web")
    Rel(customer_user, aethra_platform, "Views daily energy savings and property status", "HTTPS / Mobile App")

    Rel(aethra_platform, oidc_provider, "Authenticates users and validates JWT tokens", "OIDC / OAuth2")
    Rel(aethra_platform, payment_gateway, "Processes subscription payments and tracks payment status", "REST / Webhooks")
    Rel(aethra_platform, msg_providers, "Dispatches OTPs, customer proposals, and project milestones", "REST / HTTPS")
    Rel(aethra_platform, iot_inverters, "Ingests generation telemetry and inverter fault alarms", "REST / Webhooks")
    Rel(aethra_platform, gis_maps, "Retrieves satellite imagery and solar irradiance constants", "REST / HTTPS")
    Rel(aethra_platform, s3_storage, "Stores and retrieves encrypted documents via presigned URLs", "AWS SDK / S3 API")
```

---

## 2. External Actors & Persona Breakdown

### 2.1 Vendor Organization Personas
1. **Vendor Owner / Executive:**
   - Primary commercial stakeholder.
   - Goals: Maximize gross margins on solar installations, track pipeline conversion, control procurement spending, ensure timely customer handovers.
2. **Sales Representative:**
   - Uses mobile/web CRM to log leads, schedule site surveys, initiate preliminary engineering sizing, and deliver formal proposals.
3. **Solar Design Engineer:**
   - Executes structural/electrical calculations, configures string sizing, balances DC/AC ratios, and generates technical Bill of Materials.
4. **Project Manager & Site Supervisor:**
   - Coordinates equipment deliveries from warehouses to sites, tracks installation milestones, uploads discom net-metering inspection reports, and conducts customer plant handovers.
5. **O&M Field Technician:**
   - Dispatched for routine plant cleaning, inverter fault diagnosis, warranty replacements, and emergency site visits.

### 2.2 Customer Personas
1. **Customer Account Owner (Signatory):**
   - Residential homeowner, factory owner, or commercial building administrator.
   - Authorizes vendor access to their property, digitally signs quotation revisions, and approves final handover sign-off.
2. **Customer Delegated Site User:**
   - Building manager, tenant, or family member who needs read-only visibility into power generation without access to billing details.

---

## 3. External System Integrations & Boundaries

| External System | Integration Protocol | Ingress / Egress | Resilience & Fallback Strategy |
|---|---|---|---|
| **AWS Cognito (OIDC)** | OIDC / OAuth 2.0 (JWKS) | Bidirectional | JWKS keys cached in memory; gateway operates without real-time auth server hits on every request. |
| **Razorpay / Cashfree** | REST APIs + Webhooks | Bidirectional | Asynchronous webhook verification with signature checks; missed webhooks reconciled via polling cron jobs. |
| **AWS SES** | HTTPS / SDK | Egress | Asynchronous background dispatch via BullMQ; automatic retry with exponential backoff on SES throttling. |
| **Kaleyra / Textlocal (SMS)**| HTTPS REST | Egress | Dedicated OTP retry provider fallback in case primary SMS gateway reports high latency. |
| **Gupshup (WhatsApp)** | HTTPS REST | Egress | Opt-in verification; falls back to SMS if WhatsApp delivery fails or user is not on WhatsApp. |
| **Growatt / Solis / Sungrow**| REST Polling / Webhooks | Ingress | Decoupled ingest queue; high-volume IoT messages buffered through Kafka topic `integration.inverter.telemetry`. |
| **Google Maps Platform**| HTTPS REST | Egress | Geocoding results cached per address; rooftop coordinates stored permanently in `customer_properties`. |
| **AWS S3** | Presigned S3 URLs | Direct Client-to-S3 | Pre-signed upload/download links bypass microservices; S3 bucket encrypted with AWS KMS. |
