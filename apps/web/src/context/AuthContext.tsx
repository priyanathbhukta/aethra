// ==============================================================================
// AETHRA Web Application — Authentication Context & Session Management
// ==============================================================================

import React, { createContext, useContext, useState } from 'react';
import { UserSessionState } from '../types/web.types.js';

interface AuthContextValue extends UserSessionState {
  login: (email: string, token: string, userDetails?: Partial<UserSessionState>) => void;
  logout: () => void;
  hasPermission: (permissionCode: string) => boolean;
}

const defaultSession: UserSessionState = {
  userId: 'usr-rajesh-sharma-99',
  email: 'rajesh.sharma@sunvolt.com',
  fullName: 'Rajesh Sharma',
  isAuthenticated: true,
  token: 'mock-jwt-bearer-token',
  claims: {
    roles: ['vendor_admin', 'project_manager'],
    permissions: [
      'crm:lead:read',
      'crm:lead:write',
      'quotation:create',
      'quotation:issue',
      'project:view',
      'project:execute',
      'inventory:read',
      'inventory:write',
    ],
  },
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode; initialSession?: Partial<UserSessionState> }> = ({
  children,
  initialSession,
}) => {
  const [session, setSession] = useState<UserSessionState>({
    ...defaultSession,
    ...initialSession,
  });

  const login = (email: string, token: string, userDetails?: Partial<UserSessionState>) => {
    setSession({
      userId: userDetails?.userId || `usr-${Date.now()}`,
      email,
      fullName: userDetails?.fullName || email.split('@')[0],
      isAuthenticated: true,
      token,
      claims: userDetails?.claims || {},
    });
  };

  const logout = () => {
    setSession({
      userId: '',
      email: '',
      fullName: '',
      isAuthenticated: false,
      token: undefined,
      claims: undefined,
    });
  };

  const hasPermission = (permissionCode: string): boolean => {
    if (!session.isAuthenticated || !session.claims) return false;
    const permissions: string[] = session.claims.permissions || [];
    return permissions.includes(permissionCode) || permissions.includes('*');
  };

  return (
    <AuthContext.Provider
      value={{
        ...session,
        login,
        logout,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
