// ==============================================================================
// AETHRA Mobile — Type Definitions & Offline Contracts
// ==============================================================================

export type MutationType =
  | 'submit_site_survey'
  | 'record_technician_visit'
  | 'upload_site_photo'
  | 'update_milestone_progress';

export interface OfflineMutation<T = any> {
  clientMutationId: string;
  type: MutationType;
  entityId: string;
  payload: T;
  timestamp: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
  lastError?: string;
}

export interface MobileSiteSurvey {
  surveyId: string;
  projectId?: string;
  leadId?: string;
  customerId: string;
  technicianUserId: string;
  siteAddress: string;
  latitude: number;
  longitude: number;
  roofType: 'rcc_flat' | 'metal_sheet' | 'tiled_roof' | 'ground_mount';
  totalRoofAreaSqFt: number;
  usableShadowFreeAreaSqFt: number;
  sanctionedLoadKw: number;
  discomName: string;
  discomConsumerNumber: string;
  sitePhotoDocIds: string[];
  remarks?: string;
  surveyedAt: string;
}

export interface MobileTechnicianVisit {
  visitId: string;
  ticketId: string;
  technicianUserId: string;
  workDescription: string;
  faultIdentified: string;
  sparePartReplaced?: {
    partType: 'inverter' | 'panel' | 'mc4_connector' | 'spd_module';
    oldSerialNumber: string;
    newSerialNumber: string;
    warrantyClaimed: boolean;
  };
  resolutionStatus: 'resolved' | 'followup_required';
  customerRatingStars?: number; // 1 to 5
  customerFeedback?: string;
  completedAt: string;
}

export interface MobileHomeFeedItem {
  id: string;
  type: 'assigned_survey' | 'service_ticket' | 'handover_signoff';
  title: string;
  subtitle: string;
  dueTime: string;
  priority: 'urgent' | 'high' | 'normal';
}

export interface SolarTelemetrySnapshot {
  installationId: string;
  systemName: string;
  currentPowerKw: number;
  peakPowerTodayKw: number;
  energyTodayKwh: number;
  lifetimeEnergyMwh: number;
  co2AvoidedKg: number;
  gridStatus: 'grid_online' | 'grid_down' | 'islanded';
  batteryStateOfChargePercent?: number;
  updatedAt: string;
}
