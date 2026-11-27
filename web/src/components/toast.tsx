"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type Toast = { id: number; message: string; action?: { label: string; run: () => Promise<unknown> | void } };

// A tiny global store: any client component can call showToast(); <Toaster /> in the layout shows it.
let current: Toast | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showToast(toast: Omit<Toast, "id">) {
  current = { ...toast, id: nextId++ };
  emit();
}

function dismiss(id: number) {
  if (current?.id === id) {
    current = null;
    emit();
  }
}

const DURATION_MS = 7000;

/** Shows the latest toast at the bottom of the screen for a few seconds. */
export function Toaster() {
  const toast = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => dismiss(toast.id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
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
 * A remove button with undo: calls `remove` (a server action that returns what was removed),
 * then offers "Rückgängig" in a toast, which passes that back to `restore`.
 */
export function UndoableRemove<T>({
  remove,
  restore,
  message,
  label = "Entfernen",
  className = "danger btn-small",
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
      {label}
    </button>
  );
}
