import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlanForUser } from "@/lib/plans";
import { ROLE_LABELS, type BookRole } from "@/lib/recipe";
import { createClient } from "@/lib/supabase/server";
import {
  changePlanMemberRole,
  leavePlan,
  removePlanMember,
  renamePlan,
  sharePlan,
  withdrawPlanInvite,
} from "../../actions";

export const metadata: Metadata = { title: "Teilen & Einstellungen" };

type Props = { params: Promise<{ planId: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

export default async function PlanSettingsPage(props: Props) {
  const { planId } = await props.params;
  const { ok, error } = await props.searchParams;
  const access = await getPlanForUser(planId);
  if (!access) notFound();
  const { plan, role, user } = access;
  const isOwner = role === "owner";

  const supabase = await createClient();
  const { data: members } = await supabase
    .from("meal_plan_members")
    .select("user_id, role, profiles (email, display_name)")
    .eq("plan_id", plan.id)
    .order("created_at", { ascending: true });
  const { data: invites } = isOwner
    ? await supabase.from("meal_plan_invites").select("id, email, role").eq("plan_id", plan.id).order("created_at")
    : { data: [] };

  return (
    <>
      <p className="small">
        <Link href={`/plans/${plan.id}`}>← {plan.name}</Link>
      </p>
      <h1>{isOwner ? "Teilen & Einstellungen" : "Mitglieder"}</h1>
      {ok && <p className="notice success">{ok}</p>}
      {error && <p className="notice error">{error}</p>}

      {isOwner && (
        <section>
          <h2>Teilen</h2>
          <form action={sharePlan.bind(null, plan.id)} className="stack">
            <label>
              <span>E-Mail-Adresse</span>
              <input type="email" name="email" required />
            </label>
            <div className="row">
              <select name="role" defaultValue="viewer" style={{ width: "auto" }}>
                <option value="viewer">{ROLE_LABELS.viewer}</option>
                <option value="editor">{ROLE_LABELS.editor}</option>
              </select>
              <button type="submit">Teilen</button>
            </div>
            <p className="hint">
              Mitglieder sehen alle Wochen und die Einkaufsliste. „Kann lesen“ darf auf der Einkaufsliste nur abhaken.
              Hat die Person noch kein Konto, bekommt sie eine Einladung per E-Mail und sieht den Plan nach der ersten
              Anmeldung.
            </p>
          </form>
        </section>
      )}

      <h2>Mitglieder</h2>
      <div className="table-wrap">
        <table>
          <tbody>
            {(members ?? []).map((m) => {
              const profile = m.profiles as unknown as { email: string; display_name: string | null } | null;
              const memberRole = m.role as BookRole;
              const editable = isOwner && memberRole !== "owner";
              return (
                <tr key={m.user_id}>
                  <td style={{ wordBreak: "break-all" }}>
                    {profile?.display_name || profile?.email}
                    {m.user_id === user.id && <span className="muted"> (du)</span>}
                  </td>
                  <td>
                    {editable ? (
                      <form action={changePlanMemberRole.bind(null, plan.id, m.user_id)} className="row">
                        <select name="role" defaultValue={memberRole} style={{ width: "auto" }}>
                          <option value="viewer">{ROLE_LABELS.viewer}</option>
                          <option value="editor">{ROLE_LABELS.editor}</option>
                        </select>
                        <button type="submit" className="link-button">
                          Ändern
                        </button>
                      </form>
                    ) : (
                      ROLE_LABELS[memberRole]
                    )}
                  </td>
                  <td>
                    {editable && (
                      <form action={removePlanMember.bind(null, plan.id, m.user_id)}>
                        <button type="submit" className="link-button">
                          Entfernen
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {(invites ?? []).map((i) => (
              <tr key={i.id}>
                <td style={{ wordBreak: "break-all" }}>
                  {i.email} <span className="badge">eingeladen</span>
                </td>
                <td>{ROLE_LABELS[i.role as BookRole]}</td>
                <td>
                  <form action={withdrawPlanInvite.bind(null, plan.id, i.id)}>
                    <button type="submit" className="link-button">
                      Zurückziehen
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isOwner ? (
        <>
          <h2>Name</h2>
          <form action={renamePlan.bind(null, plan.id)} className="row">
            <input type="text" name="name" defaultValue={plan.name} required maxLength={100} style={{ flex: "1 1 14rem" }} />
            <button type="submit" className="secondary">
              Speichern
            </button>
          </form>

        </>
      ) : (
        <form action={leavePlan.bind(null, plan.id)} style={{ marginTop: "2rem" }}>
          <button type="submit" className="danger">
            Plan verlassen
          </button>
        </form>
      )}
    </>
  );
}
