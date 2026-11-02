import { api } from '@/lib/api';
import { ATTENTION_KEY } from '@/lib/attention';
import { INBOX_KEY } from '@/lib/inbox';
import { errorMessage } from '@/lib/errors';
import { addSampleClient, deleteSampleClient } from '@/lib/sampleClient';
import type { Client } from '@/lib/schemas/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

/** The sample client (if loaded) plus actions to load it and remove it. */
export function useSampleClient() {
  const qc = useQueryClient();
  const router = useRouter();

  const { data: clients } = useQuery<Client[]>({
    queryKey: ['clients', false],
    queryFn: () => api.get<Client[]>('/clients'),
  });
  const sample = clients?.find((c) => c.is_sample);

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['clients'] }),
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] }),
      qc.invalidateQueries({ queryKey: ATTENTION_KEY }),
      qc.invalidateQueries({ queryKey: INBOX_KEY }),
    ]);

  const load = useMutation({
    mutationFn: addSampleClient,
    onSuccess: async (client) => {
      await refresh();
      toast.success('Sample client loaded');
      router.push(`/dashboard/clients/${client.id}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSampleClient(id),
    onSuccess: async (_data, id) => {
      qc.removeQueries({ queryKey: ['client', id] });
      await refresh();
      toast.success('Sample client deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return { sample, clientCount: clients?.length, load, remove };
}
