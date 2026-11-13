// ==============================================================================
// AETHRA Web UI — Multi-Tenant Organisation Context Switcher
// ==============================================================================

import React, { useState } from 'react';
import { useTenant } from '../../context/TenantContext.js';

export const TenantSwitcher: React.FC = () => {
  const { activeOrganisationId, activeOrganisationName, activeRole, availableOrganisations, switchOrganisation } =
    useTenant();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-between w-64 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 focus:outline-none"
      >
        <div className="truncate text-left">
          <div className="font-semibold truncate">{activeOrganisationName}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">{activeRole}</div>
        </div>
        <svg
          className="w-4 h-4 ml-2 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 z-50 w-72 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 py-1">
          <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Switch Organisation
          </div>
          {availableOrganisations.map((org) => {
            const isSelected = org.id === activeOrganisationId;
            return (
              <button
                key={org.id}
                onClick={() => {
                  switchOrganisation(org.id);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-slate-50 ${
                  isSelected ? 'bg-emerald-50 text-emerald-900 font-semibold' : 'text-slate-700'
                }`}
              >
                <div className="truncate">
                  <div>{org.name}</div>
                  <div className="text-[10px] text-slate-400 uppercase">{org.role}</div>
                </div>
                {isSelected && (
                  <span className="text-emerald-600 font-bold ml-2">✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
