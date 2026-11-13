// ==============================================================================
// AETHRA Web Application — Multi-Tenant Context & Organisation Switcher
// ==============================================================================

import React, { createContext, useContext, useState } from 'react';
import { TenantContextState } from '../types/web.types.js';

interface TenantContextValue extends TenantContextState {
  switchOrganisation: (orgId: string) => void;
  getTenantHeaders: () => Record<string, string>;
}

const defaultState: TenantContextState = {
  activeOrganisationId: 'org-vendor-sunvolt-01',
  activeOrganisationName: 'Sunvolt Solar Solutions Pvt Ltd',
  activeRole: 'vendor_admin',
  availableOrganisations: [
    {
      id: 'org-vendor-sunvolt-01',
      name: 'Sunvolt Solar Solutions Pvt Ltd',
      role: 'vendor_admin',
    },
    {
      id: 'org-vendor-helios-02',
      name: 'Helios CleanTech Partners',
      role: 'project_engineer',
    },
    {
      id: 'org-customer-portal-01',
      name: 'Indiranagar Resident Solar Society',
      role: 'customer_owner',
    },
  ],
};

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode; initialState?: Partial<TenantContextState> }> = ({
  children,
  initialState,
}) => {
  const [state, setState] = useState<TenantContextState>({
    ...defaultState,
    ...initialState,
  });

  const switchOrganisation = (orgId: string) => {
    const found = state.availableOrganisations.find((o) => o.id === orgId);
    if (found) {
      setState((prev) => ({
        ...prev,
        activeOrganisationId: found.id,
        activeOrganisationName: found.name,
        activeRole: found.role,
      }));
    }
  };

  const getTenantHeaders = (): Record<string, string> => ({
    'x-tenant-id': state.activeOrganisationId,
    'x-user-role': state.activeRole,
    'x-correlation-id': typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `corr-${Date.now()}`,
  });

  return (
    <TenantContext.Provider
      value={{
        ...state,
        switchOrganisation,
        getTenantHeaders,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = (): TenantContextValue => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
