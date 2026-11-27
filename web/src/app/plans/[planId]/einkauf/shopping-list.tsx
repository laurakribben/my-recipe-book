"use client";

import { useOptimistic, useTransition } from "react";
import type { ShoppingItem } from "@/lib/plans";

type Props = {
  items: ShoppingItem[];
  editable: boolean;
  setChecked: (itemId: string, checked: boolean) => Promise<void>;
  remove: (itemId: string) => Promise<void>;
};

/** The shopping list: tap to tick off (shown immediately, saved in the background). */
export function ShoppingList({ items, editable, setChecked, remove }: Props) {
  const [, startTransition] = useTransition();
  const [optimistic, update] = useOptimistic(
    items,
    (current, change: { id: string; checked?: boolean; removed?: boolean }) =>
      change.removed
        ? current.filter((i) => i.id !== change.id)
        : current.map((i) => (i.id === change.id ? { ...i, checked: change.checked ?? i.checked } : i)),
  );

  if (optimistic.length === 0) return <p className="empty">Die Liste ist leer.</p>;

  const open = optimistic.filter((i) => !i.checked);
  const done = optimistic.filter((i) => i.checked);

  const row = (item: ShoppingItem) => (
    <li key={item.id}>
      <label className={item.checked ? "checked" : ""}>
        <input
          type="checkbox"
          checked={item.checked}
          onChange={(e) => {
            const checked = e.target.checked;
            startTransition(async () => {
              update({ id: item.id, checked });
              await setChecked(item.id, checked);
            });
          }}
        />
        <span>
          {item.text}
          {item.source && <span className="shopping-source">{item.source}</span>}
        </span>
      </label>
      {editable && (
        <button
          type="button"
          className="danger icon-button"
          aria-label={`${item.text} löschen`}
          onClick={() =>
            startTransition(async () => {
              update({ id: item.id, removed: true });
              await remove(item.id);
            })
          }
        >
          ✕
        </button>
      )}
    </li>
  );

  return (
    <>
      <ul className="shopping-list">{open.map(row)}</ul>
      {done.length > 0 && (
        <>
          <p className="muted small">Erledigt ({done.length})</p>
          <ul className="shopping-list">{done.map(row)}</ul>
        </>
      )}
    </>
  );
}
