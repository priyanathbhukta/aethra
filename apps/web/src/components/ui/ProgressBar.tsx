// ==============================================================================
// AETHRA Web UI — Progress Bar Component
// ==============================================================================

import React from 'react';

export interface ProgressBarProps {
  progressPercentage: number;
  label?: string;
  showPercentageLabel?: boolean;
  color?: 'emerald' | 'amber' | 'sky';
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progressPercentage,
  label,
  showPercentageLabel = true,
  color = 'emerald',
}) => {
  const boundedProgress = Math.min(100, Math.max(0, progressPercentage));

  const colorClasses = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    sky: 'bg-sky-500',
  };

  return (
    <div className="w-full">
      {(label || showPercentageLabel) && (
        <div className="flex justify-between items-center mb-1 text-xs">
          {label && <span className="font-medium text-slate-700">{label}</span>}
          {showPercentageLabel && (
            <span className="font-semibold text-slate-900">{boundedProgress.toFixed(1)}%</span>
          )}
        </div>
      )}
      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 rounded-full ${colorClasses[color]}`}
          style={{ width: `${boundedProgress}%` }}
        />
      </div>
    </div>
  );
};
