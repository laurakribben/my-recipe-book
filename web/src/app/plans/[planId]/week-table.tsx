"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition, type DragEvent } from "react";
import { AddEntryButton, EditEntryButton } from "@/components/plan-dialogs";
import { showToast, UndoableRemove } from "@/components/toast";
import type { PlanEntry } from "@/lib/plans";
import { formatDay, MEALS, type Meal } from "@/lib/week";
import { deleteEntry, moveCell, moveEntry, planIdeaAt, restoreEntry, updateEntry } from "../actions";

/** What is being dragged; travels in dataTransfer under this type. */
export const DRAG_TYPE = "application/x-recipebook-plan";
export type DragPayload =
  | { kind: "entry"; id: string }
  | { kind: "cell"; day: string; meal: Meal }
  | { kind: "idea"; id: string; title: string; recipe_id: string | null };

type Move =
  | { kind: "entry"; id: string; day: string; meal: Meal }
  | { kind: "cell"; fromDay: string; fromMeal: Meal; day: string; meal: Meal }
  | { kind: "idea"; id: string; title: string; recipe_id: string | null; day: string; meal: Meal };

function applyMove(entries: PlanEntry[], move: Move): PlanEntry[] {
  switch (move.kind) {
    case "entry":
      return entries.map((e) => (e.id === move.id ? { ...e, day: move.day, meal: move.meal } : e));
    case "cell":
      return entries.map((e) =>
        e.day === move.fromDay && e.meal === move.fromMeal ? { ...e, day: move.day, meal: move.meal } : e,
      );
    case "idea":
      return [
        ...entries,
        {
          id: `temp-${move.id}`,
          plan_id: "",
          day: move.day,
          meal: move.meal,
          recipe_id: move.recipe_id,
          title: move.title,
          servings: null,
          note: null,
          created_at: "",
        },
      ];
  }
}

function readPayload(e: DragEvent): DragPayload | null {
  try {
    return JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as DragPayload;
  } catch {
    return null;
  }
}

function formatServings(n: number) {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

type Props = { planId: string; days: string[]; todayDate: string; entries: PlanEntry[]; editable: boolean };

/**
 * The week: days × meals. A table on wide screens, a list on phones (see globals.css).
 * Editors can drag entries, whole cells and noted recipes onto other cells; the change
 * shows at once and is saved in the background.
 */
export function WeekTable({ planId, days, todayDate, entries: savedEntries, editable }: Props) {
  const [entries, applyOptimistic] = useOptimistic(savedEntries, applyMove);
  const [, startTransition] = useTransition();
  const [over, setOver] = useState<string | null>(null);

  function drop(e: DragEvent, day: string, meal: Meal) {
    e.preventDefault();
    setOver(null);
    const payload = readPayload(e);
    if (!payload) return;
    if (payload.kind === "cell" && payload.day === day && payload.meal === meal) return;
    startTransition(async () => {
      let ok = true;
      if (payload.kind === "entry") {
        if (entries.some((x) => x.id === payload.id && x.day === day && x.meal === meal)) return;
        applyOptimistic({ kind: "entry", id: payload.id, day, meal });
        ok = await moveEntry(planId, payload.id, day, meal);
      } else if (payload.kind === "cell") {
        applyOptimistic({ kind: "cell", fromDay: payload.day, fromMeal: payload.meal, day, meal });
        ok = await moveCell(planId, payload.day, payload.meal, day, meal);
      } else {
        applyOptimistic({ kind: "idea", id: payload.id, title: payload.title, recipe_id: payload.recipe_id, day, meal });
        ok = await planIdeaAt(planId, payload.id, day, meal);
      }
      if (!ok) showToast({ message: "Verschieben hat nicht geklappt." });
    });
  }

  return (
    <>
      {/* One structure for both layouts: a table (days × meals) on wide screens, a list
          (day by day, meal by meal) on phones. */}
      <div className="week-table">
        <div className="week-corner" aria-hidden="true" />
        {MEALS.map((meal, m) => (
          <div key={meal.id} className="meal-head" style={{ gridRow: m + 2 }} aria-hidden="true">
            {meal.label}
          </div>
        ))}
        {days.map((day, d) => (
          <section
            key={day}
            id={`tag-${day}`}
            className={day === todayDate ? "week-day today" : "week-day"}
            style={{ "--col": d + 2 } as React.CSSProperties}
          >
            <h2 className="day-head">
              <span className="dh-weekday">{formatDay(day).split(", ")[0]}</span>
              <span className="dh-date">{formatDay(day).split(", ")[1]}</span>
              {day === todayDate && <span className="badge">heute</span>}
            </h2>
            {MEALS.map((meal, m) => {
              const cellEntries = entries.filter((e) => e.day === day && (e.meal ?? "abends") === meal.id);
              return (
                <div
                  key={meal.id}
                  className={`cell${over === `${day}|${meal.id}` ? " drag-over" : ""}`}
                  style={{ gridRow: m + 2 }}
                  draggable={editable && cellEntries.length > 0}
                  onDragStart={(e) => {
                    if (e.target !== e.currentTarget) return; // an entry inside started the drag
                    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: "cell", day, meal: meal.id }));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    if (!editable || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (over !== `${day}|${meal.id}`) setOver(`${day}|${meal.id}`);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
                  }}
                  onDrop={(e) => drop(e, day, meal.id)}
                >
                  <div className="cell-head">
                    <h3>{meal.label}</h3>
                    {editable && (
                      <AddEntryButton day={day} meal={meal.id} label={`${formatDay(day)}, ${meal.label}`} />
                    )}
                  </div>
                  {cellEntries.length > 0 && (
                    <ul className="cell-entries">
                      {cellEntries.map((e) => (
                        <li
                          key={e.id}
                          draggable={editable && !e.id.startsWith("temp-")}
                          onDragStart={(ev) => {
                            ev.stopPropagation();
                            ev.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: "entry", id: e.id }));
                            ev.dataTransfer.effectAllowed = "move";
                          }}
                        >
                          <div className="entry-text">
                            {e.recipe_id ? (
                              <Link href={`/recipes/${e.recipe_id}${e.servings ? `?portionen=${e.servings}` : ""}`}>
                                {e.title}
                              </Link>
                            ) : (
                              <span>{e.title}</span>
                            )}
                            {e.servings && <span className="badge">für {formatServings(e.servings)}</span>}
                            {e.note && <p className="entry-note">{e.note}</p>}
                          </div>
                          {editable && !e.id.startsWith("temp-") && (
                            <EditEntryButton title={e.title}>
                              <form action={updateEntry.bind(null, planId, e.id)}>
                                <div className="grid-2">
                                  <label className="field">
                                    <span>Tag</span>
                                    <input type="date" name="day" defaultValue={e.day} required />
                                  </label>
                                  <label className="field">
                                    <span>Mahlzeit</span>
                                    <select name="meal" defaultValue={e.meal ?? "abends"}>
                                      {MEALS.map((x) => (
                                        <option key={x.id} value={x.id}>
                                          {x.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="field">
                                    <span>Portionen</span>
                                    <input type="number" name="servings" min={1} max={100} step="any" defaultValue={e.servings ?? ""} placeholder="wie im Rezept" />
                                  </label>
                                </div>
                                <label className="field">
                                  <span>Notiz</span>
                                  <input type="text" name="note" maxLength={500} defaultValue={e.note ?? ""} placeholder="nur im Wochenplan sichtbar" />
                                </label>
                                <div className="toolbar">
                                  <button type="submit">Speichern</button>
                                  <span data-close-dialog>
                                    <UndoableRemove
                                      remove={deleteEntry.bind(null, planId, e.id)}
                                      restore={restoreEntry.bind(null, planId)}
                                      message={`„${e.title}“ aus dem Plan entfernt.`}
                                      className="danger"
                                    />
                                  </span>
                                </div>
                              </form>
                            </EditEntryButton>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </>
  );
}
