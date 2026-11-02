import * as React from 'react';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InputProps } from './input';

export interface PasswordInputProps extends Omit<InputProps, 'type'> {
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      id,
      disabled,
      showPasswordLabel = 'Show password',
      hidePasswordLabel = 'Hide password',
      'aria-describedby': ariaDescribedByProp,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const generatedId = React.useId();
    const inputId =
      id || (label ? label.toLowerCase().replace(/\s+/g, '-') : generatedId);

    const errorId = error ? `${inputId}-error` : undefined;
    const helperTextId = helperText ? `${inputId}-helper-text` : undefined;

    const describedBy =
      [ariaDescribedByProp, error ? errorId : helperText ? helperTextId : undefined]
        .filter(Boolean)
        .join(' ') || undefined;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-foreground/90"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <input
            type={showPassword ? 'text' : 'password'}
            id={inputId}
            className={cn(
              'flex h-10 w-full rounded-lg border border-input bg-background/50 pl-3 pr-10 py-2 text-sm text-foreground shadow-sm backdrop-blur-sm transition-all duration-200 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50',
              error &&
                'border-destructive focus-visible:ring-destructive/40 text-destructive-foreground',
              className
            )}
            ref={ref}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            {...props}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            disabled={disabled}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 transition-colors disabled:pointer-events-none disabled:opacity-50"
            aria-label={showPassword ? hidePasswordLabel : showPasswordLabel}
            title={showPassword ? hidePasswordLabel : showPasswordLabel}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {error ? (
          <p id={errorId} className="text-xs text-destructive">
            {error}
          </p>
        ) : helperText ? (
          <p id={helperTextId} className="text-xs text-muted-foreground">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };

