import Link from "next/link";
import { listReadingBooks, type Book } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { actionCreateBook } from "@/app/actions";

const STATUTS: { key: Book["statut"]; label: string }[] = [
  { key: "reading", label: "En cours" },
  { key: "not_started", label: "À lire" },
  { key: "finished", label: "Lus" },
  { key: "abandoned", label: "Abandonnés" },
];

function Cover({ book }: { book: Book }) {
  return book.cover_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={book.cover_url}
      alt={book.titre}
      className="h-36 w-24 shrink-0 rounded-sm border border-border object-cover"
    />
  ) : (
    <div className="flex h-36 w-24 shrink-0 items-center justify-center rounded-sm border border-border bg-secondary p-2 text-center font-serif text-xs text-muted-foreground">
      {book.titre}
    </div>
  );
}

export default function ReadingSpace() {
  const books = listReadingBooks();

  return (
    <div className="px-6 py-10 md:px-12 lg:px-16">
      <header className="border-b border-border pb-8">
        <h1 className="text-balance font-serif text-6xl tracking-tight lg:text-7xl">
          Lire
        </h1>
      </header>

      <form
        action={actionCreateBook}
        className="flex flex-wrap items-center gap-3 py-8"
      >
        <Input name="titre" placeholder="Titre" className="max-w-xs" required />
        <Input
          name="auteur"
          placeholder="Auteur"
          className="max-w-xs"
          required
        />
        <SubmitButton pendingLabel="Ajout…">Commencer un livre</SubmitButton>
      </form>

      {books.length === 0 ? (
        <p className="text-[15px] text-muted-foreground">
          Aucun livre encore. Ajoute-en un — protocole minimal : pourquoi tu le
          lis, capture les idées fortes, synthèse finale, rappels.
        </p>
      ) : (
        STATUTS.map(({ key, label }) => {
          const list = books.filter((b) => b.statut === key);
          if (!list.length) return null;
          return (
            <section key={key} className="border-b border-border py-8">
              <h2 className="font-serif text-2xl">{label}</h2>
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-8">
                {list.map((b) => (
                  <Link
                    key={b.id}
                    href={`/lire/${b.id}`}
                    className="group flex w-56 gap-4"
                  >
                    <Cover book={b} />
                    <div className="min-w-0">
                      <p className="font-serif text-lg leading-snug transition-colors group-hover:text-primary">
                        {b.titre}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {b.auteur}
                      </p>
                      {b.statut === "finished" && b.conf_apres != null && (
                        <p className="mt-2 font-mono text-xs text-info">
                          confiance {b.conf_apres}%
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })
      )}

      <div className="pt-8">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">← Dossiers</Link>
        </Button>
      </div>
    </div>
  );
}
