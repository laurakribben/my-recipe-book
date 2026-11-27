import { redirect } from "next/navigation";
import { createPlan, getMyPlans } from "@/lib/plans";
import { getUser } from "@/lib/supabase/server";

/** "Einkauf" tab: the shopping list of the user's own plan. */
export default async function ShoppingShortcut() {
  const user = await getUser();
  if (!user) redirect("/login");
  const plans = await getMyPlans(user.id);
  const own = plans.find((p) => p.role === "owner") ?? plans[0];
  redirect(`/plans/${own ? own.id : await createPlan(user.id, "Mein Wochenplan")}/einkauf`);
}
