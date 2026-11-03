# ADR-004: OIDC Provider Abstraction with Proposed AWS Cognito

> Status: **Accepted**  
> Date: 2026-11-03  
> Deciders: Application Security Engineer, Principal Architect  

---

## 1. Context

User authentication in enterprise SaaS requires enterprise-grade credential security, compliance with Indian data privacy regulations, multi-factor authentication (SMS OTP and TOTP), password reset workflows, social/enterprise SSO (Google Workspace, Microsoft Entra ID), and secure token issuance.

Building and maintaining custom password hashing, brute-force protection, and OAuth 2.0 authorization servers inside the application codebase introduces severe security vulnerabilities and regulatory compliance burdens.

## 2. Decision

We adopt an **OpenID Connect (OIDC) Provider Abstraction Pattern** with **AWS Cognito** as the proposed cloud identity provider:

1. **Provider Abstraction Layer (`IdentityProviderAdapter`):**
   - The Identity Service interfaces with the identity provider strictly through a generic TypeScript interface:
     ```typescript
     export interface IdentityProviderAdapter {
       createUser(dto: CreateUserIdentityDto): Promise<ProviderIdentityResult>;
       verifyCredentials(credentials: UserCredentials): Promise<AuthTokens>;
       initiateOtpLogin(phone: string): Promise<OtpSession>;
       verifyOtp(session: string, code: string): Promise<AuthTokens>;
       revokeTokens(refreshToken: string): Promise<void>;
     }
     ```
   - This cleanly decouples the AETHRA domain model from AWS Cognito SDK specifics, allowing seamless substitution with alternative OIDC providers (e.g. Keycloak, Auth0, or Ory Kratos) if future requirements dictate.
2. **Proposed Initial Provider: AWS Cognito User Pools:**
   - Deployed in the Mumbai (`ap-south-1`) region.
   - Provides native phone-number OTP authentication, TOTP MFA, brute-force protection, automated token refresh, and OAuth2 OIDC endpoints.
   - Issues signed RS256 JWT tokens containing standard claims (`sub`, `iss`, `aud`, `exp`).
3. **Application Identity Boundary:**
   - Raw passwords, password hashes, and OTP codes are **never** stored in the AETHRA `identity_db`.
   - `identity_db` stores internal user UUIDs, profile metadata, email/phone verification timestamps, and the foreign `provider_subject` UUID mapping.

## 3. Consequences

### Positive
- High security: Enterprise password hashing (PBKDF2/Argon2) and brute-force mitigation offloaded to a certified security service.
- Compliance: Aligns with ISO 27001 and SOC 2 identity management standards.
- Low operational overhead: Zero identity infrastructure to patch or maintain.
- Portable: The adapter pattern ensures no proprietary lock-in to AWS Cognito.

### Negative / Trade-offs
- AWS Cognito has pricing tiers based on Monthly Active Users (MAUs) beyond the free tier (50,000 MAUs free).
- Custom UI workflows require fine-tuning Cognito SMS templates and custom challenge Lambda triggers for Indian DLT-compliant SMS sender IDs.

## 4. Alternatives Considered

- **Self-Hosted Keycloak / Ory Hydra:** Rejected for Day 1 due to the operational overhead of running, clustering, and backing up dedicated identity containers and databases.
- **Custom Application Password Hashing (Bcrypt in PostgreSQL):** Rejected due to high security risk, lack of native MFA, and unnecessary development complexity.
