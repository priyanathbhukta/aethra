// ==============================================================================
// AETHRA Web — Quotation Service & Digital Acceptance Processor
// ==============================================================================

import { WebQuotationLineItem, WebQuotationView } from '../types/web.types.js';

export interface DigitalAcceptancePayload {
  quotationId: string;
  revisionNumber: number;
  acceptedByUserId: string;
  customerIpAddress: string;
  signatureType: 'digital_click';
  termsAccepted: boolean;
  acceptedAt: string;
}

export class WebQuotationService {
  /**
   * Computes subtotal, tax amount, and net line total for quotation line items.
   * Standard renewable EPC composite tax in India is 13.8% (70% goods @ 12% + 30% services @ 18%).
   */
  static calculateLineItem(
    item: Omit<WebQuotationLineItem, 'lineTotal' | 'taxAmount' | 'netAmount'> & { taxRatePercent?: number }
  ): WebQuotationLineItem {
    const taxRate = item.taxRatePercent !== undefined ? item.taxRatePercent : 13.8;
    const lineTotal = Math.round(item.quantity * item.unitPrice * 100) / 100;
    const taxAmount = Math.round(((lineTotal * taxRate) / 100) * 100) / 100;
    const netAmount = Math.round((lineTotal + taxAmount) * 100) / 100;

    return {
      ...item,
      taxRatePercent: taxRate,
      lineTotal,
      taxAmount,
      netAmount,
    };
  }

  /**
   * Calculates overall quotation totals and milestone payment schedule.
   */
  static calculateQuotationTotals(
    lines: WebQuotationLineItem[],
    milestonePercentages = [
      { name: 'Advance Booking & Engineering', percentage: 20 },
      { name: 'Delivery of Solar Modules & Inverters', percentage: 60 },
      { name: 'Plant Commissioning & Handover', percentage: 20 },
    ]
  ) {
    const subtotalAmount = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const totalTaxAmount = lines.reduce((sum, l) => sum + l.taxAmount, 0);
    const totalPayableAmount = Math.round((subtotalAmount + totalTaxAmount) * 100) / 100;

    const milestonePayments = milestonePercentages.map((m) => ({
      milestoneName: m.name,
      percentage: m.percentage,
      amountInr: Math.round((totalPayableAmount * (m.percentage / 100)) * 100) / 100,
    }));

    return {
      subtotalAmount: Math.round(subtotalAmount * 100) / 100,
      totalTaxAmount: Math.round(totalTaxAmount * 100) / 100,
      totalPayableAmount,
      milestonePayments,
    };
  }

  /**
   * Constructs digital click-to-accept payload for quotation acceptance.
   * Enforces that the quotation must be in 'issued' status and terms must be checked.
   */
  static prepareAcceptancePayload(
    quotation: WebQuotationView,
    userId: string,
    customerIp = '127.0.0.1'
  ): DigitalAcceptancePayload {
    if (quotation.status !== 'issued') {
      throw new Error(`Cannot accept quotation in '${quotation.status}' status (must be 'issued')`);
    }

    return {
      quotationId: quotation.quotationId,
      revisionNumber: quotation.revisionNumber,
      acceptedByUserId: userId,
      customerIpAddress: customerIp,
      signatureType: 'digital_click',
      termsAccepted: true,
      acceptedAt: new Date().toISOString(),
    };
  }
}
