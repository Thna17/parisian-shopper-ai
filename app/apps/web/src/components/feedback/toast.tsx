import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastType = 'good' | 'warn' | 'bad' | 'info';

export interface ToastMessage {
  readonly id: string;
  readonly title: string;
  readonly message?: string;
  readonly type?: ToastType;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<ToastMessage, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newToast: ToastMessage = { ...toast, id };
      setToasts((prev) => [...prev, newToast]);

      setTimeout(() => {
        removeToast(id);
      }, 4500);
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <div
        aria-live="polite"
        id="toast-container"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

const typeIconMap = {
  info: <Info className="w-4 h-4 text-navy-900" />,
  good: <CheckCircle2 className="w-4 h-4 text-status-good" />,
  warn: <AlertCircle className="w-4 h-4 text-status-warn" />,
  bad: <AlertCircle className="w-4 h-4 text-status-bad" />,
};

const ToastItem: React.FC<{ toast: ToastMessage; onClose: () => void }> = ({ toast, onClose }) => {
  const type = toast.type ?? 'info';

  return (
    <div
      role="status"
      className="pointer-events-auto flex items-start gap-3 p-3.5 bg-app-surface border border-app-border rounded-xl shadow-elevated text-sm transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
    >
      <div className="shrink-0 mt-0.5">{typeIconMap[type]}</div>
      <div className="flex-1 min-w-0">
        <h5 className="font-semibold text-app-primary text-xs leading-snug">{toast.title}</h5>
        {toast.message && (
          <p className="text-xs text-app-muted mt-0.5 leading-relaxed">{toast.message}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss notification"
        className="text-app-muted hover:text-app-primary p-0.5 rounded focus-visible:outline-2 focus-visible:outline-gold-500"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
