// ==============================================================================
// AETHRA Web UI — Main Desktop Application Layout
// ==============================================================================

import React from 'react';
import { TenantSwitcher } from './TenantSwitcher.js';
import { useAuth } from '../../context/AuthContext.js';

export interface AppLayoutProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentTab,
  onTabChange,
  children,
}) => {
  const { fullName, email } = useAuth();

  const navigationItems = [
    { id: 'dashboard', label: 'Executive Dashboard', icon: '📊' },
    { id: 'estimator', label: 'Solar Estimator', icon: '☀️' },
    { id: 'quotations', label: 'Quotations & Contracts', icon: '📝' },
    { id: 'projects', label: 'EPC Project Tracker', icon: '⚡' },
    { id: 'inventory', label: 'Inventory & Stock', icon: '📦' },
    { id: 'service', label: 'AMC & Maintenance', icon: '🔧' },
  ];

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-slate-800 flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-white text-lg">
            Æ
          </div>
          <div>
            <div className="font-bold text-sm tracking-wide text-white">AETHRA</div>
            <div className="text-[10px] text-emerald-400 font-medium">Renewable Energy SaaS</div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navigationItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Badge */}
        <div className="p-4 border-t border-slate-800 flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-200">
            {fullName ? fullName.slice(0, 2).toUpperCase() : 'US'}
          </div>
          <div className="truncate">
            <div className="text-xs font-medium text-white truncate">{fullName}</div>
            <div className="text-[10px] text-slate-400 truncate">{email}</div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-10">
          <div className="flex items-center space-x-4">
            <TenantSwitcher />
          </div>
          <div className="flex items-center space-x-3">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              India Grid • LT-2 / HT Active
            </span>
          </div>
        </header>

        {/* Page View Body */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
};
