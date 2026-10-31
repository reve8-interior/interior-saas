/** The sliding track and knob of an on/off switch; decorative on its own. */
export function SwitchTrack({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-brand' : 'bg-dark-300 dark:bg-white/15'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </span>
  );
}

/** Stand-alone switch button. Use `SwitchTrack` inside your own row when a text label belongs to it. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 shrink-0 items-center disabled:cursor-not-allowed disabled:opacity-40"
    >
      <SwitchTrack checked={checked} />
    </button>
  );
}
