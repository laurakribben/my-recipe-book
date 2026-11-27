import { redirect } from "next/navigation";
import { createPlan, getMyPlans, isIsoDate } from "@/lib/plans";
import { getUser } from "@/lib/supabase/server";

/** Opens the user's own plan (creating it on the first visit), optionally at a given week. */
export default async function PlansPage(props: { searchParams: Promise<{ woche?: string }> }) {
  const { woche } = await props.searchParams;
  const user = await getUser();
  if (!user) redirect("/login");
  const plans = await getMyPlans(user.id);
  const own = plans.find((p) => p.role === "owner") ?? plans[0];
  const planId = own ? own.id : await createPlan(user.id, "Mein Wochenplan");
  redirect(`/plans/${planId}${isIsoDate(woche) ? `?woche=${woche}#tag-${woche}` : ""}`);
}
