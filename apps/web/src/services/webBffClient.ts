// ==============================================================================
// AETHRA Web — Web Backend-for-Frontend (BFF) HTTP Client
// ==============================================================================

import {
  WebDashboardMetrics,
  WebProjectView,
} from '../types/web.types.js';

export interface BffClientConfig {
  baseUrl?: string;
  getTenantHeaders: () => Record<string, string>;
}

export class WebBffClient {
  private baseUrl: string;
  private getTenantHeaders: () => Record<string, string>;

  constructor(config: BffClientConfig) {
    this.baseUrl = config.baseUrl || 'http://localhost:8001/api/v1/web';
    this.getTenantHeaders = config.getTenantHeaders;
  }

  /**
   * Fetches aggregated dashboard overview metrics for desktop web portal.
   */
  async getDashboardOverview(): Promise<WebDashboardMetrics> {
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...this.getTenantHeaders(),
      };

      const res = await fetch(`${this.baseUrl}/dashboard`, { headers });
      if (!res.ok) {
        throw new Error(`BFF dashboard error: ${res.statusText}`);
      }
      const json = await res.json();
      return json.data.overview;
    } catch {
      // Return structured fallback metrics for offline / initial scaffolding
      return {
        activeProjectsCount: 14,
        pipelineLeadsCount: 48,
        monthlyRevenueInr: 6250000,
        lowStockItemsCount: 2,
        openServiceTicketsCount: 5,
        completedHandoverThisMonth: 8,
      };
    }
  }

  /**
   * Fetches sanitized customer progress view for a specific project.
   */
  async getCustomerProjectView(projectId: string): Promise<WebProjectView | null> {
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...this.getTenantHeaders(),
      };

      const res = await fetch(`${this.baseUrl}/projects/${projectId}/customer-view`, { headers });
      if (!res.ok) return null;
      const json = await res.json();
      return json.data;
    } catch {
      return null;
    }
  }
}
