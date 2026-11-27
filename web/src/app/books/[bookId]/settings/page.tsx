import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { notFound } from "next/navigation";
import { getBookForUser } from "@/lib/books";
import { ROLE_LABELS, type BookRole } from "@/lib/recipe";
import { createClient } from "@/lib/supabase/server";
import {
  changeMemberRole,
  deleteBook,
  leaveBook,
  removeMember,
  renameBook,
  shareBook,
  withdrawInvite,
} from "../../actions";

export const metadata: Metadata = { title: "Teilen & Einstellungen" };

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

  return (
    <div className="narrow">
      <p className="small">
        <Link href={`/books/${book.id}`}>← {book.name}</Link>
      </p>
      <h1>{isOwner ? "Teilen & Einstellungen" : "Mitglieder"}</h1>
      {ok && <p className="notice success">{ok}</p>}
      {error && <p className="notice error">{error}</p>}

      {isOwner && (
        <section>
          <h2>Teilen</h2>
          <form action={shareBook.bind(null, book.id)} className="stack">
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
              Hat die Person noch kein Konto, bekommt sie eine Einladung per E-Mail und sieht das Buch nach der ersten
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
                      <form action={removeMember.bind(null, book.id, m.user_id)}>
                        <button type="submit" className="danger btn-small">
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
                  <form action={withdrawInvite.bind(null, book.id, i.id)}>
                    <button type="submit" className="danger btn-small">
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
          <form action={renameBook.bind(null, book.id)} className="row">
            <input type="text" name="name" defaultValue={book.name} required maxLength={100} style={{ flex: "1 1 14rem" }} />
            <button type="submit" className="secondary">
              Speichern
            </button>
          </form>

          <h2>Buch löschen</h2>
          <form action={deleteBook.bind(null, book.id)} className="stack">
            <p className="small muted">
              Löscht das Buch mit allen Rezepten für alle Mitglieder. Das kann nicht rückgängig gemacht werden. Tippe zur
              Bestätigung den Namen des Buchs ein.
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
