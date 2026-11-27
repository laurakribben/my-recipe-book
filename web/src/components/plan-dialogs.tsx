"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { EditIcon, PlusIcon } from "@/components/icons";

// ---------------------------------------------------------------- shared dialog shell

function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="plan-dialog"
      aria-label={title}
      onClose={onClose}
      // A click on the dark backdrop (outside the box) closes it.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      // Submitting a form inside closes it; the page then reloads with the change.
      onSubmit={() => onClose()}
    >
      <div className="plan-dialog-head">
        <h2>{title}</h2>
        <button type="button" className="secondary icon-button" aria-label="Schließen" onClick={onClose}>
          ✕
        </button>
      </div>
      {children}
    </dialog>
  );
}

// ---------------------------------------------------------------- add: one dialog, many "+" buttons

type AddTarget = { day: string; meal: string; label: string } | null;
let target: AddTarget = null;
const listeners = new Set<() => void>();
const setTarget = (t: AddTarget) => {
  target = t;
  listeners.forEach((l) => l());
};

/** "+" in a cell of the week: opens the add dialog for that day and meal. */
export function AddEntryButton({ day, meal, label }: { day: string; meal: string; label: string }) {
  return (
    <button
      type="button"
      className="secondary icon-button add-entry"
      aria-label={`Gericht hinzufügen: ${label}`}
      title="Gericht hinzufügen"
      onClick={() => setTarget({ day, meal, label })}
    >
      <PlusIcon />
    </button>
  );
}

/**
 * The add form, rendered once per page (the recipe list can be long). `action` is the
 * server action; the recipe options come pre-grouped by recipe book.
 */
export function AddEntryDialog({
  action,
  recipeGroups,
}: {
  action: (formData: FormData) => Promise<void>;
  recipeGroups: { book: string; recipes: { id: string; title: string }[] }[];
}) {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => target,
    () => null,
  );

  return (
    <Dialog open={current !== null} onClose={() => setTarget(null)} title={current ? `Gericht hinzufügen – ${current.label}` : ""}>
      {/* key: a fresh, empty form for every cell */}
      <form action={action} key={current ? `${current.day}-${current.meal}` : "none"}>
        <input type="hidden" name="day" value={current?.day ?? ""} />
        <input type="hidden" name="meal" value={current?.meal ?? ""} />
        <label className="field">
          <span>Rezept</span>
          <select name="recipe_id" defaultValue="">
            <option value="">– kein Rezept, freier Eintrag –</option>
            {recipeGroups.map((g) => (
              <optgroup key={g.book} label={g.book}>
                {g.recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="field">
          <span>oder freier Eintrag</span>
          <input type="text" name="title" maxLength={200} placeholder="z. B. Reste, Essen gehen" />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Portionen (optional)</span>
            <input type="number" name="servings" min={1} max={100} step="any" placeholder="wie im Rezept" />
          </label>
          <label className="field">
            <span>Notiz (optional)</span>
            <input type="text" name="note" maxLength={500} placeholder="z. B. Tofu statt Hähnchen" />
          </label>
        </div>
        <label className="field">
          <span>Zutaten (optional)</span>
          <textarea name="ingredients" rows={3} placeholder={"z. B. 6 Würstchen\n2 Baguettes\nSenf"} />
          <span className="hint">
            Eine pro Zeile – z. B. für einen freien Eintrag oder Extras zum Rezept. Sie kommen mit auf die Einkaufsliste.
          </span>
        </label>
        <button type="submit">Hinzufügen</button>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- edit: pencil next to an entry

/**
 * Pencil icon next to a plan entry; opens a dialog with the edit form (passed in as
 * children from the server). Elements marked data-close-dialog close it when clicked.
 */
export function EditEntryButton({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="secondary icon-button edit-entry"
        aria-label={`${title} bearbeiten`}
        title="Bearbeiten"
        onClick={() => setOpen(true)}
      >
        <EditIcon />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`${title} bearbeiten`}>
        <div
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest("[data-close-dialog]")) setTimeout(() => setOpen(false), 0);
          }}
        >
          {children}
        </div>
      </Dialog>
    </>
  );
}
