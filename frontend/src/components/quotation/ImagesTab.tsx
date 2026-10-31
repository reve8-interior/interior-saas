'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { RoomImagePicker } from '@/components/designs/RoomImagePicker';
import { setVersionDesigns } from '@/lib/quotationVersions';
import type { QuotationVersion } from '@/lib/schemas/quotationVersion';
import { errorMessage } from '@/lib/errors';
import { ScrollPanel, useClientDesigns } from './PanelParts';
export function ImagesTab({
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

  // Every change is saved as it is made; there is no separate Save step.
  const save = useMutation({
    mutationFn: (next: Record<string, string[]>) =>
      setVersionDesigns(version.id, next),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['quotation-versions', clientId] }),
        qc.invalidateQueries({ queryKey: ['quotation-version', version.id] }),
      ]),
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => setChosen(null),
  });
  const change = (next: Record<string, string[]>) => {
    setChosen(next);
    save.mutate(next);
  };

  return (
    <ScrollPanel>
      <div className="space-y-5">
        <p className="flex flex-wrap items-center justify-between gap-2 text-sm text-dark-600 dark:text-dark-300">
          <span>
            Your customer will see these images when they open each room.
          </span>
          <span role="status" className="text-xs text-dark-500">
            {save.isPending ? 'Saving…' : save.isSuccess ? 'Saved' : ''}
          </span>
        </p>
        <RoomImagePicker
          rooms={rooms}
          designs={designs}
          value={value}
          onChange={change}
        />
      </div>
    </ScrollPanel>
  );
}
