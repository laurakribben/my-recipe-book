import type { Metadata } from "next";
import Link from "next/link";
import { TrashIcon } from "@/components/icons";
import { ConfirmButton } from "@/components/confirm-button";
import { notFound } from "next/navigation";
import { canEdit, getBookForUser } from "@/lib/books";
import { ROLE_LABELS, type BookRole, type Recipe } from "@/lib/recipe";
import { COMPLETERS } from "@/lib/recipe-completion";
import { createClient } from "@/lib/supabase/server";
import { BulkCompletion } from "./bulk-completion";
import {
  changeMemberRole,
  completeBookBatch,
  deleteBook,
  leaveBook,
  removeMember,
  renameBook,
  shareBook,
  withdrawInvite,
} from "../../actions";

export const metadata: Metadata = { title: "Teilen & Einstellungen" };
// Each batch of "Fehlendes ergänzen" fetches pages and calls the AI for several recipes.
export const maxDuration = 60;

type Props = { params: Promise<{ bookId: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

export default async function BookSettingsPage(props: Props) {
  const { bookId } = await props.params;
  const { ok, error } = await props.searchParams;
  const access = await getBookForUser(bookId);
  if (!access) notFound();
  const { book, role, user } = access;
  const isOwner = role === "owner";

  const supabase = await createClient();
  const { data: members } = await supabase
    .from("book_members")
    .select("user_id, role, profiles (email, display_name)")
    .eq("book_id", book.id)
    .order("created_at", { ascending: true });
  const { data: invites } = isOwner
    ? await supabase.from("book_invites").select("id, email, role").eq("book_id", book.id).order("created_at")
    : { data: [] };

  // What the recipes are missing, for "Fehlendes in allen Rezepten ergänzen".
  let completion: { counts: { label: string; missing: number; runnable: number }[]; todo: number } | null = null;
  if (canEdit(role)) {
    const { data } = await supabase.from("recipes").select("*").eq("book_id", book.id);
    const recipes = (data ?? []) as Recipe[];
    completion = {
      counts: COMPLETERS.map((c) => {
        const missing = recipes.filter((r) => c.isMissing(r));
        return { label: c.label, missing: missing.length, runnable: missing.filter((r) => !c.blockedReason(r)).length };
      }),
      todo: recipes.filter((r) => COMPLETERS.some((c) => c.isMissing(r) && !c.blockedReason(r))).length,
    };
  }

  return (
    <div className="narrow">
      <p className="small">
        <Link href={`/books/${book.id}`}>← {book.name}</Link>
      </p>
      <h1>{isOwner ? "Teilen & Einstellungen" : "Mitglieder"}</h1>
      {ok && <p className="notice success">{ok}</p>}
      {error && <p className="notice error">{error}</p>}

      <h2 id="teilen">Mitglieder</h2>
      {/* The invite fields sit in the last table row; a <form> can't wrap a row, so they use form="invite". */}
      {isOwner && <form id="invite" action={shareBook.bind(null, book.id)} />}
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
                      <form action={changeMemberRole.bind(null, book.id, m.user_id)} className="row">
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
                      <form action={removeMember.bind(null, book.id, m.user_id)} className="member-actions">
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
                  <form action={withdrawInvite.bind(null, book.id, i.id)} className="member-actions">
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
          Hat die Person noch kein Konto, bekommt sie eine Einladung per E-Mail und sieht das Buch nach der ersten
          Anmeldung.
        </p>
      )}

      <div id="einstellungen" />
      {completion && (
        <BulkCompletion counts={completion.counts} todo={completion.todo} run={completeBookBatch.bind(null, book.id)} />
      )}

      {isOwner ? (
        <>
          <h2>Name</h2>
          <form action={renameBook.bind(null, book.id)} className="row">
            <input
              type="text"
              name="name"
              defaultValue={book.name}
              required
              maxLength={100}
              style={{ flex: "1 1 14rem" }}
            />
            <button type="submit" className="secondary">
              Speichern
            </button>
          </form>

          <h2>Buch löschen</h2>
          <form action={deleteBook.bind(null, book.id)} className="stack">
            <p className="small muted">
              Löscht das Buch mit allen Rezepten für alle Mitglieder. Das kann nicht rückgängig gemacht werden. Tippe
              zur Bestätigung den Namen des Buchs ein.
            </p>
            <div className="row">
              <input type="text" name="confirm" required placeholder={book.name} style={{ flex: "1 1 14rem" }} />
              <button type="submit" className="danger">
                Endgültig löschen
              </button>
            </div>
          </form>
        </>
      ) : (
        <form action={leaveBook.bind(null, book.id)} style={{ marginTop: "2rem" }}>
          <ConfirmButton label="Buch verlassen" question="Buch wirklich verlassen?" confirmLabel="Ja, verlassen" />
        </form>
      )}
    </div>
  );
}
