import type { LineItemColumnDef } from '@/lib/lineItemColumns';
import type { QuotationVersion } from '@/lib/schemas/quotationVersion';

/** Header names are read back by the backend import; keep them in sync. */
const EXTRA_HEADER_PREFIX = 'extra:';
const SHEET_NAME = 'Quotation';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  priced: 'Priced',
  pending_clarity: 'Pending Clarity',
  agreed: 'Agreed',
  removed: 'Removed',
};

const FIXED_HEADERS = [
  'Room',
  'Description',
  'Unit',
  'Dimension',
  'Qty',
  'Rate',
  'Initial Price',
  'Negotiated Price',
  'Est. Time',
  'Status',
  'Remarks',
] as const;

/**
 * Download one saved version as a flat sheet that can be edited and
 * imported back as a new version.
 */
export async function exportVersionToExcel(
  clientName: string,
  version: QuotationVersion,
  columns: LineItemColumnDef[]
): Promise<void> {
  // exceljs is ~1MB; load it only when an export is actually requested.
  const { default: ExcelJS } = await import('exceljs');
  const customCols = columns.filter((c) => c.enabled && !c.builtin);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Reve8';
  const ws = wb.addWorksheet(SHEET_NAME);

  const header = ws.addRow([
    ...FIXED_HEADERS,
    ...customCols.map((c) => `${EXTRA_HEADER_PREFIX}${c.key}`),
  ]);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1A1A2E' },
    };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const item of version.line_items) {
    ws.addRow([
      item.room,
      item.description,
      item.unit,
      item.raw_dimension ?? '',
      item.qty ?? '',
      item.rate ?? '',
      item.initial_price ?? '',
      item.negotiated_price ?? '',
      item.est_time ?? '',
      STATUS_LABELS[item.status] ?? item.status,
      item.remarks ?? '',
      ...customCols.map((c) => (item.extra ?? {})[c.key] ?? ''),
    ]);
  }

  ws.columns.forEach((col, i) => {
    col.width = i === 1 ? 40 : i === 10 ? 30 : 16;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `Quotation_${clientName.replace(/\s+/g, '_')}_v${version.number}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
