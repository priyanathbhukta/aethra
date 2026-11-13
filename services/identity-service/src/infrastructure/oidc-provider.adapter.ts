// ==============================================================================
// AETHRA Identity Service — OIDC Provider Adapter
// Complies with ADR-004: OIDC Provider Abstraction
// ==============================================================================

export interface IdentityProviderResult {
  providerSubject: string;
  providerIssuer: string;
  providerType: 'cognito' | 'google' | 'microsoft' | 'email_password' | 'phone_otp';
  email: string;
  emailVerified: boolean;
  phone?: string;
  phoneVerified?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface IdentityProviderAdapter {
  createUser(email: string, fullName: string, phone?: string): Promise<IdentityProviderResult>;
  verifyCredentials(email: string, passwordHash: string): Promise<IdentityProviderResult>;
  initiatePhoneOtp(phone: string): Promise<{ sessionToken: string }>;
  verifyPhoneOtp(sessionToken: string, otp: string): Promise<IdentityProviderResult>;
  revokeTokens(refreshToken: string): Promise<void>;
}

/**
 * Default Development Mock / Adapter for AWS Cognito User Pools
 */
export class AwsCognitoOidcAdapter implements IdentityProviderAdapter {
  private readonly issuer: string;

  constructor(issuerUrl?: string) {
    this.issuer = issuerUrl || 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_AETHRA';
  }

  async createUser(email: string, _fullName: string, phone?: string): Promise<IdentityProviderResult> {
    const providerSubject = crypto.randomUUID();
    return {
      providerSubject,
      providerIssuer: this.issuer,
      providerType: 'cognito',
      email,
      emailVerified: false,
      phone,
      phoneVerified: false,
    };
  }

  async verifyCredentials(email: string, _passwordHash: string): Promise<IdentityProviderResult> {
    return {
      providerSubject: crypto.randomUUID(),
      providerIssuer: this.issuer,
      providerType: 'cognito',
      email,
      emailVerified: true,
    };
  }

  async initiatePhoneOtp(_phone: string): Promise<{ sessionToken: string }> {
    return { sessionToken: crypto.randomUUID() };
  }

  async verifyPhoneOtp(_sessionToken: string, _otp: string): Promise<IdentityProviderResult> {
    return {
      providerSubject: crypto.randomUUID(),
      providerIssuer: this.issuer,
      providerType: 'phone_otp',
      email: 'phone-user@aethra.internal',
      emailVerified: false,
      phoneVerified: true,
    };
  }

  async revokeTokens(_refreshToken: string): Promise<void> {
    // Revocation signal sent to IDP
  }
}
