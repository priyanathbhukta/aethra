// ==============================================================================
// AETHRA Web UI — AMC Contracts & Customer Service Portal View
// ==============================================================================

import React from 'react';
import { Card } from '../ui/Card.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { WebAmcContractView } from '../../types/web.types.js';

export const AmcServicePortalView: React.FC = () => {
  const amcContracts: WebAmcContractView[] = [
    {
      amcId: 'amc-01',
      amcCode: 'AMC-2026-7721',
      customerName: 'Rajesh Sharma',
      propertyAddress: '142 Indiranagar, Bangalore',
      capacityKw: 10.0,
      contractTier: 'comprehensive',
      visitsPerYear: 4,
      completedVisitsCount: 2,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'active',
    },
    {
      amcId: 'amc-02',
      amcCode: 'AMC-2026-4412',
      customerName: 'Aditi Rao',
      propertyAddress: 'Indiranagar 12th Main, Bangalore',
      capacityKw: 8.0,
      contractTier: 'preventive_only',
      visitsPerYear: 4,
      completedVisitsCount: 1,
      startDate: '2026-03-01',
      endDate: '2027-02-28',
      status: 'active',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">AMC & Plant Maintenance</h1>
          <p className="text-xs text-slate-500 mt-1">
            Annual Maintenance Contracts, scheduled preventive inspections, and warranty management
          </p>
        </div>
        <Button variant="primary" size="sm">
          + Provision New AMC Contract
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {amcContracts.map((contract) => (
          <Card key={contract.amcId} title={contract.amcCode} subtitle={contract.propertyAddress}>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Customer:</span>
                <span className="font-semibold text-slate-800">{contract.customerName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Plant Capacity:</span>
                <span className="font-bold text-emerald-700">{contract.capacityKw} kWp</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Contract Tier:</span>
                <Badge variant={contract.contractTier === 'comprehensive' ? 'success' : 'info'}>
                  {contract.contractTier.toUpperCase()}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Preventive Visits:</span>
                <span className="font-semibold text-slate-800">
                  {contract.completedVisitsCount} of {contract.visitsPerYear} completed
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                <span>Valid: {contract.startDate} to {contract.endDate}</span>
                <Badge variant="success">ACTIVE</Badge>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
