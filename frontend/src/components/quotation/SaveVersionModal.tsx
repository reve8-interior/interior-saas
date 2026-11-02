'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  designsByRoomTag,
  RoomImagePicker,
} from '@/components/designs/RoomImagePicker';
import { Modal } from '@/components/ui/Modal';
import { INPUT_CLS } from '@/lib/constants';
import { errorMessage } from '@/lib/errors';
import { ATTENTION_KEY } from '@/lib/attention';
import { INBOX_KEY } from '@/lib/inbox';
import {
  isOpenQuestion,
  listQuotationMessages,
  quotationMessagesKey,
  resolveQuotationMessage,
} from '@/lib/quotationMessages';
import { moveShareLink, saveQuotationVersion } from '@/lib/quotationVersions';
import type { Quotation } from '@/lib/schemas/quotation';
import type { QuotationVersionSummary } from '@/lib/schemas/quotationVersion';
import { KeepLinkToggle, useSharedVersion } from './KeepLinkToggle';
import { useClientDesigns } from './PanelParts';

interface SaveVersionModalProps {
  clientId: string;
  quotation: Quotation;
  onClose: () => void;
}

/**
 * Save the quotation as a version without leaving it. Images default to each
 * design's room tags; the picker is tucked away for when that isn't right.
 */
export function SaveVersionModal({
  clientId,
  quotation,
  onClose,
}: SaveVersionModalProps) {
  const qc = useQueryClient();
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [chosen, setChosen] = useState<Record<string, string[]> | null>(null);
  const { data: designs = [] } = useClientDesigns(clientId);
  const shared = useSharedVersion(clientId);
  const [onLink, setOnLink] = useState(false);
  const { data: messages = [] } = useQuery({
    queryKey: quotationMessagesKey(clientId),
    queryFn: () => listQuotationMessages(clientId),
  });
  const openQuestions = messages.filter(isOpenQuestion);
  // Saving usually is the answer to a question, so offer to close it.
  const [resolveOpen, setResolveOpen] = useState(true);

  const rooms = quotation.rooms.map((r) => r.room);
  const value = chosen ?? designsByRoomTag(rooms, designs);
  const versionPath = (v: QuotationVersionSummary, tab?: 'share') =>
    `/dashboard/clients/${clientId}/versions?view=1&version=${v.id}${
      tab ? `&tab=${tab}` : ''
    }`;

  const save = useMutation({
    mutationFn: async (_goShare: boolean) => {
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
      if (resolveOpen && openQuestions.length > 0) {
        const results = await Promise.allSettled(
          openQuestions.map((m) => resolveQuotationMessage(m.id, true))
        );
        if (results.some((r) => r.status === 'rejected')) {
          toast.error('Saved, but some questions were not marked resolved.');
        }
      }
      return { version, moved };
    },
    onSuccess: ({ version, moved }, goShare) => {
      qc.invalidateQueries({ queryKey: ['quotation-versions', clientId] });
      qc.invalidateQueries({ queryKey: ATTENTION_KEY });
      qc.invalidateQueries({ queryKey: quotationMessagesKey(clientId) });
      qc.invalidateQueries({ queryKey: INBOX_KEY });
      onClose();
      if (goShare) {
        router.push(versionPath(version, 'share'));
        return;
      }
      toast.success(
        moved
          ? `Version ${version.number} saved and on your customer's link`
          : `Version ${version.number} saved`,
        moved
          ? undefined
          : {
              action: {
                label: 'Share',
                onClick: () => router.push(versionPath(version, 'share')),
              },
            }
      );
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Save a version"
      description="Keeps a copy of the quotation as it is now. You can keep editing."
      maxWidth="lg"
    >
      <div className="space-y-4">
        <div>
          <label className="field-label" htmlFor="save-version-name">
            Version name (optional)
          </label>
          <input
            id="save-version-name"
            value={label}
            maxLength={120}
            autoFocus
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. After site visit"
            className={INPUT_CLS}
          />
        </div>

        <details className="rounded-xl border border-line p-3">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold text-dark-900 dark:text-white">
            Design images in this version ({Object.values(value).flat().length})
          </summary>
          <p className="mb-3 mt-2 text-sm text-dark-600 dark:text-dark-300">
            Customers see the image when they open that room. Based on each
            design&apos;s room tags. Use Add image to attach more, or × to
            remove one.
          </p>
          <RoomImagePicker
            rooms={rooms}
            designs={designs}
            value={value}
            onChange={setChosen}
          />
        </details>

        {shared && (
          <KeepLinkToggle
            shared={shared}
            checked={onLink}
            onChange={setOnLink}
          />
        )}

        {openQuestions.length > 0 && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-dark-900 dark:text-white">
            <input
              type="checkbox"
              checked={resolveOpen}
              onChange={(e) => setResolveOpen(e.target.checked)}
            />
            Mark {openQuestions.length} open customer{' '}
            {openQuestions.length === 1 ? 'question' : 'questions'} as resolved
          </label>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => save.mutate(false)}
            disabled={save.isPending || rooms.length === 0}
            className="btn-secondary"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => save.mutate(true)}
            disabled={save.isPending || rooms.length === 0}
            className="btn-primary"
          >
            {save.isPending ? 'Saving…' : 'Save & share'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
