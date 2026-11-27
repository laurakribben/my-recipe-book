import Link from "next/link";
import { AddEntryButton, EditEntryButton } from "@/components/plan-dialogs";
import { UndoableRemove } from "@/components/toast";
import { formatDay, MEALS, type PlanEntry } from "@/lib/plans";
import { deleteEntry, restoreEntry, updateEntry } from "../actions";

function formatServings(n: number) {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

type Props = { planId: string; days: string[]; todayDate: string; entries: PlanEntry[]; editable: boolean };

/** The week: days × meals. A table on wide screens, a list on phones (see globals.css). */
export function WeekTable({ planId, days, todayDate, entries, editable }: Props) {
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
                <div key={meal.id} className="cell" style={{ gridRow: m + 2 }}>
                  <div className="cell-head">
                    <h3>{meal.label}</h3>
                    {editable && (
                      <AddEntryButton day={day} meal={meal.id} label={`${formatDay(day)}, ${meal.label}`} />
                    )}
                  </div>
                  {cellEntries.length > 0 && (
                    <ul className="cell-entries">
                      {cellEntries.map((e) => (
                        <li key={e.id}>
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
                          {editable && (
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
