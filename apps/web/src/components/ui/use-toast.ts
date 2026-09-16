import * as React from 'react';

export type ToastVariant =
  'default' | 'success' | 'destructive' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
  duration?: number;
  open?: boolean;
}

export type ToastOptions = Omit<ToastItem, 'id' | 'open'>;

const TOAST_LIMIT = 4;
const TOAST_REMOVE_DELAY = 4500;

type Action =
  | { type: 'ADD_TOAST'; toast: ToastItem }
  | { type: 'UPDATE_TOAST'; toast: Partial<ToastItem> }
  | { type: 'DISMISS_TOAST'; toastId?: string }
  | { type: 'REMOVE_TOAST'; toastId?: string };

interface State {
  toasts: ToastItem[];
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return `toast-${count}-${Date.now()}`;
}

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case 'UPDATE_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };

    case 'DISMISS_TOAST': {
      const { toastId } = action;

      if (toastId) {
        return {
          ...state,
          toasts: state.toasts.filter((t) => t.id !== toastId),
        };
      }
      return {
        ...state,
        toasts: [],
      };
    }

    case 'REMOVE_TOAST':
      if (action.toastId === undefined) {
        return { ...state, toasts: [] };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
}

export function toast(options: ToastOptions): string {
  const id = genId();
  const duration = options.duration ?? TOAST_REMOVE_DELAY;

  const update = (props: Partial<ToastItem>) =>
    dispatch({
      type: 'UPDATE_TOAST',
      toast: { ...props, id },
    });

  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toastId: id });

  dispatch({
    type: 'ADD_TOAST',
    toast: {
      ...options,
      id,
      open: true,
    },
  });

  if (duration > 0) {
    const timeout = setTimeout(() => {
      dismiss();
      toastTimeouts.delete(id);
    }, duration);
    toastTimeouts.set(id, timeout);
  }

  return id;
}

toast.success = (
  title: React.ReactNode,
  description?: React.ReactNode,
  opts?: Partial<ToastOptions>
) =>
  toast({
    title,
    description,
    variant: 'success',
    ...opts,
  });

toast.error = (
  title: React.ReactNode,
  description?: React.ReactNode,
  opts?: Partial<ToastOptions>
) =>
  toast({
    title,
    description,
    variant: 'destructive',
    ...opts,
  });

toast.warning = (
  title: React.ReactNode,
  description?: React.ReactNode,
  opts?: Partial<ToastOptions>
) =>
  toast({
    title,
    description,
    variant: 'warning',
    ...opts,
  });

toast.info = (
  title: React.ReactNode,
  description?: React.ReactNode,
  opts?: Partial<ToastOptions>
) =>
  toast({
    title,
    description,
    variant: 'info',
    ...opts,
  });

toast.dismiss = (toastId?: string) => {
  if (toastId) {
    const timeout = toastTimeouts.get(toastId);
    if (timeout) {
      clearTimeout(timeout);
      toastTimeouts.delete(toastId);
    }
  } else {
    toastTimeouts.forEach((timeout) => clearTimeout(timeout));
    toastTimeouts.clear();
  }
  dispatch({ type: 'DISMISS_TOAST', toastId });
};

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: toast.dismiss,
  };
}
