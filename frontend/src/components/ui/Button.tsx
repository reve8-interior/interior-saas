import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'danger-subtle'
  | 'success'
  | 'outline'
  | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-primary-600 to-secondary-600 text-white shadow-brand hover:brightness-110 focus-visible:ring-primary-500',
  secondary:
    'border border-line bg-white/70 text-dark-800 hover:bg-white dark:border-primary-300/20 dark:bg-white/5 dark:text-dark-100 dark:hover:bg-white/10 focus-visible:ring-primary-400',
  danger:
    'bg-red-600 text-white shadow-[0_10px_24px_-10px_rgb(212_42_60/0.7)] hover:bg-red-500 focus-visible:ring-red-500',
  // Low-emphasis destructive action for repeated rows (e.g. per-row Deactivate)
  'danger-subtle':
    'border border-red-200 bg-white/70 text-red-600 hover:border-red-300 hover:bg-red-50 dark:border-red-400/30 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-500/10 focus-visible:ring-red-500',
  success:
    'bg-green-600 text-white shadow-[0_10px_24px_-10px_rgb(31_157_85/0.7)] hover:bg-green-500 focus-visible:ring-green-500',
  outline:
    'border border-line bg-white/60 text-dark-700 hover:border-primary-400 hover:text-primary-600 dark:border-primary-300/20 dark:bg-transparent dark:text-dark-200 dark:hover:border-primary-400 dark:hover:text-primary-300 focus-visible:ring-primary-500',
  ghost:
    'bg-transparent text-dark-600 hover:bg-primary-50 hover:text-primary-700 dark:text-dark-300 dark:hover:bg-white/5 dark:hover:text-white focus-visible:ring-primary-400',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3.5 text-xs max-lg:h-10',
  md: 'h-10 gap-2 px-5 text-sm max-lg:h-11',
  lg: 'h-12 gap-2 px-6 text-base',
};

/** Returns the same classes <Button> uses, for non-<button> elements (e.g. Link) that must look like a button. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className = ''
) {
  return `inline-flex items-center justify-center rounded-full font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`inline-flex items-center justify-center rounded-full font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
