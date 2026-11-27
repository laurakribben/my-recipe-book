import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canEdit, getBookForUser } from "@/lib/books";
import { createRecipe, extractAction } from "@/app/recipes/actions";
import { NewRecipe } from "./new-recipe";

export const metadata: Metadata = { title: "Rezept hinzufügen" };

// The AI extraction can take a while for long pages or several photos.
export const maxDuration = 60;

const START_MODES = { link: "link", text: "text", fotos: "images", hand: "manual" } as const;

export default async function NewRecipePage(props: {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ quelle?: string }>;
}) {
  const { bookId } = await props.params;
  const { quelle } = await props.searchParams;
  const access = await getBookForUser(bookId);
  if (!access || !canEdit(access.role)) notFound();

  return (
    <>
      <p className="small">
        <Link href={`/books/${bookId}`}>← {access.book.name}</Link>
      </p>
      <h1>Rezept hinzufügen</h1>
      <NewRecipe
        extract={extractAction.bind(null, bookId)}
        save={createRecipe.bind(null, bookId)}
        startMode={START_MODES[quelle as keyof typeof START_MODES] ?? "link"}
      />
    </>
  );
}
