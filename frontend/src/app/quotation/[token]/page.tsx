'use client';

import { LoadingRegion, PageHeaderSkeleton, Skeleton } from '@/components/ui';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Moon,
  Sun,
} from 'lucide-react';
import { useTheme } from '@/components/providers/ThemeProvider';
import { HotspotDetail } from '@/components/designs/HotspotDetail';
import { HotspotImage } from '@/components/designs/HotspotImage';
import { fmtRate } from '@/lib/format';
import { getSharedQuotation } from '@/lib/quotationVersions';
import type {
  SharedQuotationRoom,
  SharedQuotationView,
} from '@/lib/schemas/quotationVersion';
import { Badge } from '@/components/ui/Badge';

type LoadState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; view: SharedQuotationView };

const TH_CLS =
  'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-dark-500 dark:text-dark-400';
const TD_CLS = 'px-3 py-2 text-sm text-dark-800 dark:text-dark-200';

function ThemeButton() {
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${next} mode`}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dark-200 text-dark-700 hover:bg-dark-100 dark:border-dark-700 dark:text-dark-200 dark:hover:bg-dark-800"
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5" aria-hidden />
      ) : (
        <Moon className="h-5 w-5" aria-hidden />
      )}
    </button>
  );
}

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
    <section className="overflow-hidden rounded-lg border border-dark-200 dark:border-dark-700">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full items-center gap-2 bg-dark-50 px-3 py-2 text-left font-heading text-sm font-semibold text-dark-900 dark:bg-dark-800 dark:text-white"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" />
          )}
          <span className="flex-1">{room.room}</span>
          {room.designs.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-500/20 dark:text-primary-200">
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
                />
              )}
              {room.designs.length > 1 && (
                <p className="text-xs font-medium text-dark-500 dark:text-dark-400">
                  Image {index + 1} of {room.designs.length}
                </p>
              )}
              {(design.title || design.description) && (
                <figcaption className="text-sm text-dark-600 dark:text-dark-300">
                  {design.title}
                  {design.title && design.description ? ' — ' : ''}
                  {design.description}
                </figcaption>
              )}
            </figure>
          ))}
          {selected && (
            <HotspotDetail
              label={selected.label}
              notes={selected.notes}
              item={selected.item}
              dimensions={selected.dimensions}
              labourCost={selected.labour_cost}
              onClose={() => onSelect(null)}
            />
          )}

          <div className="overflow-x-auto">
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
              <tbody className="divide-y divide-dark-100 dark:divide-dark-800">
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
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const [openRooms, setOpenRooms] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const refetched = useRef(false);

  const load = useCallback(async () => {
    try {
      const view = await getSharedQuotation(token);
      setState({ status: 'ready', view });
      // Start with the first room open so the page is never blank.
      setOpenRooms((cur) =>
        cur.size || !view.rooms[0] ? cur : new Set([view.rooms[0].room])
      );
    } catch {
      setState({ status: 'unavailable' });
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Signed image URLs expire; fetch fresh ones once if an image fails.
  const onImageError = () => {
    if (refetched.current) return;
    refetched.current = true;
    load();
  };

  const toggleRoom = (room: string) =>
    setOpenRooms((cur) => {
      const next = new Set(cur);
      if (!next.delete(room)) next.add(room);
      return next;
    });

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
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="font-heading text-xl font-semibold text-dark-900 dark:text-white">
          This link is no longer available
        </h1>
        <p className="text-sm text-dark-500 dark:text-dark-400">
          It may have expired or been withdrawn. Please ask your designer for a
          new link.
        </p>
      </main>
    );
  }

  const { view } = state;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {view.business_name && (
            <p className="text-xs font-semibold uppercase tracking-wider text-dark-500 dark:text-dark-400">
              {view.business_name}
            </p>
          )}
          <h1 className="font-heading text-2xl font-bold text-dark-900 dark:text-white">
            {view.project_name}
          </h1>
          <p className="mt-1 text-sm text-dark-500 dark:text-dark-400">
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
        <ThemeButton />
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

      {view.total !== null && (
        <p className="text-right font-heading text-lg font-bold text-dark-900 dark:text-white">
          Total: {fmtRate(view.total)}
        </p>
      )}
    </main>
  );
}
