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
  weekStartOf,
  today,
  weekDays,
  MEALS,
  type PlanEntry,
  type PlanIdea,
} from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import { UndoableRemove } from "@/components/toast";
import { AddEntryDialog } from "@/components/plan-dialogs";
import { DraggableIdea } from "./draggable-idea";
import { WeekTable } from "./week-table";
import {
  addEntry,
  addWeekToShopping,
  deleteIdea,
  moveIdea,
  planIdea,
  restoreIdea,
  type IdeaList,
} from "../actions";

type Props = { params: Promise<{ planId: string }>; searchParams: Promise<{ woche?: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { planId } = await props.params;
  const access = await getPlanForUser(planId);
  return { title: access?.plan.name ?? "Wochenplan" };
}

export default async function PlanWeekPage(props: Props) {
  const { planId } = await props.params;
  const { woche } = await props.searchParams;
  const access = await getPlanForUser(planId);
  if (!access) notFound();
  const { plan, role, user } = access;
  const editable = canEdit(role);

  const todayDate = today();
  const thisWeek = weekStartOf(todayDate, plan.week_start);
  const weekStart = weekStartOf(isIsoDate(woche) ? woche : todayDate, plan.week_start);
  const days = weekDays(weekStart);

  const supabase = await createClient();
  const { data: entryRows } = await supabase
    .from("meal_plan_entries")
    .select("id, plan_id, day, meal, position, recipe_id, title, servings, note, created_at")
    .eq("plan_id", plan.id)
    .gte("day", days[0])
    .lte("day", days[6])
    .order("position")
    .order("created_at");
  const entries = (entryRows ?? []) as PlanEntry[];

  // Idea lists: everything up to this week is "Diese Woche" (left-overs included), later is "Nächste Woche".
  const nextWeek = addDays(thisWeek, 7);
  const { data: ideaRows } = await supabase
    .from("meal_plan_ideas")
    .select("id, recipe_id, title, week, created_at")
    .eq("plan_id", plan.id)
    .order("created_at");
  const ideas = (ideaRows ?? []) as PlanIdea[];
  const ideaLists: { list: IdeaList; title: string; start: string; items: PlanIdea[] }[] = [
    { list: "this", title: "Diese Woche", start: thisWeek, items: ideas.filter((i) => i.week < nextWeek) },
    { list: "next", title: "Nächste Woche", start: nextWeek, items: ideas.filter((i) => i.week >= nextWeek) },
  ];

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
        <div className="toolbar">
          <Link href={`/plans/${plan.id}/einkauf`} className="button">
            Einkaufsliste
          </Link>
          <Link href={`/plans/${plan.id}/settings`} className="button secondary">
            {role === "owner" ? "Teilen & Einstellungen" : "Mitglieder"}
          </Link>
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

      <section id="ideen" className="ideas" aria-label="Ideen">
        {ideaLists.map(({ list, title, start, items }) => (
          <div key={list} className="idea-list">
            <h2>
              {title} <span className="muted small">({items.length})</span>
            </h2>
            {items.length === 0 && (
              <p className="empty small">Merke Rezepte auf der Rezeptseite mit „{title}“ vor.</p>
            )}
            <ul className="plain-list">
              {items.map((idea) => (
                <DraggableIdea key={idea.id} id={idea.id} title={idea.title} recipeId={idea.recipe_id} enabled={editable}>
                  {idea.recipe_id ? <Link href={`/recipes/${idea.recipe_id}`}>{idea.title}</Link> : <span>{idea.title}</span>}
                  {editable && (
                    <details className="disclosure">
                      <summary>Einplanen</summary>
                      <form action={planIdea.bind(null, plan.id, idea.id)} className="grid-2">
                        <label className="field">
                          <span>Tag</span>
                          <select name="day" defaultValue={list === "this" && todayDate >= start ? todayDate : start}>
                            {weekDays(start).map((d) => (
                              <option key={d} value={d}>
                                {formatDay(d)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Mahlzeit</span>
                          <select name="meal" defaultValue="abends">
                            {MEALS.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Portionen</span>
                          <input type="number" name="servings" min={1} max={100} step="any" placeholder="wie im Rezept" />
                        </label>
                        <label className="field">
                          <span>Notiz (optional)</span>
                          <input type="text" name="note" maxLength={500} placeholder="z. B. doppelte Menge Sauce" />
                        </label>
                        <div className="row">
                          <button type="submit">Einplanen</button>
                        </div>
                      </form>
                      <div className="row small">
                        <form action={moveIdea.bind(null, plan.id, idea.id, list === "this" ? "next" : "this")}>
                          <button type="submit" className="secondary btn-small">
                            {list === "this" ? "→ Nächste Woche" : "← Diese Woche"}
                          </button>
                        </form>
                        <UndoableRemove
                          remove={deleteIdea.bind(null, plan.id, idea.id)}
                          restore={restoreIdea.bind(null, plan.id)}
                          message={`„${idea.title}“ entfernt.`}
                        />
                      </div>
                    </details>
                  )}
                </DraggableIdea>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <nav className="week-nav" aria-label="Woche">
        <Link
          href={`/plans/${plan.id}?woche=${addDays(weekStart, -7)}`}
          aria-label="Vorherige Woche"
          className="button secondary icon-button"
        >
          ←
        </Link>
        <span>
          <strong>{formatWeek(weekStart)}</strong>
          {weekStart !== thisWeek && (
            <>
              {" "}
              · <Link href={`/plans/${plan.id}`}>Diese Woche</Link>
            </>
          )}
        </span>
        <Link
          href={`/plans/${plan.id}?woche=${addDays(weekStart, 7)}`}
          aria-label="Nächste Woche"
          className="button secondary icon-button"
        >
          →
        </Link>
      </nav>

      {editable && entries.some((e) => e.recipe_id) && (
        <form action={addWeekToShopping.bind(null, plan.id, weekStart)}>
          <button type="submit" className="secondary">
            Einkaufsliste für diese Woche
          </button>
        </form>
      )}

      {entries.length === 0 && editable && (
        <div className="card empty-state">
          <p style={{ marginTop: 0 }}>
            <strong>Diese Woche ist noch leer.</strong>
          </p>
          <p className="hint" style={{ marginBottom: 0 }}>
            Tippe auf <strong>+</strong> bei einer Mahlzeit, oder merke Rezepte auf der Rezeptseite mit „Merken für: Diese
            Woche“ vor und plane sie oben ein. Aus den geplanten Rezepten entsteht mit einem Tipp die Einkaufsliste.
          </p>
        </div>
      )}

      {editable && (
        <AddEntryDialog
          action={addEntry.bind(null, plan.id)}
          recipeGroups={[...byBook.entries()].map(([book, recipes]) => ({ book, recipes }))}
        />
      )}

      {editable && (
        <p className="hint drag-hint">
          Tipp: Rezepte, ganze Zellen und vorgemerkte Rezepte lassen sich mit der Maus auf einen anderen Tag oder eine
          andere Mahlzeit ziehen.
        </p>
      )}
      <WeekTable planId={plan.id} days={days} todayDate={todayDate} entries={entries} editable={editable} />
    </>
  );
}
