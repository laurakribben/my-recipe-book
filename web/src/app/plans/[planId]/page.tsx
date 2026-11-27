import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canEdit } from "@/lib/books";
import {
  addDays,
  formatDay,
  formatWeek,
  getMyPlans,
  getPlanForUser,
  isIsoDate,
  mondayOf,
  today,
  weekDays,
  type PlanEntry,
} from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import { addEntry, addWeekToShopping, deleteEntry, updateEntry } from "../actions";

type Props = { params: Promise<{ planId: string }>; searchParams: Promise<{ woche?: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { planId } = await props.params;
  const access = await getPlanForUser(planId);
  return { title: access?.plan.name ?? "Wochenplan" };
}

function formatServings(n: number) {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

export default async function PlanWeekPage(props: Props) {
  const { planId } = await props.params;
  const { woche } = await props.searchParams;
  const access = await getPlanForUser(planId);
  if (!access) notFound();
  const { plan, role, user } = access;
  const editable = canEdit(role);

  const todayDate = today();
  const monday = mondayOf(isIsoDate(woche) ? woche : todayDate);
  const days = weekDays(monday);

  const supabase = await createClient();
  const { data: entryRows } = await supabase
    .from("meal_plan_entries")
    .select("id, plan_id, day, recipe_id, title, servings, note, created_at")
    .eq("plan_id", plan.id)
    .gte("day", days[0])
    .lte("day", days[6])
    .order("created_at");
  const entries = (entryRows ?? []) as PlanEntry[];

  // Recipes the user can plan: those in their own and shared books, grouped by book. (Without
  // the book filter, public recipes of other people's books would show up too.)
  const { data: memberships } = await supabase.from("book_members").select("book_id").eq("user_id", user.id);
  const bookIds = (memberships ?? []).map((m) => m.book_id);
  const { data: recipeRows } =
    editable && bookIds.length > 0
      ? await supabase
          .from("recipes")
          .select("id, title, book_id, books (name)")
          .in("book_id", bookIds)
          .order("title")
          .limit(1000)
      : { data: [] };
  const byBook = new Map<string, { id: string; title: string }[]>();
  for (const r of recipeRows ?? []) {
    const book = (r.books as unknown as { name: string } | null)?.name ?? "Rezepte";
    if (!byBook.has(book)) byBook.set(book, []);
    byBook.get(book)!.push({ id: r.id, title: r.title });
  }
  const plans = await getMyPlans(user.id);

  return (
    <>
      <div className="row spread">
        <h1 style={{ marginBottom: 0 }}>{plan.name}</h1>
        <div className="row small">
          <Link href={`/plans/${plan.id}/einkauf`} className="button">
            Einkaufsliste
          </Link>
          <Link href={`/plans/${plan.id}/settings`}>{role === "owner" ? "Teilen" : "Mitglieder"}</Link>
        </div>
      </div>
      {plans.length > 1 && (
        <p className="small">
          Weitere Pläne:{" "}
          {plans
            .filter((p) => p.id !== plan.id)
            .map((p, i) => (
              <span key={p.id}>
                {i > 0 && " · "}
                <Link href={`/plans/${p.id}`}>{p.name}</Link>
              </span>
            ))}
        </p>
      )}

      <nav className="week-nav" aria-label="Woche">
        <Link href={`/plans/${plan.id}?woche=${addDays(monday, -7)}`} aria-label="Vorherige Woche">
          ←
        </Link>
        <span>
          <strong>{formatWeek(monday)}</strong>
          {monday !== mondayOf(todayDate) && (
            <>
              {" "}
              · <Link href={`/plans/${plan.id}`}>Diese Woche</Link>
            </>
          )}
        </span>
        <Link href={`/plans/${plan.id}?woche=${addDays(monday, 7)}`} aria-label="Nächste Woche">
          →
        </Link>
      </nav>

      {editable && entries.some((e) => e.recipe_id) && (
        <form action={addWeekToShopping.bind(null, plan.id, monday)}>
          <button type="submit" className="secondary">
            Einkaufsliste für diese Woche
          </button>
        </form>
      )}

      <div className="week">
        {days.map((day) => {
          const dayEntries = entries.filter((e) => e.day === day);
          return (
            <section key={day} id={`tag-${day}`} className={day === todayDate ? "day today" : "day"}>
              <h2>
                {formatDay(day)}
                {day === todayDate && <span className="badge">heute</span>}
              </h2>
              {dayEntries.length === 0 && !editable && <p className="empty small">Nichts geplant.</p>}
              <ul className="plain-list">
                {dayEntries.map((e) => (
                  <li key={e.id}>
                    {e.recipe_id ? (
                      <Link href={`/recipes/${e.recipe_id}${e.servings ? `?portionen=${e.servings}` : ""}`}>{e.title}</Link>
                    ) : (
                      <span>{e.title}</span>
                    )}
                    {e.servings && <span className="badge">für {formatServings(e.servings)}</span>}
                    {e.note && <span className="list-tags">{e.note}</span>}
                    {editable && (
                      <details className="entry-edit">
                        <summary>Ändern</summary>
                        <form action={updateEntry.bind(null, plan.id, e.id)} className="grid-2">
                          <label className="field">
                            <span>Tag</span>
                            <input type="date" name="day" defaultValue={e.day} required />
                          </label>
                          <label className="field">
                            <span>Portionen</span>
                            <input type="number" name="servings" min={1} max={100} step="any" defaultValue={e.servings ?? ""} />
                          </label>
                          <label className="field">
                            <span>Notiz</span>
                            <input type="text" name="note" maxLength={500} defaultValue={e.note ?? ""} />
                          </label>
                          <div className="row">
                            <button type="submit">Speichern</button>
                          </div>
                        </form>
                        <form action={deleteEntry.bind(null, plan.id, e.id, e.day)}>
                          <button type="submit" className="link-button">
                            Entfernen
                          </button>
                        </form>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
              {editable && (
                <details className="entry-add">
                  <summary>+ Gericht</summary>
                  <form action={addEntry.bind(null, plan.id)}>
                    <input type="hidden" name="day" value={day} />
                    <label className="field">
                      <span>Rezept</span>
                      <select name="recipe_id" defaultValue="">
                        <option value="">– kein Rezept, freier Eintrag –</option>
                        {[...byBook.entries()].map(([book, list]) => (
                          <optgroup key={book} label={book}>
                            {list.map((r) => (
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
                        <input type="text" name="note" maxLength={500} />
                      </label>
                    </div>
                    <button type="submit">Hinzufügen</button>
                  </form>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
