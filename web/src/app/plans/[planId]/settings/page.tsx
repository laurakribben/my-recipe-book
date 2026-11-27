import type { Metadata } from "next";
import Link from "next/link";
import { TrashIcon } from "@/components/icons";
import { ConfirmButton } from "@/components/confirm-button";
import { notFound } from "next/navigation";
import { getPlanForUser, WEEKDAY_NAMES } from "@/lib/plans";
import { getProfile } from "@/lib/profile";
import { ROLE_LABELS, type BookRole } from "@/lib/recipe";
import { createClient } from "@/lib/supabase/server";
import {
  changePlanMemberRole,
  leavePlan,
  removePlanMember,
  renamePlan,
  setNutritionBalance,
  setWeekStart,
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
  const showBalance = (await getProfile())?.showNutritionBalance ?? true;

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
    <div className="narrow">
      <p className="small">
        <Link href={`/plans/${plan.id}`}>← {plan.name}</Link>
      </p>
      <h1>{isOwner ? "Teilen & Einstellungen" : "Mitglieder"}</h1>
      {ok && <p className="notice success">{ok}</p>}
      {error && <p className="notice error">{error}</p>}

      <h2 id="teilen">Mitglieder</h2>
      {/* The invite fields sit in the last table row; a <form> can't wrap a row, so they use form="invite". */}
      {isOwner && <form id="invite" action={sharePlan.bind(null, plan.id)} />}
      <div className="table-wrap">
        <table className="members-table">
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
                        <button type="submit" className="secondary btn-small">
                          Ändern
                        </button>
                      </form>
                    ) : (
                      ROLE_LABELS[memberRole]
                    )}
                  </td>
                  <td>
                    {editable && (
                      <form action={removePlanMember.bind(null, plan.id, m.user_id)} className="member-actions">
                        <button
                          type="submit"
                          className="danger icon-button"
                          aria-label="Mitglied entfernen"
                          title="Mitglied entfernen"
                        >
                          <TrashIcon />
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
                  <form action={withdrawPlanInvite.bind(null, plan.id, i.id)} className="member-actions">
                    <button
                      type="submit"
                      className="danger icon-button"
                      aria-label="Einladung zurückziehen"
                      title="Einladung zurückziehen"
                    >
                      <TrashIcon />
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {isOwner && (
              <tr className="invite-row">
                <td>
                  <input
                    type="email"
                    name="email"
                    form="invite"
                    required
                    placeholder="E-Mail-Adresse"
                    aria-label="E-Mail-Adresse der neuen Person"
                  />
                </td>
                <td>
                  <select name="role" form="invite" defaultValue="viewer" aria-label="Rolle">
                    <option value="viewer">{ROLE_LABELS.viewer}</option>
                    <option value="editor">{ROLE_LABELS.editor}</option>
                  </select>
                </td>
                <td>
                  <button type="submit" form="invite" className="btn-small">
                    Einladen
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {isOwner && (
        <p className="hint">
          Mitglieder sehen alle Wochen und die Einkaufsliste. „Kann lesen“ darf auf der Einkaufsliste nur abhaken. Hat
          die Person noch kein Konto, bekommt sie eine Einladung per E-Mail und sieht den Plan nach der ersten
          Anmeldung.
        </p>
      )}

      <h2 id="anzeige">Anzeige</h2>
      <form action={setNutritionBalance.bind(null, plan.id)} className="stack">
        <label className="row">
          <input type="checkbox" name="show_nutrition_balance" defaultChecked={showBalance} />
          Nährwert-Bilanz anzeigen (Verhältnis von Kohlenhydraten, Fett, Eiweiß und Zucker pro Tag und Woche)
        </label>
        <p className="hint">Gilt nur für dich – andere Mitglieder entscheiden selbst.</p>
        <div>
          <button type="submit" className="secondary">
            Speichern
          </button>
        </div>
      </form>

      {isOwner ? (
        <>
          <h2 id="einstellungen">Wochenbeginn</h2>
          <form action={setWeekStart.bind(null, plan.id)} className="row">
            <select name="week_start" defaultValue={plan.week_start} style={{ width: "auto" }}>
              {WEEKDAY_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
            <button type="submit" className="secondary">
              Speichern
            </button>
          </form>
          <p className="hint">Gilt für alle Mitglieder dieses Plans.</p>

          <h2>Name</h2>
          <form action={renamePlan.bind(null, plan.id)} className="row">
            <input
              type="text"
              name="name"
              defaultValue={plan.name}
              required
              maxLength={100}
              style={{ flex: "1 1 14rem" }}
            />
            <button type="submit" className="secondary">
              Speichern
            </button>
          </form>
        </>
      ) : (
        <form action={leavePlan.bind(null, plan.id)} style={{ marginTop: "2rem" }}>
          <ConfirmButton label="Plan verlassen" question="Plan wirklich verlassen?" confirmLabel="Ja, verlassen" />
        </form>
      )}
    </div>
  );
}
