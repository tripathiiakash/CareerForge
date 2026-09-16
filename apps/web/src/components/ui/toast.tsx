import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToastVariant } from './use-toast';

export const toastVariants = cva(
  'pointer-events-auto relative flex w-full max-w-md items-start gap-3 overflow-hidden rounded-xl p-4 shadow-xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-5',
  {
    variants: {
      variant: {
        default:
          'bg-card/95 border border-border/80 text-foreground shadow-black/40',
        success:
          'bg-emerald-950/90 border border-emerald-500/40 text-emerald-100 shadow-emerald-950/30',
        destructive:
          'bg-red-950/90 border border-red-500/40 text-red-100 shadow-red-950/30',
        warning:
          'bg-amber-950/90 border border-amber-500/40 text-amber-100 shadow-amber-950/30',
        info: 'bg-blue-950/90 border border-blue-500/40 text-blue-100 shadow-blue-950/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface ToastProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof toastVariants> {
  onDismiss?: () => void;
}

export const ToastIcon: React.FC<{ variant?: ToastVariant }> = ({
  variant,
}) => {
  switch (variant) {
    case 'success':
      return (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400 mt-0.5" />
      );
    case 'destructive':
      return <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />;
    case 'warning':
      return (
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
      );
    case 'info':
      return <Info className="h-5 w-5 shrink-0 text-blue-400 mt-0.5" />;
    default:
      return <Info className="h-5 w-5 shrink-0 text-primary mt-0.5" />;
  }
};

export const Toast = React.forwardRef<HTMLDivElement, ToastProps>(
  ({ className, variant = 'default', children, onDismiss, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role={variant === 'destructive' ? 'alert' : 'status'}
        aria-live={variant === 'destructive' ? 'assertive' : 'polite'}
        className={cn(toastVariants({ variant }), className)}
        {...props}
      >
        <ToastIcon variant={variant as ToastVariant} />
        <div className="flex-1 space-y-1">{children}</div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg p-1 text-muted-foreground/80 hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Close notification"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }
);
Toast.displayName = 'Toast';

export const ToastTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn(
      'text-sm font-semibold tracking-tight leading-none',
      className
    )}
    {...props}
  />
));
ToastTitle.displayName = 'ToastTitle';

export const ToastDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-xs opacity-90 leading-relaxed font-normal', className)}
    {...props}
  />
));
ToastDescription.displayName = 'ToastDescription';
