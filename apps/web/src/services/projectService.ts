// ==============================================================================
// AETHRA Web — EPC Solar Project Service & Customer Projection Sanitizer
// ==============================================================================

import { WebProjectView, WebProjectMilestone } from '../types/web.types.js';

export class WebProjectService {
  /**
   * Computes the overall progress percentage from milestones based on their weights.
   */
  static calculateOverallProgress(milestones: WebProjectMilestone[]): number {
    let completedWeight = 0;
    let totalWeight = 0;

    for (const m of milestones) {
      totalWeight += m.weightagePercent;
      if (m.status === 'completed') {
        completedWeight += m.weightagePercent;
      } else if (m.status === 'in_progress') {
        completedWeight += m.weightagePercent * 0.5; // Half progress for in-progress phase
      }
    }

    if (totalWeight === 0) return 0;
    return Math.round((completedWeight / totalWeight) * 1000) / 10;
  }

  /**
   * Sanitizes internal EPC project representation for Customer Portal display.
   * Guarantees:
   * - Strips subcontractor purchase costs and contractor margin data.
   * - Strips internal engineering notes and technician disciplinary remarks.
   * - Filters out non-customer-visible milestones.
   */
  static toCustomerSafeView(project: WebProjectView): Omit<WebProjectView, 'internalNotes' | 'subcontractorCostInr'> {
    const customerVisibleMilestones = project.milestones.filter((m) => m.isCustomerVisible);
    const sanitizedProgress = this.calculateOverallProgress(customerVisibleMilestones);

    return {
      projectId: project.projectId,
      projectCode: project.projectCode,
      projectName: project.projectName,
      customerId: project.customerId,
      customerName: project.customerName,
      propertyAddress: project.propertyAddress,
      capacityKw: project.capacityKw,
      status: project.status,
      overallProgressPercentage: sanitizedProgress,
      currentPhaseDisplay: project.currentPhaseDisplay,
      milestones: customerVisibleMilestones,
    };
  }
}
