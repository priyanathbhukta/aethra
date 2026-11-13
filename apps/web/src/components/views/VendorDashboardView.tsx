// ==============================================================================
// AETHRA Web UI — Executive Vendor Dashboard View
// ==============================================================================

import React, { useEffect, useState } from 'react';
import { Card } from '../ui/Card.js';
import { Button } from '../ui/Button.js';
import { WebDashboardMetrics } from '../../types/web.types.js';
import { WebBffClient } from '../../services/webBffClient.js';
import { useTenant } from '../../context/TenantContext.js';

export const VendorDashboardView: React.FC<{ onNavigate: (tab: string) => void }> = ({
  onNavigate,
}) => {
  const { getTenantHeaders, activeOrganisationName } = useTenant();
  const [metrics, setMetrics] = useState<WebDashboardMetrics>({
    activeProjectsCount: 14,
    pipelineLeadsCount: 48,
    monthlyRevenueInr: 6250000,
    lowStockItemsCount: 2,
    openServiceTicketsCount: 5,
    completedHandoverThisMonth: 8,
  });

  useEffect(() => {
    const client = new WebBffClient({ getTenantHeaders });
    client.getDashboardOverview().then(setMetrics);
  }, [getTenantHeaders]);

  const formatInr = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Executive Overview</h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time renewable operations and EPC project health for {activeOrganisationName}
          </p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm" onClick={() => onNavigate('estimator')}>
            ☀️ Solar Estimator
          </Button>
          <Button variant="primary" size="sm" onClick={() => onNavigate('quotations')}>
            + New Quotation
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-emerald-500">
          <div className="text-xs font-semibold text-slate-500 uppercase">Monthly Revenue</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {formatInr(metrics.monthlyRevenueInr)}
          </div>
          <div className="text-[11px] text-emerald-600 font-medium mt-1">↑ 18.4% vs last month</div>
        </Card>

        <Card className="border-l-4 border-l-sky-500">
          <div className="text-xs font-semibold text-slate-500 uppercase">Active EPC Projects</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {metrics.activeProjectsCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {metrics.completedHandoverThisMonth} plants commissioned this month
          </div>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <div className="text-xs font-semibold text-slate-500 uppercase">Pipeline Leads</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {metrics.pipelineLeadsCount}
          </div>
          <div className="text-[11px] text-amber-600 font-medium mt-1">12 awaiting engineering survey</div>
        </Card>

        <Card className="border-l-4 border-l-rose-500">
          <div className="text-xs font-semibold text-slate-500 uppercase">Critical Low Stock</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {metrics.lowStockItemsCount} SKUs
          </div>
          <div className="text-[11px] text-rose-600 font-medium mt-1">
            Solar Inverters & Aluminium clamps below safety threshold
          </div>
        </Card>
      </div>

      {/* Operational Highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card title="EPC Execution Velocity" subtitle="Milestone tracking across commissioned & ongoing projects">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-slate-700">Site Survey & Engineering Design</span>
                  <span className="font-semibold text-slate-900">92% on schedule</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full w-[92%]" />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-slate-700">Procurement & Material Delivery</span>
                  <span className="font-semibold text-slate-900">84% on schedule</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full w-[84%]" />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-slate-700">DISCOM Net-Metering & CEIG Approvals</span>
                  <span className="font-semibold text-slate-900">76% on schedule</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full w-[76%]" />
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div>
          <Card title="Quick Actions & Operations" subtitle="India renewable SaaS shortcuts">
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start text-xs"
                onClick={() => onNavigate('estimator')}
              >
                📐 Calculate Solar PV Size from DISCOM Bill
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start text-xs"
                onClick={() => onNavigate('quotations')}
              >
                📄 Review Pending Quotation Revisions
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start text-xs"
                onClick={() => onNavigate('projects')}
              >
                ⚡ View EPC Plant Commissioning Queue
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start text-xs"
                onClick={() => onNavigate('inventory')}
              >
                📦 Check Warehouse Double-Entry Balances
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
