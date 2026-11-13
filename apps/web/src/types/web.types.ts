// ==============================================================================
// AETHRA Web Application — Type Definitions & View Models
// ==============================================================================

export interface TenantContextState {
  activeOrganisationId: string;
  activeOrganisationName: string;
  activeRole: string;
  availableOrganisations: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

export interface UserSessionState {
  userId: string;
  email: string;
  fullName: string;
  isAuthenticated: boolean;
  token?: string;
  claims?: Record<string, any>;
}

export interface WebDashboardMetrics {
  activeProjectsCount: number;
  pipelineLeadsCount: number;
  monthlyRevenueInr: number;
  lowStockItemsCount: number;
  openServiceTicketsCount: number;
  completedHandoverThisMonth: number;
}

export interface SolarEstimatorInput {
  sanctionedLoadKw: number;
  averageMonthlyConsumptionKwh: number;
  tariffRatePerKwh: number;
  availableRoofAreaSqFt: number;
  shadeFactorPercentage: number;
  customerType: 'residential' | 'commercial' | 'industrial';
}

export interface SolarEstimatorResult {
  recommendedCapacityKw: number;
  estimatedAnnualGenerationKwh: number;
  estimatedAnnualSavingsInr: number;
  estimatedSystemCostInr: number;
  paybackPeriodYears: number;
  co2OffsetTonnesAnnual: number;
  requiredRoofAreaSqFt: number;
  isFeasibleWithinSanctionedLoad: boolean;
}

export interface WebQuotationLineItem {
  id: string;
  itemDescription: string;
  itemType: 'module' | 'inverter' | 'structure' | 'bos' | 'installation';
  hsnCode: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRatePercent: number;
  lineTotal: number;
  taxAmount: number;
  netAmount: number;
}

export interface WebQuotationView {
  quotationId: string;
  quotationNumber: string;
  revisionNumber: number;
  status: 'draft' | 'issued' | 'accepted' | 'rejected' | 'superseded';
  customerName: string;
  customerEmail: string;
  systemCapacityKw: number;
  lines: WebQuotationLineItem[];
  subtotalAmount: number;
  totalTaxAmount: number;
  totalPayableAmount: number;
  validUntil: string;
  acceptedAt?: string;
  milestonePayments: Array<{
    milestoneName: string;
    percentage: number;
    amountInr: number;
  }>;
}

export interface WebProjectMilestone {
  id: string;
  milestoneName: string;
  sequenceOrder: number;
  status: 'pending' | 'in_progress' | 'completed';
  weightagePercent: number;
  isCustomerVisible: boolean;
  targetDate?: string;
  completedDate?: string;
}

export interface WebProjectView {
  projectId: string;
  projectCode: string;
  projectName: string;
  customerId: string;
  customerName: string;
  propertyAddress: string;
  capacityKw: number;
  status: 'initiated' | 'in_progress' | 'commissioned' | 'handover_completed';
  overallProgressPercentage: number;
  currentPhaseDisplay: string;
  milestones: WebProjectMilestone[];
  internalNotes?: string[];
  subcontractorCostInr?: number; // Only visible in Internal View
}

export interface WebStockBalance {
  warehouseId: string;
  warehouseName: string;
  productId: string;
  productName: string;
  productCategory: string;
  onHandQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  reorderLevel: number;
  isLowStock: boolean;
}

export interface WebAmcContractView {
  amcId: string;
  amcCode: string;
  customerName: string;
  propertyAddress: string;
  capacityKw: number;
  contractTier: 'preventive_only' | 'comprehensive' | 'custom';
  visitsPerYear: number;
  completedVisitsCount: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'expired' | 'renewed';
}
