// ==============================================================================
// AETHRA Web UI — Quotation Review & Digital Click-to-Accept View
// ==============================================================================

import React, { useState } from 'react';
import { Card } from '../ui/Card.js';
import { Button } from '../ui/Button.js';
import { Badge } from '../ui/Badge.js';
import { WebQuotationView } from '../../types/web.types.js';
import { WebQuotationService } from '../../services/quotationService.js';
import { useAuth } from '../../context/AuthContext.js';

export const QuotationAcceptanceView: React.FC<{
  initialQuotation?: WebQuotationView;
  onAcceptSuccess?: (quotationId: string) => void;
}> = ({ initialQuotation, onAcceptSuccess }) => {
  const { userId } = useAuth();
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sampleQuotation: WebQuotationView = initialQuotation || {
    quotationId: 'quot-blr-2026-8811',
    quotationNumber: 'QT-2026-8811',
    revisionNumber: 1,
    status: 'issued',
    customerName: 'Aditi Rao',
    customerEmail: 'aditi.rao@example.com',
    systemCapacityKw: 8.0,
    validUntil: '2026-12-15T23:59:59Z',
    lines: [
      {
        id: 'l-01',
        itemDescription: 'Mono PERC Half-Cut Bifacial Solar Modules 550W (Tier-1)',
        itemType: 'module',
        hsnCode: '85414300',
        quantity: 15,
        unit: 'nos',
        unitPrice: 12500,
        taxRatePercent: 13.8,
        lineTotal: 187500,
        taxAmount: 25875,
        netAmount: 213375,
      },
      {
        id: 'l-02',
        itemDescription: 'Three-Phase On-Grid Solar Inverter 8kW with Remote WiFi',
        itemType: 'inverter',
        hsnCode: '85044090',
        quantity: 1,
        unit: 'nos',
        unitPrice: 65000,
        taxRatePercent: 13.8,
        lineTotal: 65000,
        taxAmount: 8970,
        netAmount: 73970,
      },
      {
        id: 'l-03',
        itemDescription: 'HDG Aluminium Elevated Rooftop Mounting Structure (150 km/h wind rated)',
        itemType: 'structure',
        hsnCode: '73089090',
        quantity: 1,
        unit: 'set',
        unitPrice: 42000,
        taxRatePercent: 13.8,
        lineTotal: 42000,
        taxAmount: 5796,
        netAmount: 47796,
      },
      {
        id: 'l-04',
        itemDescription: 'Electrical BOS, AC/DC Distribution Box, Copper Earthing & CEIG Net-Metering Works',
        itemType: 'bos',
        hsnCode: '85371000',
        quantity: 1,
        unit: 'lot',
        unitPrice: 55000,
        taxRatePercent: 13.8,
        lineTotal: 55000,
        taxAmount: 7590,
        netAmount: 62590,
      },
    ],
    subtotalAmount: 349500,
    totalTaxAmount: 48231,
    totalPayableAmount: 397731,
    milestonePayments: [
      { milestoneName: 'Advance Signing & Engineering Approval (20%)', percentage: 20, amountInr: 79546.2 },
      { milestoneName: 'Delivery of Solar Modules & Inverters to Site (60%)', percentage: 60, amountInr: 238638.6 },
      { milestoneName: 'DISCOM Net-Metering & Plant Handover (20%)', percentage: 20, amountInr: 79546.2 },
    ],
  };

  const [quotation, setQuotation] = useState<WebQuotationView>(sampleQuotation);

  const formatInr = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleAcceptQuotation = async () => {
    if (!termsAgreed) {
      setErrorMsg('You must agree to the installation terms and scope of work to proceed.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      // Verify and prepare digital acceptance payload
      const acceptance = WebQuotationService.prepareAcceptancePayload(
        quotation,
        userId || 'usr-customer-aditi',
        '203.0.113.195'
      );

      // Simulate digital acceptance request to BFF
      await new Promise((resolve) => setTimeout(resolve, 600));

      setQuotation({
        ...quotation,
        status: 'accepted',
        acceptedAt: acceptance.acceptedAt,
      });

      if (onAcceptSuccess) {
        onAcceptSuccess(quotation.quotationId);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold text-slate-900">
              Quotation {quotation.quotationNumber} (Rev {quotation.revisionNumber})
            </h1>
            <Badge
              variant={
                quotation.status === 'accepted'
                  ? 'success'
                  : quotation.status === 'issued'
                    ? 'info'
                    : 'neutral'
              }
            >
              {quotation.status.toUpperCase()}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Prepared for {quotation.customerName} • {quotation.systemCapacityKw} kWp Grid-Tied Solar Rooftop
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Bill of Quantities / Line Items Table */}
      <Card title="Bill of Materials & Pricing Breakdown">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold">
              <tr>
                <th className="py-2.5 px-3">Item Description</th>
                <th className="py-2.5 px-3">HSN Code</th>
                <th className="py-2.5 px-3 text-center">Qty</th>
                <th className="py-2.5 px-3 text-right">Unit Price</th>
                <th className="py-2.5 px-3 text-right">GST Rate</th>
                <th className="py-2.5 px-3 text-right">Net Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {quotation.lines.map((line) => (
                <tr key={line.id} className="hover:bg-slate-50">
                  <td className="py-3 px-3 font-medium text-slate-900">
                    {line.itemDescription}
                    <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] rounded bg-slate-100 text-slate-600 uppercase">
                      {line.itemType}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-500 font-mono">{line.hsnCode}</td>
                  <td className="py-3 px-3 text-center">
                    {line.quantity} {line.unit}
                  </td>
                  <td className="py-3 px-3 text-right">{formatInr(line.unitPrice)}</td>
                  <td className="py-3 px-3 text-right font-medium text-slate-600">
                    {line.taxRatePercent}%
                  </td>
                  <td className="py-3 px-3 text-right font-semibold text-slate-900">
                    {formatInr(line.netAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
              <tr>
                <td colSpan={5} className="py-2 px-3 text-right text-slate-600">
                  Subtotal (Excl. Taxes):
                </td>
                <td className="py-2 px-3 text-right text-slate-900">
                  {formatInr(quotation.subtotalAmount)}
                </td>
              </tr>
              <tr>
                <td colSpan={5} className="py-2 px-3 text-right text-slate-600">
                  Composite Solar GST (13.8%):
                </td>
                <td className="py-2 px-3 text-right text-slate-900">
                  {formatInr(quotation.totalTaxAmount)}
                </td>
              </tr>
              <tr className="text-sm border-t border-slate-200">
                <td colSpan={5} className="py-3 px-3 text-right text-emerald-800">
                  Total Payable Amount (All Inclusive):
                </td>
                <td className="py-3 px-3 text-right text-emerald-800 text-base font-bold">
                  {formatInr(quotation.totalPayableAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Milestone Payment Schedule */}
      <Card title="Milestone Payment Terms">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quotation.milestonePayments.map((milestone, idx) => (
            <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="text-xs font-semibold text-slate-500 uppercase">
                Stage {idx + 1} ({milestone.percentage}%)
              </div>
              <div className="text-base font-bold text-slate-900 mt-1">
                {formatInr(milestone.amountInr)}
              </div>
              <div className="text-xs text-slate-600 mt-1">{milestone.milestoneName}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Customer Digital Click-to-Accept Section */}
      {quotation.status === 'issued' ? (
        <Card className="border-2 border-emerald-500 bg-emerald-50/20">
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900">Digital Acceptance & Execution Sign-off</h3>
            <p className="text-xs text-slate-600">
              By accepting this quotation, you authorize Sunvolt Solar Solutions to initiate engineering site surveys, DISCOM net-metering applications, and procurement.
            </p>

            <div className="flex items-start space-x-3 pt-2">
              <input
                id="terms"
                type="checkbox"
                checked={termsAgreed}
                onChange={(e) => setTermsAgreed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="terms" className="text-xs text-slate-700">
                I hereby accept quotation <strong>{quotation.quotationNumber} (Revision {quotation.revisionNumber})</strong> and agree to the payment schedule and turnkey EPC delivery terms.
              </label>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                variant="primary"
                size="lg"
                isLoading={isSubmitting}
                disabled={!termsAgreed}
                onClick={handleAcceptQuotation}
              >
                ✓ Click to Accept Quotation & Kickoff Project
              </Button>
            </div>
          </div>
        </Card>
      ) : quotation.status === 'accepted' ? (
        <div className="p-4 bg-emerald-100 border border-emerald-300 rounded-xl flex items-center justify-between">
          <div>
            <div className="font-bold text-emerald-900 text-sm">
              ✓ Quotation Accepted by Customer
            </div>
            <div className="text-xs text-emerald-700 mt-0.5">
              Accepted at {quotation.acceptedAt || new Date().toISOString()} • Distributed Saga 3 automatically provisioned EPC project and allocated inventory.
            </div>
          </div>
          <Badge variant="success">FROZEN & IMMUTABLE</Badge>
        </div>
      ) : null}
    </div>
  );
};
