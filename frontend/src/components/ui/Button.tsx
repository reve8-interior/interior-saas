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

// The look lives in globals.css (.btn-*), so <Button> and plain class names can never drift apart.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  // Low-emphasis destructive action for repeated rows (e.g. per-row Deactivate)
  'danger-subtle': 'btn-danger-soft',
  success: 'btn-success',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
};

/** Returns the same classes <Button> uses, for non-<button> elements (e.g. Link) that must look like a button. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className = ''
) {
  return [VARIANT_CLASSES[variant], SIZE_CLASSES[size], className]
    .filter(Boolean)
    .join(' ');
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
        className={buttonClasses(variant, size, className)}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
