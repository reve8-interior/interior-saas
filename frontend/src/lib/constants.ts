export const PHASES = [
  'discussion',
  'design',
  'quotation',
  'implementation',
  'completed',
] as const;

export const PHASE_LABELS: Record<string, string> = {
  discussion: 'Discussion',
  design: 'Design',
  quotation: 'Quotation',
  implementation: 'Implementation',
  completed: 'Completed',
};

export const PHASE_COLORS: Record<string, string> = {
  discussion:
    'bg-blue-100 text-blue-700 ring-1 ring-inset ring-blue-600/15 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/20',
  design:
    'bg-purple-100 text-purple-700 ring-1 ring-inset ring-purple-600/15 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-400/20',
  quotation:
    'bg-secondary-100 text-secondary-800 ring-1 ring-inset ring-secondary-600/20 dark:bg-secondary-500/15 dark:text-secondary-300 dark:ring-secondary-400/20',
  implementation:
    'bg-orange-100 text-orange-700 ring-1 ring-inset ring-orange-600/20 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/20',
  completed:
    'bg-green-100 text-green-700 ring-1 ring-inset ring-green-600/20 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-400/20',
};

export const OPERATION_LABELS: Record<string, string> = {
  checkpoint_extract: 'Checkpoint Extract',
  timeline_alloc: 'Timeline Allocation',
  material_extract: 'Material Extract',
  materials_extract: 'Materials Extract',
  audio_transcribe: 'Audio Transcription',
};

export const PHASE_ORDER = [
  'discussion',
  'design',
  'quotation',
  'implementation',
  'completed',
];

export const PHASE_COLORS_HEX: Record<string, string> = {
  discussion: '#1e4fd6',
  design: '#7c5ce6',
  quotation: '#0c96c2',
  implementation: '#d9692c',
  completed: '#1f9d55',
};

export const MARKETING_URL = '/';

export const CARD_CLS = 'surface p-4';

export const INPUT_CLS = 'field !py-2.5';
