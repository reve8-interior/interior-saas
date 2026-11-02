'use client';

import { BlockSkeleton } from '@/components/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  GitCompare,
  ChevronRight,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Share2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  designsByRoomTag,
  RoomImagePicker,
} from '@/components/designs/RoomImagePicker';
import { CURRENT, VersionCompare } from '@/components/quotation/VersionCompare';
import { api } from '@/lib/api';
import { useScrollTabs } from '@/lib/useScrollTabs';
import { exportVersionToExcel } from '@/lib/exportQuotation';
import { useLineItemColumns } from '@/lib/lineItemColumns';
import type { Client } from '@/lib/schemas/client';
import { INPUT_CLS } from '@/lib/constants';
import { fmtDateLong, fmtRate } from '@/lib/format';
import { getQuotation } from '@/lib/quotation';
import { compareItems } from '@/lib/quotationCompare';
import {
  agreeVersion,
  getQuotationVersion,
  importQuotationVersion,
  listQuotationVersions,
  moveShareLink,
  restoreVersion,
  setVersionActive,
  saveQuotationVersion,
  unagreeVersion,
} from '@/lib/quotationVersions';
import type { Quotation } from '@/lib/schemas/quotation';
import type {
  QuotationVersion,
  QuotationVersionSummary,
} from '@/lib/schemas/quotationVersion';
import { errorMessage } from '@/lib/errors';
import { Badge } from '@/components/ui/Badge';
import { ATTENTION_KEY } from '@/lib/attention';
import { timeAgo } from '@/lib/dates';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { RowMenu } from '@/components/ui/RowMenu';
import { ImagesTab } from './ImagesTab';
import { ItemsTab } from './ItemsTab';
import { ScrollPanel, imageCount, useClientDesigns } from './PanelParts';
import { KeepLinkToggle, useSharedVersion } from './KeepLinkToggle';
import { ReplyBanner } from './ReplyBanner';
import { ShareModal } from './ShareModal';

type Tab = 'items' | 'images';

/* ───────────────────────── New version ───────────────────────── */

function NewVersionForm({
  clientId,
  onSaved,
  onCancel,
}: {
  clientId: string;
  /** `moved`: the customer's link now shows this version. */
  onSaved: (version: QuotationVersionSummary, moved: boolean) => void;
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
  const shared = useSharedVersion(clientId);
  const [onLink, setOnLink] = useState(false);

  const rooms = quotation?.rooms.map((r) => r.room) ?? [];
  // Until the designer changes something, use each image's room tags.
  const value = chosen ?? designsByRoomTag(rooms, designs);

  const save = useMutation({
    mutationFn: async () => {
      const version = await saveQuotationVersion(
        clientId,
        label.trim() || null,
        value
      );
      // The version is saved either way; a failed move is reported, not fatal.
      const moved =
        shared && onLink
          ? await moveShareLink(shared.id, version.id).then(
              (s) => s !== null,
              () => false
            )
          : false;
      if (shared && onLink && !moved) {
        toast.error('Saved, but the customer link was not updated. Try Share.');
      }
      return { version, moved };
    },
    onSuccess: ({ version, moved }) => {
      qc.invalidateQueries({ queryKey: ['quotation-versions', clientId] });
      qc.invalidateQueries({ queryKey: ATTENTION_KEY });
      toast.success(
        moved
          ? `Version ${version.number} saved and on your customer's link`
          : `Version ${version.number} saved`
      );
      onSaved(version, moved);
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
            className="btn-primary"
          >
            {save.isPending ? 'Saving…' : 'Save version'}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary">
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

        {shared && (
          <KeepLinkToggle
            shared={shared}
            checked={onLink}
            onChange={setOnLink}
          />
        )}

        <div>
          <h4 className="text-sm font-semibold text-dark-900 dark:text-white">
            Attach design images to rooms
          </h4>
          <p className="mb-3 mt-1 text-sm text-dark-600 dark:text-dark-300">
            Your customer will see the image when they open that room. Use Add
            image to attach more, or × to remove one.
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

/** Which version the customer's link points at, and whether they answered. */
function SharedBadges({ v }: { v: QuotationVersionSummary }) {
  if (!v.is_shared) return null;
  return (
    <>
      <Badge tone="neutral">Shared</Badge>
      {v.reply_kind === 'question' && <Badge tone="danger">Question</Badge>}
      {v.reply_kind === 'approved' && <Badge tone="success">Approved</Badge>}
    </>
  );
}

/** The customer's latest message, shown on the row so no click is needed. */
function ReplyNote({ v }: { v: QuotationVersionSummary }) {
  if (!v.is_shared || !v.reply_kind) return null;
  const who = v.reply_name || 'Customer';
  const text =
    v.reply_message ||
    (v.reply_kind === 'approved' ? 'Approved this version' : '');
  return (
    <span className="mt-1 block text-xs text-dark-600 dark:text-dark-300">
      <span className="font-semibold">{who}</span>
      {v.replied_at && ` · ${timeAgo(v.replied_at)}`}
      {text && <span className="line-clamp-2">“{text}”</span>}
    </span>
  );
}

function VersionPanel({
  clientId,
  summary,
  autoShare,
  onCompare,
}: {
  clientId: string;
  summary: QuotationVersionSummary;
  /** Open the share popup straight away (e.g. after "Save & share"). */
  autoShare: boolean;
  onCompare: () => void;
}) {
  const [tab, setTab] = useState<Tab>('items');
  const tabsRef = useScrollTabs<HTMLDivElement>(tab);
  const [shareOpen, setShareOpen] = useState(autoShare);
  const {
    data: version,
    isError: versionFailed,
    refetch: refetchVersion,
  } = useQuery<QuotationVersion>({
    queryKey: ['quotation-version', summary.id],
    queryFn: () => getQuotationVersion(summary.id),
  });

  const qc = useQueryClient();
  const toggleActive = useMutation({
    mutationFn: () => setVersionActive(summary.id, !summary.is_active),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ['quotation-versions', clientId] });
      qc.invalidateQueries({ queryKey: ['quotation-version', summary.id] });
      toast.success(
        v.is_active
          ? 'Customers can open this version again'
          : 'Customers can no longer open this version'
      );
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const [confirmRestore, setConfirmRestore] = useState(false);
  // What restoring would change, worked out only while the dialog is open.
  const { data: liveQuotation } = useQuery<Quotation>({
    queryKey: ['quotation', clientId],
    queryFn: () => getQuotation(clientId),
    enabled: confirmRestore,
    retry: false,
  });
  const restoreDiff =
    confirmRestore && liveQuotation && version
      ? compareItems(
          liveQuotation.rooms.flatMap((r) => r.items),
          version.line_items
        )
      : null;
  const restore = useMutation({
    mutationFn: () => restoreVersion(summary.id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['quotation-versions', clientId] });
      qc.invalidateQueries({ queryKey: ['quotation', clientId] });
      setConfirmRestore(false);
      toast.success(
        `Quotation restored to version ${r.restored_number}`,
        r.backup
          ? {
              description: `Previous state saved as version ${r.backup.number}`,
            }
          : undefined
      );
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
        toast.success(
          'Version marked as agreed — project moved to implementation'
        );
        setShareOpen(true);
      } else {
        toast.success('Agreed mark removed');
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
  ];

  return (
    <div className="space-y-2">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-xl font-bold text-dark-900 dark:text-white">
            Version {summary.number}
            {summary.label ? ` · ${summary.label}` : ''}
            {!summary.is_active && (
              <span className="ml-2 rounded-control bg-orange-100 px-2.5 py-0.5 align-middle text-xs font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                Customer access off
              </span>
            )}
            {summary.is_agreed && (
              <span className="ml-2 align-middle">
                <Badge tone="success">Agreed ✓</Badge>
              </span>
            )}
          </h3>
          <p className="text-sm text-dark-500 dark:text-dark-400">
            Saved on {fmtDateLong(summary.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {summary.is_active && (
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className={`${summary.is_agreed ? 'btn-secondary' : 'btn-primary'}`}
            >
              <Share2 className="h-4 w-4" aria-hidden />
              Share
            </button>
          )}
          {!summary.is_agreed && (
            <button
              type="button"
              onClick={() => setConfirmPick(true)}
              disabled={pick.isPending || !summary.is_active}
              className="btn-secondary"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Mark as agreed
            </button>
          )}
          <RowMenu
            label={`More actions for version ${summary.number}`}
            items={[
              {
                label: 'Export Excel',
                icon: <Download className="h-4 w-4" aria-hidden />,
                disabled: !version || !client,
                onSelect: () =>
                  version &&
                  client &&
                  exportVersionToExcel(client.name, version, columns).catch(
                    () => toast.error('Could not create the Excel file')
                  ),
              },
              {
                label: 'Compare with previous',
                icon: <GitCompare className="h-4 w-4" aria-hidden />,
                onSelect: onCompare,
              },
              {
                label: 'Restore this version',
                icon: <RotateCcw className="h-4 w-4" aria-hidden />,
                onSelect: () => setConfirmRestore(true),
              },
              ...(summary.is_agreed
                ? [
                    {
                      label: 'Remove agreed mark',
                      icon: <CheckCircle2 className="h-4 w-4" aria-hidden />,
                      onSelect: () => setConfirmPick(true),
                    },
                  ]
                : []),
              {
                label: summary.is_active
                  ? 'Stop customer access'
                  : 'Allow customer access',
                icon: <Power className="h-4 w-4" aria-hidden />,
                disabled: toggleActive.isPending,
                danger: summary.is_active,
                onSelect: () => toggleActive.mutate(),
              },
            ]}
          />
          <p className="ml-2 font-heading text-2xl font-bold tabular-nums text-dark-900 dark:text-white">
            {fmtRate(summary.negotiated_total)}
          </p>
        </div>
      </header>

      <ReplyBanner
        summary={summary}
        clientId={clientId}
        contact={client?.contact_info}
        onAgree={() => setConfirmPick(true)}
      />

      <ShareModal
        clientId={clientId}
        version={summary}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />

      <div
        ref={tabsRef}
        role="tablist"
        aria-label="Version sections"
        className="scroll-tabs flex gap-1 border-b border-line dark:border-line"
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
        open={confirmRestore}
        onClose={() => setConfirmRestore(false)}
        title={`Restore version ${summary.number}?`}
        maxWidth="md"
      >
        <p className="mb-6 text-dark-600 dark:text-dark-400">
          The current quotation will be replaced with this version&apos;s{' '}
          {summary.item_count} items. Nothing is lost: the current state is
          saved as a new version first.
        </p>
        {restoreDiff && (
          <p className="mb-6 rounded-lg bg-surface-2 p-3 text-sm text-dark-700 dark:text-dark-200">
            Compared with now: <strong>{restoreDiff.counts.added}</strong>{' '}
            brought back, <strong>{restoreDiff.counts.removed}</strong> removed,{' '}
            <strong>{restoreDiff.counts.changed}</strong> changed.
          </p>
        )}
        <ModalFooter
          onCancel={() => setConfirmRestore(false)}
          onConfirm={() => restore.mutate()}
          confirmLabel="Restore"
          loading={restore.isPending}
          loadingLabel="Restoring…"
        />
      </Modal>

      <Modal
        open={confirmPick}
        onClose={() => setConfirmPick(false)}
        title={
          summary.is_agreed
            ? 'Remove agreed mark?'
            : 'Mark this version as agreed?'
        }
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
          confirmLabel={summary.is_agreed ? 'Remove mark' : 'Mark as agreed'}
          loading={pick.isPending}
          loadingLabel="Saving…"
        />
      </Modal>

      <div role="tabpanel">
        {versionFailed ? (
          <ErrorState onRetry={() => refetchVersion()}>
            Couldn&apos;t load this version.
          </ErrorState>
        ) : !version ? (
          <div className="h-40 animate-pulse rounded-xl bg-gray-200 dark:bg-dark-800" />
        ) : tab === 'items' ? (
          <ItemsTab version={version} />
        ) : (
          <ImagesTab clientId={clientId} version={version} />
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── The tab ───────────────────────── */

/** Saved quotation versions: save the current state, attach images, share. */
export function VersionsView({ clientId }: { clientId: string }) {
  // The quotation page's buttons open this tab with ?new=1 / ?compare=1.
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // The open version lives in the URL so refresh, Back and shared links work.
  const selectedId = params.get('version');
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [pair, setPair] = useState<{ from: string; to: string } | null>(
    params.get('compare') === '1' ? { from: '', to: CURRENT } : null
  );
  // ?tab=share lets a link (e.g. "Save & share") open the share popup.
  const [openShare, setOpenShare] = useState(params.get('tab') === 'share');
  const [shareFor, setShareFor] = useState<QuotationVersionSummary | null>(
    null
  );
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
      setPair(null);
    }
  }, [inSubView]);
  const enterSubView = () => {
    if (!inSubView) router.push(`${pathname}?view=1`);
  };
  const openVersion = (id: string) => {
    setOpenShare(false);
    router.push(`${pathname}?view=1&version=${id}`);
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
      openVersion(version.id);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const {
    data: versions = [],
    isLoading,
    isError: versionsFailed,
    refetch: refetchVersions,
  } = useQuery<QuotationVersionSummary[]>({
    queryKey: ['quotation-versions', clientId],
    queryFn: () => listQuotationVersions(clientId),
  });

  const selected = versions.find((v) => v.id === selectedId) ?? null;

  const back = () => {
    setCreating(false);
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
          <BlockSkeleton className="h-32" />
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
            onSaved={(version, moved) => {
              setCreating(false);
              router.replace(`${pathname}?view=1&version=${version.id}`);
              // Already on the customer's link: no need to open the share popup.
              setOpenShare(!moved);
            }}
          />
        ) : (
          selected && (
            <VersionPanel
              key={`${selected.id}-${openShare}`}
              clientId={clientId}
              summary={selected}
              autoShare={openShare}
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
      <Link
        href={`/dashboard/clients/${clientId}/quotation`}
        className="inline-flex min-h-11 items-center gap-1 text-sm text-dark-600 hover:text-primary-600 dark:text-dark-300"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Current quotation
      </Link>
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
            className="btn-secondary"
          >
            <Upload className="h-4 w-4" aria-hidden />
            Import Excel
          </button>
          {versions.length > 0 && (
            <button
              type="button"
              onClick={() => startCompare()}
              className="btn-secondary"
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
            className="btn-primary"
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
              className="btn-primary"
            >
              {importFile.isPending ? 'Importing…' : 'Import'}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-gray-200 dark:bg-dark-800" />
      ) : versionsFailed ? (
        <ErrorState onRetry={() => refetchVersions()}>
          Couldn&apos;t load versions. Check your connection and try again.
        </ErrorState>
      ) : versions.length === 0 ? (
        <EmptyState>
          No versions yet. Tap “New version” to save the first one.
        </EmptyState>
      ) : (
        <>
          {/* Phones: one tappable card per version instead of a wide table */}
          <ul className="space-y-3 md:hidden">
            {versions.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => openVersion(v.id)}
                  className={`surface block min-h-11 w-full p-4 text-left ${
                    v.is_active ? '' : 'opacity-60'
                  }`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-dark-900 dark:text-white">
                      Version {v.number}
                    </span>
                    {!v.is_active && (
                      <span className="rounded-control bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                        Customer access off
                      </span>
                    )}
                    {v.is_agreed && <Badge tone="success">Agreed ✓</Badge>}
                    <SharedBadges v={v} />
                    <span className="ml-auto font-medium tabular-nums text-dark-900 dark:text-white">
                      {fmtRate(v.negotiated_total)}
                    </span>
                  </span>
                  {v.label && (
                    <span className="mt-1 block text-sm text-dark-700 dark:text-dark-300">
                      {v.label}
                    </span>
                  )}
                  <span className="mt-1 block text-xs text-dark-500 dark:text-dark-400">
                    {fmtDateLong(v.created_at)} · {v.item_count} items ·{' '}
                    {imageCount(v.room_designs)} images
                  </span>
                  <ReplyNote v={v} />
                </button>
                {v.is_active && (
                  <button
                    type="button"
                    onClick={() => setShareFor(v)}
                    className="btn-secondary btn-sm mt-2"
                  >
                    <Share2 className="h-4 w-4" aria-hidden />
                    {v.is_shared ? 'Manage link' : 'Share'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="surface hidden overflow-x-auto md:block">
            <table className="data-table w-max min-w-full">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Name</th>
                  <th>Saved on</th>
                  <th className="text-right">Items</th>
                  <th className="text-right">Images</th>
                  <th className="text-right">Total</th>
                  <th aria-label="Share" />
                  <th aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => openVersion(v.id)}
                    className={`cursor-pointer hover:bg-primary-50/70 dark:hover:bg-white/[0.06] ${
                      v.is_active ? '' : 'opacity-60'
                    }`}
                  >
                    <td className="whitespace-nowrap font-semibold text-dark-900 dark:text-white">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openVersion(v.id);
                        }}
                        className="min-h-11 rounded focus-visible:ring-2 focus-visible:ring-primary-500"
                        aria-label={`Open version ${v.number}`}
                      >
                        Version {v.number}
                      </button>
                      {!v.is_active && (
                        <span className="ml-2 rounded-control bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                          Customer access off
                        </span>
                      )}
                      {v.is_agreed && (
                        <span className="ml-2">
                          <Badge tone="success">Agreed ✓</Badge>
                        </span>
                      )}
                      <span className="ml-2 inline-flex">
                        <SharedBadges v={v} />
                      </span>
                    </td>
                    <td className="text-dark-700 dark:text-dark-300">
                      {v.label ?? '—'}
                      <ReplyNote v={v} />
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
                      {v.is_active && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShareFor(v);
                          }}
                          className="btn-secondary btn-sm"
                        >
                          <Share2 className="h-4 w-4" aria-hidden />
                          {v.is_shared ? 'Manage link' : 'Share'}
                        </button>
                      )}
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
        </>
      )}
      {shareFor && (
        <ShareModal
          clientId={clientId}
          version={shareFor}
          open
          onClose={() => setShareFor(null)}
        />
      )}
    </div>
  );
}
