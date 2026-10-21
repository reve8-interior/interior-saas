'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  Download,
  Eye,
  EyeOff,
  GitCompare,
  Link2,
  ChevronRight,
  Plus,
  Power,
  Upload,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import {
  designsByRoomTag,
  RoomImagePicker,
} from '@/components/designs/RoomImagePicker';
import { CURRENT, VersionCompare } from '@/components/quotation/VersionCompare';
import { api } from '@/lib/api';
import { exportVersionToExcel } from '@/lib/exportQuotation';
import { useLineItemColumns } from '@/lib/lineItemColumns';
import type { Client } from '@/lib/schemas/client';
import { INPUT_CLS } from '@/lib/constants';
import { listDesigns } from '@/lib/designs';
import { fmtDateLong, fmtRate } from '@/lib/format';
import { getQuotation } from '@/lib/quotation';
import {
  agreeVersion,
  createVersionShare,
  getQuotationVersion,
  importQuotationVersion,
  listQuotationVersions,
  listVersionShares,
  revokeVersionShare,
  setVersionActive,
  saveQuotationVersion,
  unagreeVersion,
  setVersionDesigns,
} from '@/lib/quotationVersions';
import type { Design } from '@/lib/schemas/design';
import type { Quotation } from '@/lib/schemas/quotation';
import type {
  QuotationShare,
  QuotationVersion,
  QuotationVersionSummary,
} from '@/lib/schemas/quotationVersion';
import { errorMessage } from '@/lib/errors';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal, ModalFooter } from '@/components/ui/Modal';

type Tab = 'items' | 'images' | 'share';

const imageCount = (roomDesigns: Record<string, string[]>) =>
  Object.values(roomDesigns).flat().length;

const copy = async (url: string) => {
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copied');
  } catch {
    toast.error('Copy failed. Select the link and copy it by hand.');
  }
};

function useClientDesigns(clientId: string) {
  return useQuery<Design[]>({
    queryKey: ['designs', clientId],
    queryFn: () => listDesigns(clientId),
  });
}

/** Scrolls its content; the footer (Save, Create…) stays pinned and visible. */
function ScrollPanel({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex h-[calc(100dvh-22rem)] min-h-72 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto py-5 pr-1">{children}</div>
      {footer && (
        <div className="flex flex-wrap gap-3 border-t border-line pt-4 dark:border-primary-300/10">
          {footer}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── New version ───────────────────────── */

function NewVersionForm({
  clientId,
  onSaved,
  onCancel,
}: {
  clientId: string;
  onSaved: (version: QuotationVersionSummary) => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [chosen, setChosen] = useState<Record<string, string[]> | null>(null);

  const { data: quotation } = useQuery<Quotation>({
    queryKey: ['quotation', clientId],
    queryFn: () => getQuotation(clientId),
  });
  const { data: designs = [] } = useClientDesigns(clientId);

  const rooms = quotation?.rooms.map((r) => r.room) ?? [];
  // Until the designer changes something, use each image's room tags.
  const value = chosen ?? designsByRoomTag(rooms, designs);

  const save = useMutation({
    mutationFn: () =>
      saveQuotationVersion(clientId, label.trim() || null, value),
    onSuccess: (version) => {
      qc.invalidateQueries({ queryKey: ['quotation-versions', clientId] });
      toast.success(`Version ${version.number} saved`);
      onSaved(version);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <ScrollPanel
      footer={
        <>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || rooms.length === 0}
            className="btn-primary min-h-11"
          >
            {save.isPending ? 'Saving…' : 'Save version'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary min-h-11"
          >
            Cancel
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <h3 className="font-heading text-lg font-bold text-dark-900 dark:text-white">
            Save a new version
          </h3>
          <p className="mt-1 text-sm text-dark-600 dark:text-dark-300">
            This keeps a copy of the quotation as it is right now. You can keep
            editing the quotation after this.
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="version-name">
            Version name (optional)
          </label>
          <input
            id="version-name"
            value={label}
            maxLength={120}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. After site visit"
            className={`${INPUT_CLS} max-w-md`}
          />
        </div>

        <div>
          <h4 className="text-sm font-semibold text-dark-900 dark:text-white">
            Attach design images to rooms
          </h4>
          <p className="mb-3 mt-1 text-sm text-dark-600 dark:text-dark-300">
            Your customer will see the image when they open that room. Tap an
            image to attach or remove it.
          </p>
          <RoomImagePicker
            rooms={rooms}
            designs={designs}
            value={value}
            onChange={setChosen}
          />
        </div>
      </div>
    </ScrollPanel>
  );
}

/* ───────────────────────── One version ───────────────────────── */

function ItemsTab({ version }: { version: QuotationVersion }) {
  const items = version.line_items.filter((i) => i.status !== 'removed');

  return (
    <ScrollPanel>
      <div className="overflow-x-auto">
        <table className="data-table w-max min-w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th>Room</th>
              <th>Description</th>
              <th className="text-right">Qty</th>
              <th>Unit</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="whitespace-nowrap font-medium text-dark-900 dark:text-white">
                  {item.room}
                </td>
                <td className="min-w-48 text-dark-700 dark:text-dark-200">
                  {item.description}
                </td>
                <td className="text-right tabular-nums">{item.qty ?? '—'}</td>
                <td>{item.unit}</td>
                <td className="text-right tabular-nums">
                  {item.rate !== null ? fmtRate(item.rate) : '—'}
                </td>
                <td className="text-right font-medium tabular-nums text-dark-900 dark:text-white">
                  {fmtRate(item.negotiated_price ?? item.initial_price ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ScrollPanel>
  );
}

function ImagesTab({
  clientId,
  version,
}: {
  clientId: string;
  version: QuotationVersion;
}) {
  const qc = useQueryClient();
  const { data: designs = [] } = useClientDesigns(clientId);
  const [chosen, setChosen] = useState<Record<string, string[]> | null>(null);
  const rooms = [...new Set(version.line_items.map((i) => i.room))];
  const value = chosen ?? version.room_designs;

  const save = useMutation({
    mutationFn: () => setVersionDesigns(version.id, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotation-versions', clientId] });
      qc.invalidateQueries({ queryKey: ['quotation-version', version.id] });
      setChosen(null);
      toast.success('Images saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <ScrollPanel
      footer={
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending || chosen === null}
          className="btn-primary min-h-11"
        >
          {save.isPending ? 'Saving…' : 'Save images'}
        </button>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-dark-600 dark:text-dark-300">
          Your customer will see these images when they open each room.
        </p>
        <RoomImagePicker
          rooms={rooms}
          designs={designs}
          value={value}
          onChange={setChosen}
        />
      </div>
    </ScrollPanel>
  );
}

function shareStatus(share: QuotationShare): 'active' | 'expired' {
  if (share.expires_at && new Date(share.expires_at) <= new Date())
    return 'expired';
  return 'active';
}

const STATUS_BADGE = {
  active:
    'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  expired:
    'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
} as const;

const STATUS_LABEL = {
  active: 'Link is on',
  expired: 'Link expired',
} as const;

function ShareTab({ version }: { version: QuotationVersion }) {
  const qc = useQueryClient();
  const [showPrices, setShowPrices] = useState(false);
  const [expires, setExpires] = useState('');
  const sharesKey = ['quotation-shares', version.id];

  const { data: shares = [] } = useQuery<QuotationShare[]>({
    queryKey: sharesKey,
    queryFn: () => listVersionShares(version.id),
  });

  const create = useMutation({
    mutationFn: () =>
      createVersionShare(version.id, {
        show_prices: showPrices,
        // The date input has no time; expire at the end of that day.
        expires_at: expires
          ? new Date(`${expires}T23:59:59`).toISOString()
          : null,
      }),
    onSuccess: (share) => {
      qc.invalidateQueries({ queryKey: sharesKey });
      copy(share.url);
      setExpires('');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const stop = useMutation({
    mutationFn: (shareId: string) => revokeVersionShare(version.id, shareId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sharesKey });
      toast.success('Link deleted. It no longer opens.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const today = new Date().toISOString().slice(0, 10);
  const images = imageCount(version.room_designs);

  const choice = (on: boolean, title: string, hint: string) => {
    const selected = showPrices === on;
    const Icon = on ? Eye : EyeOff;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={() => setShowPrices(on)}
        className={`flex flex-1 items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors ${
          selected
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-600/20'
            : 'border-line hover:border-primary-300 dark:border-primary-300/15'
        }`}
      >
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <span>
          <span className="block text-sm font-semibold text-dark-900 dark:text-white">
            {title}
          </span>
          <span className="block text-xs text-dark-600 dark:text-dark-300">
            {hint}
          </span>
        </span>
      </button>
    );
  };

  return (
    <ScrollPanel
      footer={
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={create.isPending || !version.is_active}
          className="btn-primary min-h-11"
        >
          <Link2 className="h-4 w-4" aria-hidden />
          {create.isPending ? 'Creating…' : 'Create link and copy'}
        </button>
      }
    >
      <div className="space-y-8">
        {!version.is_active && (
          <p className="rounded-xl bg-orange-100 p-3 text-sm text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
            This version is inactive. Its links do not open. Activate it to
            share.
          </p>
        )}
        <section className="space-y-5">
          <h4 className="text-sm font-semibold text-dark-900 dark:text-white">
            Create a link for your customer
          </h4>

          <div
            role="radiogroup"
            aria-label="Prices"
            className="flex flex-col gap-3 sm:flex-row"
          >
            {choice(
              false,
              'Hide prices',
              'Customer sees items and sizes only.'
            )}
            {choice(
              true,
              'Show prices',
              'Customer also sees rate, amount and total.'
            )}
          </div>

          <div>
            <label className="field-label" htmlFor="share-expiry">
              Link works till (optional)
            </label>
            <input
              id="share-expiry"
              type="date"
              min={today}
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className={`${INPUT_CLS} max-w-48`}
            />
          </div>

          <p className="text-sm text-dark-600 dark:text-dark-300">
            Customer will see: version {version.number}, {images} image
            {images === 1 ? '' : 's'}, prices {showPrices ? 'shown' : 'hidden'}.
          </p>
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-dark-900 dark:text-white">
            Links for this version
          </h4>
          {shares.length === 0 ? (
            <p className="text-sm text-dark-500 dark:text-dark-400">
              No link yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {shares.map((share) => {
                const status = shareStatus(share);
                return (
                  <li
                    key={share.id}
                    className="space-y-3 rounded-xl border border-line p-4 dark:border-primary-300/15"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-medium ${STATUS_BADGE[status]}`}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                      <span className="text-dark-500 dark:text-dark-400">
                        {share.show_prices ? 'Prices shown' : 'Prices hidden'}
                        {' · '}
                        {share.expires_at
                          ? `Till ${fmtDateLong(share.expires_at)}`
                          : 'No end date'}
                        {' · '}
                        Made {fmtDateLong(share.created_at)}
                      </span>
                    </div>
                    <p className="break-all font-mono text-xs text-dark-700 dark:text-dark-300">
                      {share.url}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {status === 'active' && (
                        <>
                          <button
                            type="button"
                            onClick={() => copy(share.url)}
                            className="btn-secondary min-h-11"
                          >
                            <Copy className="h-4 w-4" aria-hidden />
                            Copy link
                          </button>
                          <a
                            href={share.url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-secondary min-h-11"
                          >
                            <ExternalLink className="h-4 w-4" aria-hidden />
                            See what customer sees
                          </a>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => stop.mutate(share.id)}
                        disabled={stop.isPending}
                        className="btn-secondary min-h-11 text-red-600 dark:text-red-400"
                      >
                        {status === 'active' ? 'Stop sharing' : 'Delete link'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </ScrollPanel>
  );
}

function VersionPanel({
  clientId,
  summary,
  initialTab,
  onCompare,
}: {
  clientId: string;
  summary: QuotationVersionSummary;
  initialTab: Tab;
  onCompare: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const { data: version } = useQuery<QuotationVersion>({
    queryKey: ['quotation-version', summary.id],
    queryFn: () => getQuotationVersion(summary.id),
  });

  const qc = useQueryClient();
  const toggleActive = useMutation({
    mutationFn: () => setVersionActive(summary.id, !summary.is_active),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ['quotation-versions', clientId] });
      qc.invalidateQueries({ queryKey: ['quotation-version', summary.id] });
      toast.success(v.is_active ? 'Version activated' : 'Version deactivated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const [confirmPick, setConfirmPick] = useState(false);
  const pick = useMutation({
    mutationFn: () =>
      summary.is_agreed ? unagreeVersion(summary.id) : agreeVersion(summary.id),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ['quotation-versions', clientId] });
      qc.invalidateQueries({ queryKey: ['quotation-version', summary.id] });
      qc.invalidateQueries({ queryKey: ['client', clientId] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      setConfirmPick(false);
      if (v.is_agreed) {
        toast.success('Client pick saved — project moved to implementation');
        setTab('share');
      } else {
        toast.success('Client pick removed');
      }
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const { columns } = useLineItemColumns();
  const { data: client } = useQuery<Client>({
    queryKey: ['client', clientId],
    queryFn: () => api.get<Client>(`/clients/${clientId}`),
  });

  const images = imageCount(summary.room_designs);
  const tabs: { key: Tab; label: string }[] = [
    { key: 'items', label: `Items (${summary.item_count})` },
    { key: 'images', label: `Images (${images})` },
    { key: 'share', label: 'Share' },
  ];

  return (
    <div className="space-y-2">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-xl font-bold text-dark-900 dark:text-white">
            Version {summary.number}
            {summary.label ? ` · ${summary.label}` : ''}
            {!summary.is_active && (
              <span className="ml-2 rounded-full bg-orange-100 px-2.5 py-0.5 align-middle text-xs font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                Inactive
              </span>
            )}
            {summary.is_agreed && (
              <span className="ml-2 align-middle">
                <Badge tone="success">Client pick</Badge>
              </span>
            )}
          </h3>
          <p className="text-sm text-dark-500 dark:text-dark-400">
            Saved on {fmtDateLong(summary.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!version || !client}
            onClick={() =>
              version &&
              client &&
              exportVersionToExcel(client.name, version, columns).catch(() =>
                toast.error('Could not create the Excel file')
              )
            }
            className="btn-secondary min-h-11"
          >
            <Download className="h-4 w-4" aria-hidden />
            Export Excel
          </button>
          <button
            type="button"
            onClick={onCompare}
            className="btn-secondary min-h-11"
          >
            <GitCompare className="h-4 w-4" aria-hidden />
            Compare
          </button>
          <button
            type="button"
            onClick={() => setConfirmPick(true)}
            disabled={
              pick.isPending || (!summary.is_active && !summary.is_agreed)
            }
            className={`min-h-11 ${summary.is_agreed ? 'btn-secondary' : 'btn-primary'}`}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {summary.is_agreed ? 'Remove client pick' : 'Client pick'}
          </button>
          <button
            type="button"
            onClick={() => toggleActive.mutate()}
            disabled={toggleActive.isPending}
            className="btn-secondary min-h-11"
          >
            <Power className="h-4 w-4" aria-hidden />
            {summary.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <p className="font-heading text-2xl font-bold tabular-nums text-dark-900 dark:text-white">
            {fmtRate(summary.negotiated_total)}
          </p>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Version sections"
        className="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] dark:border-primary-300/15 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px min-h-12 shrink-0 whitespace-nowrap border-b-2 px-4 text-sm font-semibold transition-colors ${
              tab === key
                ? 'border-primary-500 text-primary-700 dark:border-primary-400 dark:text-white'
                : 'border-transparent text-dark-600 hover:border-dark-300 hover:text-dark-900 dark:text-dark-300 dark:hover:border-dark-500 dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Modal
        open={confirmPick}
        onClose={() => setConfirmPick(false)}
        title={summary.is_agreed ? 'Remove client pick?' : 'Pick this version?'}
        maxWidth="md"
      >
        <p className="mb-6 text-dark-600 dark:text-dark-400">
          {summary.is_agreed
            ? 'This version will no longer be marked as agreed. The project phase stays as it is.'
            : `Mark version ${summary.number} as the one the client agreed to. The project moves to implementation, and you can share this version with the client.`}
        </p>
        <ModalFooter
          onCancel={() => setConfirmPick(false)}
          onConfirm={() => pick.mutate()}
          confirmLabel={summary.is_agreed ? 'Remove pick' : 'Confirm pick'}
          loading={pick.isPending}
          loadingLabel="Saving…"
        />
      </Modal>

      <div role="tabpanel">
        {!version ? (
          <div className="h-40 animate-pulse rounded-xl bg-gray-200 dark:bg-dark-800" />
        ) : tab === 'items' ? (
          <ItemsTab version={version} />
        ) : tab === 'images' ? (
          <ImagesTab clientId={clientId} version={version} />
        ) : (
          <ShareTab version={version} />
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── The tab ───────────────────────── */

/** Saved quotation versions: save the current state, attach images, share. */
export function VersionsView({ clientId }: { clientId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The quotation page's buttons open this tab with ?new=1 / ?compare=1.
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [pair, setPair] = useState<{ from: string; to: string } | null>(
    params.get('compare') === '1' ? { from: '', to: CURRENT } : null
  );
  const [openTab, setOpenTab] = useState<Tab>('items');
  const [importing, setImporting] = useState(false);
  const [importName, setImportName] = useState('');
  const [importFileChosen, setImportFileChosen] = useState<File | null>(null);
  const qc = useQueryClient();

  // Every sub-view carries a URL marker, so clicking the "Versions" tab
  // (a plain URL) takes you back to the list.
  const inSubView =
    params.has('new') || params.has('compare') || params.has('view');
  useEffect(() => {
    if (!inSubView) {
      setCreating(false);
      setSelectedId(null);
      setPair(null);
    }
  }, [inSubView]);
  const enterSubView = () => {
    if (!inSubView) router.push(`${pathname}?view=1`);
  };

  const importFile = useMutation({
    mutationFn: (file: File) =>
      importQuotationVersion(clientId, file, importName.trim() || null),
    onSuccess: (version) => {
      qc.invalidateQueries({ queryKey: ['quotation-versions', clientId] });
      toast.success(`Saved as version ${version.number}`);
      setImporting(false);
      setImportName('');
      setImportFileChosen(null);
      enterSubView();
      setSelectedId(version.id);
      setOpenTab('items');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const { data: versions = [], isLoading } = useQuery<
    QuotationVersionSummary[]
  >({
    queryKey: ['quotation-versions', clientId],
    queryFn: () => listQuotationVersions(clientId),
  });

  const selected = versions.find((v) => v.id === selectedId) ?? null;

  const back = () => {
    setCreating(false);
    setSelectedId(null);
    setPair(null);
    if (inSubView) router.push(pathname);
  };

  /** Newest two versions; falls back to latest vs the live quotation. */
  const startCompare = (from?: string, to?: string) => {
    enterSubView();
    const [latest, previous] = versions; // list is newest first
    if (from && to) return setPair({ from, to });
    setPair(
      previous
        ? { from: previous.id, to: latest.id }
        : { from: latest?.id ?? '', to: CURRENT }
    );
  };

  if (pair) {
    // `?compare=1` has no version list yet; resolve it once versions load.
    const resolved =
      pair.from === '' && versions.length > 0
        ? {
            from: versions[1]?.id ?? versions[0].id,
            to: versions[1] ? versions[0].id : CURRENT,
          }
        : pair;
    return (
      <div className="surface p-4 sm:p-6">
        <button
          type="button"
          onClick={back}
          className="inline-flex min-h-11 items-center gap-1 text-sm text-dark-600 hover:text-primary-600 dark:text-dark-300"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All versions
        </button>
        <h3 className="mb-4 font-heading text-lg font-bold text-dark-900 dark:text-white">
          Compare versions
        </h3>
        {resolved.from === '' ? (
          <div className="h-32 animate-pulse rounded-xl bg-gray-200 dark:bg-dark-800" />
        ) : (
          <VersionCompare
            clientId={clientId}
            versions={versions}
            from={resolved.from}
            to={resolved.to}
            onChange={(from, to) => setPair({ from, to })}
          />
        )}
      </div>
    );
  }

  if (creating || selected) {
    return (
      <div className="surface p-4 sm:p-6">
        <button
          type="button"
          onClick={back}
          className="inline-flex min-h-11 items-center gap-1 text-sm text-dark-600 hover:text-primary-600 dark:text-dark-300"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All versions
        </button>
        {creating ? (
          <NewVersionForm
            clientId={clientId}
            onCancel={back}
            onSaved={(version) => {
              setCreating(false);
              setSelectedId(version.id);
              setOpenTab('share');
            }}
          />
        ) : (
          selected && (
            <VersionPanel
              key={`${selected.id}-${openTab}`}
              clientId={clientId}
              summary={selected}
              initialTab={openTab}
              onCompare={() => {
                const idx = versions.findIndex((v) => v.id === selected.id);
                const older = versions[idx + 1];
                startCompare(
                  older?.id ?? selected.id,
                  older ? selected.id : CURRENT
                );
              }}
            />
          )
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-dark-600 dark:text-dark-300">
          Each version is a saved copy of the quotation. Open one to attach
          images, share or export it. Edit the exported Excel and import it to
          save it as a new version.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setImporting((on) => !on)}
            className="btn-secondary min-h-11"
          >
            <Upload className="h-4 w-4" aria-hidden />
            Import Excel
          </button>
          {versions.length > 0 && (
            <button
              type="button"
              onClick={() => startCompare()}
              className="btn-secondary min-h-11"
            >
              <GitCompare className="h-4 w-4" aria-hidden />
              Compare
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              enterSubView();
              setCreating(true);
            }}
            className="btn-primary min-h-11"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New version
          </button>
        </div>
      </div>

      {importing && (
        <form
          className="surface space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (importFileChosen) importFile.mutate(importFileChosen);
          }}
        >
          <p className="text-sm text-dark-600 dark:text-dark-300">
            Choose an Excel file exported from a version. It is saved as a new
            version; your quotation is not changed.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="field-label" htmlFor="import-name">
                Version name (optional)
              </label>
              <input
                id="import-name"
                value={importName}
                maxLength={120}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="e.g. Client edits"
                className={`${INPUT_CLS} w-64`}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="import-file">
                Excel file
              </label>
              <input
                id="import-file"
                type="file"
                accept=".xlsx"
                onChange={(e) =>
                  setImportFileChosen(e.target.files?.[0] ?? null)
                }
                className="block text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!importFileChosen || importFile.isPending}
              className="btn-primary min-h-11"
            >
              {importFile.isPending ? 'Importing…' : 'Import'}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-gray-200 dark:bg-dark-800" />
      ) : versions.length === 0 ? (
        <EmptyState>
          No versions yet. Tap “New version” to save the first one.
        </EmptyState>
      ) : (
        <div className="surface overflow-x-auto">
          <table className="data-table w-max min-w-full">
            <thead>
              <tr>
                <th>Version</th>
                <th>Name</th>
                <th>Saved on</th>
                <th className="text-right">Items</th>
                <th className="text-right">Images</th>
                <th className="text-right">Total</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => {
                    enterSubView();
                    setSelectedId(v.id);
                    setOpenTab('items');
                  }}
                  className={`cursor-pointer hover:bg-primary-50/70 dark:hover:bg-white/[0.06] ${
                    v.is_active ? '' : 'opacity-60'
                  }`}
                >
                  <td className="whitespace-nowrap font-semibold text-dark-900 dark:text-white">
                    Version {v.number}
                    {!v.is_active && (
                      <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                        Inactive
                      </span>
                    )}
                    {v.is_agreed && (
                      <span className="ml-2">
                        <Badge tone="success">Client pick</Badge>
                      </span>
                    )}
                  </td>
                  <td className="text-dark-700 dark:text-dark-300">
                    {v.label ?? '—'}
                  </td>
                  <td className="whitespace-nowrap text-dark-500 dark:text-dark-400">
                    {fmtDateLong(v.created_at)}
                  </td>
                  <td className="text-right tabular-nums">{v.item_count}</td>
                  <td className="text-right tabular-nums">
                    {imageCount(v.room_designs)}
                  </td>
                  <td className="whitespace-nowrap text-right font-medium tabular-nums text-dark-900 dark:text-white">
                    {fmtRate(v.negotiated_total)}
                  </td>
                  <td className="text-right">
                    <ChevronRight
                      className="inline h-4 w-4 text-dark-400"
                      aria-hidden
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
