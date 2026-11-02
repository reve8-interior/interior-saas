'use client';

import {
  type CatalogChatModel,
  type ModelCatalog,
  formatUsd,
  getModelCatalog,
} from '@/lib/aiModels';
import {
  clearBusinessOpenAIKey,
  listBusinesses,
  setBusinessOpenAI,
} from '@/lib/businesses';
import { INPUT_CLS } from '@/lib/constants';
import type { Business } from '@/lib/schemas/business';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-react';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { fmtDate } from '@/lib/format';
import { errorMessage } from '@/lib/errors';

/** A select whose options carry their price; an unlisted saved model stays. */
function ModelSelect({
  id,
  value,
  describedBy,
  models,
  defaultModel,
  onChange,
}: {
  id: string;
  value: string;
  describedBy: string;
  models: CatalogChatModel[];
  defaultModel: string;
  onChange: (value: string) => void;
}) {
  const listed = models.some((m) => m.model === value);
  return (
    <select
      id={id}
      aria-describedby={describedBy}
      className={INPUT_CLS}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {!listed && <option value={value}>{value} — price unknown</option>}
      {models.map((m) => (
        <option key={m.model} value={m.model}>
          {m.model} — ≈ {formatUsd(m.est_cost_per_extraction_usd)} per run
          {m.model === defaultModel ? ' (default)' : ''}
        </option>
      ))}
    </select>
  );
}

function priceLine(model: CatalogChatModel | undefined): string {
  if (!model) return 'No list price known for this model.';
  return (
    `≈ ${formatUsd(model.est_cost_per_extraction_usd)} per run · ` +
    `${formatUsd(model.input_per_million_usd)} in / ` +
    `${formatUsd(model.output_per_million_usd)} out per 1M tokens`
  );
}

function KeyStatus({ business }: { business: Business | undefined }) {
  if (business?.has_openai_key) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-control bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Key set · ends in {business.openai_key_last4}
        {business.openai_key_updated_at &&
          ` · ${fmtDate(business.openai_key_updated_at)}`}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-control bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      No key · AI is off for this business
    </span>
  );
}

/** Platform admin: a business's OpenAI key, chat model and voice model. */
export function AiSettingsCard({ businessId }: { businessId: string }) {
  const queryClient = useQueryClient();
  const { data: businesses = [] } = useQuery({
    queryKey: ['businesses'],
    queryFn: listBusinesses,
  });
  const { data: catalog } = useQuery<ModelCatalog>({
    queryKey: ['ai-model-catalog'],
    queryFn: getModelCatalog,
    staleTime: 10 * 60 * 1000,
  });
  const business = businesses.find((b) => b.id === businessId);

  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  // null means "untouched": the select shows the saved value.
  const [chatEdit, setChatEdit] = useState<string | null>(null);
  const [whisperEdit, setWhisperEdit] = useState<string | null>(null);

  const chat = catalog?.chat ?? [];
  const defaultModel = catalog?.default_chat_model ?? '';
  const savedChat = business?.openai_chat_model || defaultModel;
  const chatModel = chatEdit ?? savedChat;
  const chatChanged = chatModel !== savedChat;

  const savedWhisper = business?.openai_whisper_model || 'whisper-1';
  const whisper = whisperEdit ?? savedWhisper;
  const whisperChanged = whisper !== savedWhisper;
  const voiceModels = catalog?.transcription ?? [];

  const priceOf = (model: string) => chat.find((m) => m.model === model);

  const dirty = !!keyInput.trim() || chatChanged || whisperChanged;

  const discard = () => {
    setKeyInput('');
    setChatEdit(null);
    setWhisperEdit(null);
  };
  const afterSave = () => {
    queryClient.invalidateQueries({ queryKey: ['businesses'] });
    discard();
  };

  const save = useMutation({
    mutationFn: () =>
      setBusinessOpenAI(businessId, {
        ...(keyInput.trim() ? { api_key: keyInput.trim() } : {}),
        ...(chatChanged ? { chat_model: chatModel } : {}),
        ...(whisperChanged ? { whisper_model: whisper } : {}),
      }),
    onSuccess: () => {
      toast.success('AI settings saved');
      afterSave();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => clearBusinessOpenAIKey(businessId),
    onSuccess: () => {
      toast.success('API key removed');
      afterSave();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (keyInput.trim() && !keyInput.trim().startsWith('sk-')) {
      toast.error('OpenAI keys start with "sk-"');
      return;
    }
    save.mutate();
  }

  function onRemoveKey() {
    if (
      window.confirm(
        'Remove the API key? AI features stay off for this business until a new key is added.'
      )
    ) {
      remove.mutate();
    }
  }

  return (
    <section
      className="surface space-y-5 p-4 sm:p-5"
      aria-labelledby="ai-settings"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          id="ai-settings"
          className="flex items-center gap-2 text-sm font-extrabold tracking-tight"
        >
          <KeyRound className="h-4 w-4 text-primary-500" aria-hidden="true" />
          AI settings
        </h3>
        <KeyStatus business={business} />
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label className="field-label" htmlFor="ai-key">
            OpenAI API key
          </label>
          <div className="relative">
            <input
              id="ai-key"
              type={showKey ? 'text' : 'password'}
              className={`${INPUT_CLS} pr-11`}
              placeholder={
                business?.has_openai_key ? 'Paste a new key to replace' : 'sk-…'
              }
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="ai-key-help"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
              aria-pressed={showKey}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-control text-dark-500 hover:bg-primary-50 dark:text-dark-400 dark:hover:bg-white/10"
            >
              {showKey ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          <p
            id="ai-key-help"
            className="mt-1 text-xs text-dark-500 dark:text-dark-400"
          >
            Stored encrypted and never shown again. Leave empty to keep the
            current key.
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="ai-chat">
            Chat model
          </label>
          <ModelSelect
            id="ai-chat"
            value={chatModel}
            describedBy="ai-chat-price"
            models={chat}
            defaultModel={defaultModel}
            onChange={setChatEdit}
          />
          <p
            id="ai-chat-price"
            className="mt-1 text-xs text-dark-500 dark:text-dark-400"
          >
            {priceLine(priceOf(chatModel))} Users never see the model or its
            cost; they only see their AI credits.
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="ai-voice">
            Voice message transcription
          </label>
          <select
            id="ai-voice"
            aria-describedby="ai-voice-help"
            className={INPUT_CLS}
            value={whisper}
            onChange={(e) => setWhisperEdit(e.target.value)}
          >
            {!voiceModels.some((m) => m.model === whisper) && (
              <option value={whisper}>{whisper} — price unknown</option>
            )}
            {voiceModels.map((m) => (
              <option key={m.model} value={m.model}>
                {m.model} — {formatUsd(m.per_minute_usd)} per minute
                {m.model === 'whisper-1' ? ' (default)' : ''}
              </option>
            ))}
          </select>
          <p
            id="ai-voice-help"
            className="mt-1 text-xs text-dark-500 dark:text-dark-400"
          >
            Used to turn recorded meetings into text before extraction.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4 dark:border-line">
          <button
            type="submit"
            disabled={!dirty || save.isPending}
            className="btn-primary"
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
          {dirty && (
            <button type="button" onClick={discard} className="btn-secondary">
              Discard
            </button>
          )}
          {business?.has_openai_key && (
            <button
              type="button"
              onClick={onRemoveKey}
              disabled={remove.isPending}
              className="btn-secondary ml-auto text-red-600 dark:text-red-400"
            >
              Remove key
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
