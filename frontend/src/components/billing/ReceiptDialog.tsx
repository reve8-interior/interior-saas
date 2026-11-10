'use client';

import { Modal } from '@/components/ui/Modal';
import { formatDate, formatPaise } from '@/lib/billing';
import type { Receipt } from '@/lib/schemas/billing';

interface ReceiptDialogProps {
  receipt: Receipt | null;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-dark-500">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

/** A printable payment receipt; "Print / Save as PDF" uses the browser. */
export function ReceiptDialog({ receipt, onClose }: ReceiptDialogProps) {
  return (
    <Modal
      open={receipt !== null}
      onClose={onClose}
      title="Payment receipt"
      maxWidth="md"
    >
      {receipt && (
        <div className="space-y-4">
          <div id="receipt-print" className="space-y-4">
            <div>
              <p className="font-heading text-lg font-extrabold">
                {receipt.issuer_name}
              </p>
              {receipt.issuer_address && (
                <p className="whitespace-pre-line text-xs text-dark-500">
                  {receipt.issuer_address}
                </p>
              )}
            </div>
            <p className="text-xs uppercase tracking-wide text-dark-500">
              Payment receipt · {receipt.receipt_number}
            </p>
            <dl className="divide-y divide-dark-200/60 dark:divide-dark-700/60">
              <Row label="Receipt no." value={receipt.receipt_number} />
              <Row label="Status" value="Paid" />
              <Row label="Billed to" value={receipt.billed_to} />
              <Row label="Date" value={formatDate(receipt.paid_at)} />
              <Row
                label="Plan"
                value={`${receipt.plan_name} (${receipt.billing_cycle})`}
              />
              {receipt.period_start && receipt.period_end && (
                <Row
                  label="Period"
                  value={`${formatDate(receipt.period_start)} to ${formatDate(receipt.period_end)}`}
                />
              )}
              {receipt.method && (
                <Row label="Paid by" value={receipt.method.toUpperCase()} />
              )}
              <Row label="Currency" value={receipt.currency.toUpperCase()} />
              <Row label="Payment ID" value={receipt.razorpay_payment_id} />
              <div className="flex justify-between gap-4 py-2 text-base font-extrabold">
                <dt>Amount paid</dt>
                <dd>{formatPaise(receipt.amount_paise)}</dd>
              </div>
            </dl>
            <p className="text-xs text-dark-500">
              This is a receipt confirming payment. It is not a GST tax invoice.
            </p>
          </div>
          <div className="flex gap-3 print:hidden">
            <button className="btn-secondary flex-1" onClick={onClose}>
              Close
            </button>
            <button
              className="btn-primary flex-1"
              onClick={() => window.print()}
            >
              Print / Save as PDF
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
