// ==============================================================================
// AETHRA Web UI — EPC Solar Project Tracker & Milestone Projection View
// ==============================================================================

import React, { useState } from 'react';
import { Card } from '../ui/Card.js';
import { Badge } from '../ui/Badge.js';
import { ProgressBar } from '../ui/ProgressBar.js';
import { WebProjectView } from '../../types/web.types.js';
import { WebProjectService } from '../../services/projectService.js';

export const ProjectTrackerView: React.FC<{ initialProject?: WebProjectView }> = ({
  initialProject,
}) => {
  const [isCustomerViewMode, setIsCustomerViewMode] = useState(false);

  const sampleProject: WebProjectView = initialProject || {
    projectId: 'prj-indiranagar-01',
    projectCode: 'PRJ-2026-4421',
    projectName: 'Aditi Rao 8kW Solar Rooftop Plant',
    customerId: 'cust-rao-99',
    customerName: 'Aditi Rao',
    propertyAddress: '142 Indiranagar 12th Main, Bangalore - 560038',
    capacityKw: 8.0,
    status: 'in_progress',
    overallProgressPercentage: 65.0,
    currentPhaseDisplay: 'Inverter, Cabling & Electrical Works',
    internalNotes: [
      'Subcontractor aluminium structure installed with SS304 bolts.',
      'Private internal margin: 22.4% after cable procurement rebate.',
      'CEIG application submitted to BESCOM Indiranagar subdivision under ref #DISCOM-BLR-8821.',
    ],
    subcontractorCostInr: 215000,
    milestones: [
      {
        id: 'ms-1',
        milestoneName: 'Site Survey & Engineering Design',
        sequenceOrder: 1,
        status: 'completed',
        weightagePercent: 15,
        isCustomerVisible: true,
        completedDate: '2026-11-05',
      },
      {
        id: 'ms-2',
        milestoneName: 'Procurement & Material Delivery',
        sequenceOrder: 2,
        status: 'completed',
        weightagePercent: 25,
        isCustomerVisible: true,
        completedDate: '2026-11-12',
      },
      {
        id: 'ms-3',
        milestoneName: 'Mounting Structure & Module Installation',
        sequenceOrder: 3,
        status: 'completed',
        weightagePercent: 25,
        isCustomerVisible: true,
        completedDate: '2026-11-18',
      },
      {
        id: 'ms-4',
        milestoneName: 'Inverter, Cabling & Electrical Works',
        sequenceOrder: 4,
        status: 'in_progress',
        weightagePercent: 15,
        isCustomerVisible: true,
      },
      {
        id: 'ms-5',
        milestoneName: 'DISCOM Net-Metering & CEIG Inspection',
        sequenceOrder: 5,
        status: 'pending',
        weightagePercent: 10,
        isCustomerVisible: true,
      },
      {
        id: 'ms-6',
        milestoneName: 'Plant Commissioning & Handover',
        sequenceOrder: 6,
        status: 'pending',
        weightagePercent: 10,
        isCustomerVisible: true,
      },
    ],
  };

  const [project] = useState<WebProjectView>(sampleProject);

  const displayData = isCustomerViewMode
    ? WebProjectService.toCustomerSafeView(project)
    : project;

  const overallProgress = WebProjectService.calculateOverallProgress(displayData.milestones);

  return (
    <div className="space-y-6">
      {/* View Header with Customer-Safe Masking Switch */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold text-slate-900">{displayData.projectName}</h1>
            <Badge variant="info">{displayData.projectCode}</Badge>
            <Badge variant="success">{displayData.capacityKw} kWp</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">{displayData.propertyAddress}</p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setIsCustomerViewMode(false)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              !isCustomerViewMode ? 'bg-white shadow text-slate-900 font-bold' : 'text-slate-600'
            }`}
          >
            🛠️ Vendor Operations View
          </button>
          <button
            onClick={() => setIsCustomerViewMode(true)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              isCustomerViewMode ? 'bg-white shadow text-emerald-800 font-bold' : 'text-slate-600'
            }`}
          >
            🔒 Customer Portal View (Sanitized)
          </button>
        </div>
      </div>

      {/* Progress Metric Card */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase">Current EPC Phase</div>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                {displayData.currentPhaseDisplay}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-500 uppercase">Overall Execution</div>
              <div className="text-2xl font-extrabold text-emerald-600">
                {overallProgress.toFixed(1)}%
              </div>
            </div>
          </div>
          <ProgressBar progressPercentage={overallProgress} color="emerald" showPercentageLabel={false} />
        </div>
      </Card>

      {/* Standard 6 Milestones Execution List */}
      <Card title="Standard 6 EPC Solar Milestones" subtitle="Phase breakdown summing to 100% completion weightage">
        <div className="space-y-4">
          {displayData.milestones.map((m) => (
            <div
              key={m.id}
              className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${
                m.status === 'completed'
                  ? 'bg-emerald-50/40 border-emerald-200'
                  : m.status === 'in_progress'
                    ? 'bg-amber-50/40 border-amber-200'
                    : 'bg-white border-slate-200 opacity-70'
              }`}
            >
              <div className="flex items-center space-x-4">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                    m.status === 'completed'
                      ? 'bg-emerald-600 text-white'
                      : m.status === 'in_progress'
                        ? 'bg-amber-500 text-white animate-pulse'
                        : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {m.status === 'completed' ? '✓' : m.sequenceOrder}
                </div>
                <div>
                  <div className="font-semibold text-sm text-slate-900">{m.milestoneName}</div>
                  <div className="text-xs text-slate-500">
                    Weight: {m.weightagePercent}% of project
                    {m.completedDate && ` • Completed on ${m.completedDate}`}
                  </div>
                </div>
              </div>

              <div>
                <Badge
                  variant={
                    m.status === 'completed'
                      ? 'success'
                      : m.status === 'in_progress'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {m.status.toUpperCase()}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Internal Vendor Only Details — Masked in Customer View */}
      {!isCustomerViewMode && (
        <Card
          title="Internal EPC Operations & Margin Intelligence"
          subtitle="Protected vendor notes — guaranteed NEVER exposed to customer portal"
          className="border-amber-300 bg-amber-50/20"
        >
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200">
              <span className="text-slate-600 font-medium">Subcontractor Total Incurred Cost:</span>
              <span className="font-bold text-slate-900">
                ₹{project.subcontractorCostInr?.toLocaleString('en-IN')}
              </span>
            </div>

            <div>
              <div className="font-semibold text-slate-700 mb-1">Internal Engineering Execution Notes:</div>
              <ul className="list-disc pl-5 space-y-1 text-slate-600">
                {project.internalNotes?.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
