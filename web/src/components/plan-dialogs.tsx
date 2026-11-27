"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Image from "next/image";
import { BackIcon, EditIcon, PlusIcon } from "@/components/icons";

// ---------------------------------------------------------------- shared dialog shell

function Dialog({
  open,
  onClose,
  title,
  wide = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
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
      className={wide ? "plan-dialog wide" : "plan-dialog"}
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

type RecipeGroup = { bookId: string; book: string; recipes: { id: string; title: string; image: string | null }[] };

// The chosen book is kept while the page is open, so the next "+" starts there.
let lastBookId: string | null = null;

/**
 * The add dialog, rendered once per page: a gallery of one recipe book's recipes (book chosen
 * top left), a tap adds the recipe right away. Top right switches to a free entry. The recipes
 * are loaded when the dialog first opens, then kept for the rest of the visit.
 */
export function AddEntryDialog({
  action,
  loadRecipes,
}: {
  action: (formData: FormData) => Promise<void>;
  loadRecipes: () => Promise<RecipeGroup[]>;
}) {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => target,
    () => null,
  );
  const [groups, setGroups] = useState<RecipeGroup[] | null>(null);
  const [bookId, setBookId] = useState<string | null>(lastBookId);
  const [query, setQuery] = useState("");
  const [freeEntry, setFreeEntry] = useState(false);
  const open = current !== null;

  useEffect(() => {
    if (!open || groups !== null) return;
    let cancelled = false;
    loadRecipes()
      .then((g) => !cancelled && setGroups(g))
      .catch(() => !cancelled && setGroups([]));
    return () => {
      cancelled = true;
    };
  }, [open, groups, loadRecipes]);

  function close() {
    setTarget(null);
    setFreeEntry(false);
    setQuery("");
  }

  const group = groups?.find((g) => g.bookId === bookId) ?? groups?.[0] ?? null;
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const recipes = (group?.recipes ?? []).filter((r) => words.every((w) => r.title.toLowerCase().includes(w)));
  const hidden = (
    <>
      <input type="hidden" name="day" value={current?.day ?? ""} />
      <input type="hidden" name="meal" value={current?.meal ?? ""} />
    </>
  );

  return (
    <Dialog open={open} onClose={close} title={current ? `Gericht hinzufügen – ${current.label}` : ""} wide={!freeEntry}>
      {freeEntry ? (
        // key: a fresh, empty form for every cell
        <form action={action} key={current ? `${current.day}-${current.meal}` : "none"}>
          {hidden}
          <div className="dialog-toolbar">
            <button type="button" className="secondary icon-button" aria-label="Zurück zu den Rezepten" title="Zurück zu den Rezepten" onClick={() => setFreeEntry(false)}>
              <BackIcon />
            </button>
            <strong>Eigener Eintrag</strong>
          </div>
          <label className="field">
            <span>Was gibt es?</span>
            <input type="text" name="title" required maxLength={200} placeholder="z. B. Pizza, Reste, Essen gehen" autoFocus />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Portionen (optional)</span>
              <input type="number" name="servings" min={1} max={100} step="any" />
            </label>
            <label className="field">
              <span>Notiz (optional)</span>
              <input type="text" name="note" maxLength={500} />
            </label>
          </div>
          <label className="field">
            <span>Zutaten (optional)</span>
            <textarea name="ingredients" rows={3} placeholder={"z. B. 6 Würstchen\n2 Baguettes\nSenf"} />
            <span className="hint">Eine pro Zeile. Sie kommen mit auf die Einkaufsliste; die Nährwerte schätzt die KI.</span>
          </label>
          <button type="submit">Hinzufügen</button>
        </form>
      ) : (
        <form action={action}>
          {hidden}
          <div className="dialog-toolbar">
            <label className="visually-hidden" htmlFor="add-book">
              Rezeptbuch
            </label>
            <select
              id="add-book"
              value={group?.bookId ?? ""}
              disabled={!groups || groups.length === 0}
              onChange={(e) => {
                lastBookId = e.target.value;
                setBookId(e.target.value);
              }}
            >
              {groups === null && <option value="">Wird geladen…</option>}
              {groups?.map((g) => (
                <option key={g.bookId} value={g.bookId}>
                  {g.book} ({g.recipes.length})
                </option>
              ))}
            </select>
            <button type="button" className="secondary btn-small" onClick={() => setFreeEntry(true)}>
              <EditIcon /> Eigener Eintrag
            </button>
          </div>
          {group && group.recipes.length > 8 && (
            <input
              type="search"
              className="gallery-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`In „${group.book}“ suchen`}
              aria-label="Rezepte durchsuchen"
            />
          )}
          {groups === null ? (
            <p className="muted">Rezepte werden geladen…</p>
          ) : recipes.length === 0 ? (
            <p className="empty">{query ? "Kein Rezept gefunden." : "In diesem Buch sind noch keine Rezepte."}</p>
          ) : (
            <ul className="recipe-grid gallery">
              {recipes.map((r) => (
                <li key={r.id}>
                  <button type="submit" name="recipe_id" value={r.id} className="recipe-card gallery-card">
                    <span className="recipe-card-image">
                      {r.image ? (
                        <Image src={r.image} alt="" fill sizes="160px" />
                      ) : (
                        <span aria-hidden="true">{r.title.slice(0, 1).toUpperCase()}</span>
                      )}
                    </span>
                    <span className="recipe-card-title">{r.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}
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
