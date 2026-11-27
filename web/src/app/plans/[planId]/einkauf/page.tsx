import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canEdit } from "@/lib/books";
import { getPlanForUser, type ShoppingItem } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import {
  addShoppingItems,
  clearShoppingItems,
  deleteShoppingItem,
  restoreShoppingItem,
  setItemChecked,
} from "../../actions";
import { ConfirmButton } from "@/components/confirm-button";
import { ShoppingList } from "./shopping-list";

export const metadata: Metadata = { title: "Einkaufsliste" };

type Props = { params: Promise<{ planId: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

export default async function ShoppingPage(props: Props) {
  const { planId } = await props.params;
  const { ok, error } = await props.searchParams;
  const access = await getPlanForUser(planId);
  if (!access) notFound();
  const { plan, role } = access;
  const editable = canEdit(role);

  const supabase = await createClient();
  const { data } = await supabase
    .from("shopping_items")
    .select("id, text, checked, entry_id, source, aisle, created_at")
    .eq("plan_id", plan.id)
    .order("created_at");
  const items = (data ?? []) as ShoppingItem[];

  return (
    <div className="narrow">
      <p className="small">
        <Link href={`/plans/${plan.id}`}>← {plan.name}</Link>
      </p>
      <h1>Einkaufsliste</h1>
      {ok && <p className="notice success">{ok}</p>}
      {error && <p className="notice error">{error}</p>}

      <ShoppingList
        items={items}
        editable={editable}
        setChecked={setItemChecked.bind(null, plan.id)}
        remove={deleteShoppingItem.bind(null, plan.id)}
        restore={restoreShoppingItem.bind(null, plan.id)}
      />

      {editable && (
        <>
          <h2>Hinzufügen</h2>
          <form action={addShoppingItems.bind(null, plan.id)} className="stack">
            <textarea name="text" rows={3} placeholder={"z. B. Klopapier\nKaffee"} style={{ minHeight: "5rem" }} />
            <span className="hint">Ein Eintrag pro Zeile.</span>
            <button type="submit" className="secondary">
              Hinzufügen
            </button>
          </form>

          {items.length > 0 && (
            <div className="row" style={{ marginTop: "2rem" }}>
              <form action={clearShoppingItems.bind(null, plan.id, true)}>
                <button type="submit" className="secondary">
                  Erledigte entfernen
                </button>
              </form>
              <form action={clearShoppingItems.bind(null, plan.id, false)}>
                <ConfirmButton label="Ganze Liste leeren" question="Alle Einträge entfernen?" confirmLabel="Ja, leeren" />
              </form>
            </div>
          )}
        </>
      )}
      <p className="hint" style={{ marginTop: "1.5rem" }}>
        Rezepte kommen über „Einkaufsliste für diese Woche“ im Wochenplan auf die Liste. Die Liste ist mit allen
        Mitgliedern des Plans geteilt.
      </p>
    </div>
  );
}
