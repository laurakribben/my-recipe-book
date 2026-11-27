"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { TrashIcon } from "@/components/icons";

type Toast = { id: number; message: string; action?: { label: string; run: () => Promise<unknown> | void } };

// A tiny global store: any client component can call showToast(); <Toaster /> in the layout shows them.
// At most MAX_TOASTS at once: removing many things in a row doesn't pile up messages.
const MAX_TOASTS = 3;
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showToast(toast: Omit<Toast, "id">) {
  toasts = [...toasts, { ...toast, id: nextId++ }].slice(-MAX_TOASTS);
  emit();
}

function dismiss(id: number) {
  if (toasts.some((t) => t.id === id)) {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }
}

const DURATION_MS = 7000;
const EMPTY: Toast[] = [];

/** Shows the latest toasts (newest at the bottom) for a few seconds each. */
export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
    () => EMPTY,
  );
  if (list.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast.id]);

  return (
    <div className="toast">
      <span>{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="secondary btn-small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await toast.action!.run();
            } finally {
              setBusy(false);
              dismiss(toast.id);
            }
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className="icon-button toast-close" aria-label="Meldung schließen" onClick={() => dismiss(toast.id)}>
        ✕
      </button>
    </div>
  );
}

/**
 * A remove button (trash icon) with undo: calls `remove` (a server action that returns what was removed),
 * then offers "Rückgängig" in a toast, which passes that back to `restore`.
 */
export function UndoableRemove<T>({
  remove,
  restore,
  message,
  label = "Entfernen",
  className = "danger icon-button",
}: {
  remove: () => Promise<T | null>;
  restore: (snapshot: T) => Promise<unknown>;
  message: string;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const snapshot = await remove();
          if (snapshot) showToast({ message, action: { label: "Rückgängig", run: () => restore(snapshot) } });
        } finally {
          setBusy(false);
        }
      }}
    >
      <TrashIcon />
    </button>
  );
}
