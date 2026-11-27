"use client";

import { useOptimistic, useTransition } from "react";
import type { ShoppingItem } from "@/lib/plans";
import { groupShoppingItems, type ShoppingRow } from "@/lib/shopping";
import type { ShoppingSnapshot } from "@/app/plans/actions";
import { showToast } from "@/components/toast";

type Props = {
  items: ShoppingItem[];
  editable: boolean;
  setChecked: (itemId: string, checked: boolean) => Promise<void>;
  remove: (itemId: string) => Promise<ShoppingSnapshot | null>;
  restore: (snapshot: ShoppingSnapshot) => Promise<void>;
};

type Change = { ids: string[]; checked?: boolean; removed?: boolean };

/**
 * The shopping list, grouped by supermarket aisle. Equal ingredients from several recipes
 * are one row with the total and, below, which recipe needs how much. Ticking or removing
 * a row applies to all items in it. Changes show at once and are saved in the background.
 */
export function ShoppingList({ items, editable, setChecked, remove, restore }: Props) {
  const [, startTransition] = useTransition();
  const [optimistic, update] = useOptimistic(items, (current, change: Change) =>
    change.removed
      ? current.filter((i) => !change.ids.includes(i.id))
      : current.map((i) => (change.ids.includes(i.id) ? { ...i, checked: change.checked ?? i.checked } : i)),
  );

  if (optimistic.length === 0) {
    return (
      <div className="card empty-state">
        <p style={{ marginTop: 0 }}>
          <strong>Die Einkaufsliste ist leer.</strong>
        </p>
        <p className="hint">
          Plane Rezepte im Wochenplan ein und tippe dort auf „Einkaufsliste für diese Woche“ – oder schreib unten eigene
          Einträge dazu.
        </p>
      </div>
    );
  }

  const open = groupShoppingItems(optimistic.filter((i) => !i.checked));
  const done = groupShoppingItems(optimistic.filter((i) => i.checked));
  const aisles = [...new Set(open.map((r) => r.aisle))];

  const toggle = (row: ShoppingRow<ShoppingItem>, checked: boolean) =>
    startTransition(async () => {
      const ids = row.items.map((i) => i.id);
      update({ ids, checked });
      await Promise.all(ids.map((id) => setChecked(id, checked)));
    });

  const removeRow = (row: ShoppingRow<ShoppingItem>) =>
    startTransition(async () => {
      const ids = row.items.map((i) => i.id);
      update({ ids, removed: true });
      const snapshots = (await Promise.all(ids.map((id) => remove(id)))).filter((s): s is ShoppingSnapshot => s !== null);
      if (snapshots.length > 0) {
        showToast({
          message: `„${row.text}“ entfernt.`,
          action: { label: "Rückgängig", run: () => Promise.all(snapshots.map((s) => restore(s))) },
        });
      }
    });

  const rowView = (row: ShoppingRow<ShoppingItem>, checked: boolean) => (
    <li key={row.items.map((i) => i.id).join("+")}>
      <label className={checked ? "checked" : ""}>
        <input type="checkbox" checked={checked} onChange={(e) => toggle(row, e.target.checked)} />
        <span>
          {row.text}
          {row.parts.length > 0 ? (
            <span className="shopping-source">{row.parts.join(" · ")}</span>
          ) : (
            row.items[0].source && <span className="shopping-source">{row.items[0].source}</span>
          )}
        </span>
      </label>
      {editable && (
        <button
          type="button"
          className="danger icon-button"
          aria-label={`${row.text} entfernen`}
          onClick={() => removeRow(row)}
        >
          ✕
        </button>
      )}
    </li>
  );

  return (
    <>
      {aisles.map((aisle) => (
        <section key={aisle} className="aisle">
          <h2>{aisle}</h2>
          <ul className="shopping-list">{open.filter((r) => r.aisle === aisle).map((r) => rowView(r, false))}</ul>
        </section>
      ))}
      {open.length === 0 && <p className="notice success">Alles erledigt!</p>}
      {done.length > 0 && (
        <section className="aisle">
          <h2 className="muted">Erledigt ({done.length})</h2>
          <ul className="shopping-list">{done.map((r) => rowView(r, true))}</ul>
        </section>
      )}
    </>
  );
}
