'use client';

import { Modal } from '@/components/ui/Modal';
import { saveFromExtraction } from '@/lib/checkpoints';
import { errorMessage } from '@/lib/errors';
import {
  draftFromFloorPlan,
  extractFloorPlan,
  leftOutNote,
  toConfirmItems,
  type FloorPlanDraftResponse,
  type FloorPlanRoom,
  type RoomMatchStatus,
} from '@/lib/floorPlan';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface Props {
  clientId: string;
  onClose: () => void;
  onSaved: (checkpointId: string) => void;
}

const NEW_ROOM = '__new__';

const STATUS_LABEL: Record<RoomMatchStatus, string> = {
  existing: 'In quotation',
  suggested: 'Suggested match',
  new: 'New room',
};

const STATUS_CLS: Record<RoomMatchStatus, string> = {
  existing:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  suggested:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  new: 'bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-200',
};

function parseSide(value: string): number | null {
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Plan image, cross-check the rooms beneath it, then draft rows. */
export function FloorPlanModal({ clientId, onClose, onSaved }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rooms, setRooms] = useState<FloorPlanRoom[]>([]);
  const [existingRooms, setExistingRooms] = useState<string[]>([]);
  const [auditLogId, setAuditLogId] = useState<string | null>(null);
  const [sourceImagePath, setSourceImagePath] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function handleFile(chosen: File | undefined) {
    if (!chosen) return;
    setFile(chosen);
    setBusy(true);
    try {
      const res = await extractFloorPlan(clientId, chosen);
      setRooms(res.rooms);
      setExistingRooms(res.existing_rooms);
      setWarnings(res.warnings);
      setAuditLogId(res.audit_log_id);
      setSourceImagePath(res.source_image_path);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not read the plan'));
      setFile(null);
      setPreviewUrl(null);
    } finally {
      setBusy(false);
    }
  }

  function updateRoom(index: number, patch: Partial<FloorPlanRoom>) {
    setRooms((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  }

  /** Pick an existing room, or go back to what the plan called it. */
  function chooseRoom(index: number, value: string) {
    const room = rooms[index];
    if (value === NEW_ROOM) {
      updateRoom(index, {
        name: room.plan_label ?? room.name,
        match_status: 'new',
      });
    } else {
      updateRoom(index, {
        name: value,
        plan_label: room.plan_label ?? room.name,
        match_status: 'existing',
      });
    }
  }

  /**
   * Repeats of a quotation line become update rows that fill its blanks;
   * repeats with nothing to fill, or already in an earlier draft, are left out.
   */
  async function saveDraft(result: FloorPlanDraftResponse) {
    const rows = toConfirmItems(result.line_items);
    if (rows.length === 0) {
      toast.info(
        'Nothing new: every row is already in the quotation or an earlier draft'
      );
      return;
    }
    const left = result.line_items.length - rows.length;
    if (left > 0) {
      toast.info(`${left} row${left === 1 ? '' : 's'} already there, left out`);
    }
    const note = leftOutNote(result.line_items);
    const summary = note
      ? `${result.summary_text}\n${note}`
      : result.summary_text;
    const saved = await saveFromExtraction(clientId, {
      summary_text: summary,
      raw_transcript: result.summary_text,
      line_items: rows,
      audit_log_id: auditLogId,
      source_image_path: sourceImagePath,
      create_quotation: false,
      allow_incomplete: true,
    });
    onSaved(saved.checkpoint_id);
  }

  /** Rooms confirmed: save the rows as a draft in the meeting notes, where the designer reviews them. */
  async function handleDraft() {
    setBusy(true);
    try {
      const result = await draftFromFloorPlan(clientId, rooms);
      if (result.line_items.length === 0) {
        toast.info(result.warnings[0] ?? 'No starter rows for these rooms');
        return;
      }
      await saveDraft(result);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create the draft'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Draft from floor plan" maxWidth="4xl">
      {!file ? (
        <label className="block text-sm">
          <span className="mb-2 block text-dark-600 dark:text-dark-300">
            Upload a floor plan image (JPEG, PNG or WebP). Uses one AI credit
            and counts toward your image limit once saved.
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
      ) : (
        <div className="space-y-4">
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a remote asset
            <img
              src={previewUrl}
              alt="Uploaded floor plan"
              className="max-h-[40vh] w-full rounded-lg border border-line bg-white object-contain"
            />
          )}

          {busy && rooms.length === 0 && (
            <p className="text-sm text-dark-500">Reading the plan…</p>
          )}

          {rooms.length > 0 && (
            <>
              <p className="text-sm text-dark-600 dark:text-dark-300">
                Check each room against the plan above. Sizes are in feet. Rows
                are drafted only after you confirm.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-dark-500">
                      <th className="pb-1 pr-2">On the plan</th>
                      <th className="pb-1 pr-2">Room in quotation</th>
                      <th className="pb-1 pr-2">Length</th>
                      <th className="pb-1">Width</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((r, i) => {
                      const selected =
                        r.match_status === 'new' ? NEW_ROOM : r.name;
                      return (
                        <tr key={i} className="align-top">
                          <td className="py-1 pr-2">
                            <span className="font-medium">
                              {r.plan_label ?? r.name}
                            </span>
                            <span
                              className={`ml-2 inline-block rounded-control px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[r.match_status]}`}
                            >
                              {STATUS_LABEL[r.match_status]}
                            </span>
                          </td>
                          <td className="py-1 pr-2">
                            <select
                              className="field w-full"
                              value={selected}
                              onChange={(e) => chooseRoom(i, e.target.value)}
                              aria-label={`Room for ${r.plan_label ?? r.name}`}
                            >
                              <option value={NEW_ROOM}>New room</option>
                              {existingRooms.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                            {r.match_status === 'new' && (
                              <input
                                className="field mt-1 w-full"
                                value={r.name}
                                onChange={(e) =>
                                  updateRoom(i, { name: e.target.value })
                                }
                                aria-label="New room name"
                              />
                            )}
                          </td>
                          {(['length_ft', 'width_ft'] as const).map((key) => (
                            <td key={key} className="py-1 pr-2">
                              <input
                                className="field w-20"
                                inputMode="decimal"
                                value={r[key] ?? ''}
                                onChange={(e) =>
                                  updateRoom(i, {
                                    [key]: parseSide(e.target.value),
                                  })
                                }
                                aria-label={`${key === 'length_ft' ? 'Length' : 'Width'} of ${r.plan_label ?? r.name}`}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {warnings.length > 0 && (
                <ul className="list-disc pl-5 text-sm text-amber-700 dark:text-amber-400">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || rooms.some((r) => !r.name.trim())}
                  onClick={handleDraft}
                >
                  {busy ? 'Drafting…' : 'Create draft rows'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
