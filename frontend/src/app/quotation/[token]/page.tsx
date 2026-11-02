'use client';

import { CustomerResponseBar } from '@/components/shared/CustomerResponseBar';
import { LoadingRegion, PageHeaderSkeleton, Skeleton } from '@/components/ui';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { SharedLinkError } from '@/components/shared/SharedLinkError';
import { ChevronDown, ChevronRight, Image as ImageIcon } from 'lucide-react';
import {
  CustomerFooter,
  PrintButton,
  ThemeButton,
} from '@/components/shared/CustomerChrome';
import { HotspotDetail } from '@/components/designs/HotspotDetail';
import { HotspotImage } from '@/components/designs/HotspotImage';
import { fmtRate } from '@/lib/format';
import { getSharedQuotation } from '@/lib/quotationVersions';
import { useSharedLink } from '@/lib/hooks/useSharedLink';
import type { SharedQuotationRoom } from '@/lib/schemas/quotationVersion';
import { Badge } from '@/components/ui/Badge';

const TH_CLS = 'px-3 py-2 text-left type-label';
const TD_CLS = 'px-3 py-2 text-sm tabular-nums text-text';

interface RoomSectionProps {
  room: SharedQuotationRoom;
  showPrices: boolean;
  open: boolean;
  onToggle: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onImageError: () => void;
}

/** One room: click the header to reveal its lines and attached images. */
function RoomSection({
  room,
  showPrices,
  open,
  onToggle,
  selectedId,
  onSelect,
  onImageError,
}: RoomSectionProps) {
  const selected =
    room.designs.flatMap((d) => d.hotspots).find((h) => h.id === selectedId) ??
    null;

  return (
    <section className="surface overflow-hidden">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full items-center gap-2 px-4 py-3 text-left font-heading text-sm font-semibold text-text transition-colors hover:bg-surface-2"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" />
          )}
          <span className="flex-1">{room.room}</span>
          {room.designs.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-control bg-brand/10 px-2 py-0.5 text-xs font-medium text-accent-text">
              <ImageIcon className="h-3 w-3" aria-hidden />
              {room.designs.length}{' '}
              {room.designs.length === 1 ? 'image' : 'images'}
            </span>
          )}
          {room.total !== null && <span>{fmtRate(room.total)}</span>}
        </button>
      </h2>

      {open && (
        <div className="space-y-4 p-3">
          {room.designs.map((design, index) => (
            <figure key={design.id} className="space-y-2">
              {design.image_url && (
                <HotspotImage
                  src={design.image_url}
                  alt={design.title || `${room.room} design`}
                  hotspots={design.hotspots}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onImageError={onImageError}
                  zoomable
                />
              )}
              {room.designs.length > 1 && (
                <p className="text-xs font-medium text-faint">
                  Image {index + 1} of {room.designs.length}
                </p>
              )}
              {(design.title || design.description) && (
                <figcaption className="text-sm text-muted">
                  {design.title}
                  {design.title && design.description ? ' — ' : ''}
                  {design.description}
                </figcaption>
              )}
            </figure>
          ))}
          {selected && (
            <HotspotDetail
              popup
              label={selected.label}
              notes={selected.notes}
              item={selected.item}
              dimensions={selected.dimensions}
              labourCost={selected.labour_cost}
              onClose={() => onSelect(null)}
            />
          )}

          <ul className="divide-y divide-line sm:hidden">
            {room.items.map((item, i) => (
              <li key={i} className="py-3">
                <p className="text-sm font-medium text-text">
                  {item.description}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {[
                    item.raw_dimension,
                    item.qty != null ? `${item.qty} ${item.unit}` : null,
                    item.est_time,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </p>
                {showPrices && item.amount !== null && (
                  <p className="mt-1 text-right text-sm font-semibold tabular-nums text-text">
                    {fmtRate(item.amount)}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={TH_CLS}>Item</th>
                  <th className={TH_CLS}>Size</th>
                  <th className={TH_CLS}>Qty</th>
                  <th className={TH_CLS}>Time</th>
                  {showPrices && <th className={TH_CLS}>Rate</th>}
                  {showPrices && <th className={TH_CLS}>Amount</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {room.items.map((item, i) => (
                  <tr key={i}>
                    <td className={TD_CLS}>{item.description}</td>
                    <td className={TD_CLS}>{item.raw_dimension ?? '—'}</td>
                    <td className={TD_CLS}>
                      {item.qty ?? '—'} {item.unit}
                    </td>
                    <td className={TD_CLS}>{item.est_time ?? '—'}</td>
                    {showPrices && (
                      <td className={TD_CLS}>
                        {item.rate !== null ? fmtRate(item.rate) : '—'}
                      </td>
                    )}
                    {showPrices && (
                      <td className={TD_CLS}>
                        {item.amount !== null ? fmtRate(item.amount) : '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

/** Public, view-only quotation reached from a designer's share link. */
export default function SharedQuotationPage() {
  const { token } = useParams<{ token: string }>();
  const { state, retry, onImageError } = useSharedLink(
    token,
    getSharedQuotation
  );
  // null until the visitor toggles a room; then the first room shows open.
  const [toggledRooms, setToggledRooms] = useState<Set<string> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (state.status === 'loading') {
    return (
      <main className="mx-auto max-w-4xl p-4 sm:p-8">
        <LoadingRegion label="Loading quotation" className="space-y-6">
          <PageHeaderSkeleton />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </LoadingRegion>
      </main>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <SharedLinkError subject="quotation" gone={state.gone} onRetry={retry} />
    );
  }

  const { view } = state;
  // Start with the first room open so the page is never blank.
  const openRooms =
    toggledRooms ?? new Set(view.rooms[0] ? [view.rooms[0].room] : []);
  const toggleRoom = (room: string) => {
    const next = new Set(openRooms);
    if (!next.delete(room)) next.add(room);
    setToggledRooms(next);
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {view.business_name && (
            <p className="type-label">{view.business_name}</p>
          )}
          <h1 className="font-heading text-2xl font-bold text-text">
            {view.project_name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Quotation v{view.version_number}
            {view.label ? ` · ${view.label}` : ''} ·{' '}
            {new Date(view.created_at).toLocaleDateString()}
          </p>
          {view.is_agreed && (
            <p className="mt-2">
              <Badge tone="success">Agreed version</Badge>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {view.rooms.length > 1 && (
            <button
              type="button"
              onClick={() =>
                setToggledRooms(
                  openRooms.size === view.rooms.length
                    ? new Set()
                    : new Set(view.rooms.map((r) => r.room))
                )
              }
              className="btn-secondary print:hidden"
            >
              {openRooms.size === view.rooms.length
                ? 'Collapse all'
                : 'Expand all'}
            </button>
          )}
          <PrintButton
            beforePrint={() =>
              setToggledRooms(new Set(view.rooms.map((r) => r.room)))
            }
          />
          <ThemeButton />
        </div>
      </header>

      {view.rooms.map((room) => (
        <RoomSection
          key={room.room}
          room={room}
          showPrices={view.show_prices}
          open={openRooms.has(room.room)}
          onToggle={() => toggleRoom(room.room)}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onImageError={onImageError}
        />
      ))}

      <CustomerResponseBar
        token={token}
        initialKind={view.responded_kind}
        contactEmail={view.contact_email}
        contactPhone={view.contact_phone}
      />

      {view.total !== null && (
        <p className="surface px-4 py-3 text-right font-heading text-lg font-bold tabular-nums text-text">
          Total: {fmtRate(view.total)}
        </p>
      )}

      <CustomerFooter businessName={view.business_name} />
    </main>
  );
}
