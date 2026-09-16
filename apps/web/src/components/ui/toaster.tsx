import * as React from 'react';
import { useToast } from './use-toast';
import { Toast, ToastTitle, ToastDescription } from './toast';

export const Toaster: React.FC = () => {
  const { toasts, dismiss } = useToast();

  if (!toasts || toasts.length === 0) {
    return null;
  }

  return (
    <aside
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm sm:max-w-md w-full pointer-events-none p-4 sm:p-0"
    >
      {toasts.map((item) => (
        <Toast
          key={item.id}
          variant={item.variant}
          onDismiss={() => dismiss(item.id)}
          data-testid={`toast-${item.variant || 'default'}`}
        >
          {item.title && <ToastTitle>{item.title}</ToastTitle>}
          {item.description && (
            <ToastDescription>{item.description}</ToastDescription>
          )}
        </Toast>
      ))}
    </aside>
  );
};
