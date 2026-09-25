"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { actionIngest, type IngestResult } from "@/app/actions";

export default function AjouterPage() {
  const [result, formAction, pending] = useActionState<
    IngestResult | null,
    FormData
  >(actionIngest, null);

  return (
    <div className="px-6 py-10 md:px-12 lg:px-16">
      <header className="border-b border-border pb-8">
        <h1 className="text-balance font-serif text-6xl tracking-tight lg:text-7xl">
          Ajouter
        </h1>
        <p className="mt-3 max-w-3xl text-[15px] text-muted-foreground">
          Un lien YouTube ou d&apos;article (lu automatiquement), le texte d&apos;un
          thread X, une conversation ChatGPT, des notes : tout est lu, résumé et
          rangé dans le bon sujet. Pour X, colle le texte (les liens X sont
          bloqués à la lecture).
        </p>
      </header>

      <form action={formAction} className="max-w-4xl py-8">
        <Textarea
          name="contenu"
          required
          placeholder={
            "Un lien YouTube ou d'article…\nou colle le texte d'un thread X, d'une conv ChatGPT, des notes…"
          }
          className="min-h-40 font-serif text-lg leading-relaxed"
        />
        <div className="mt-4 flex items-center gap-4">
          <Button type="submit" disabled={pending}>
            {pending ? "Rangement en cours…" : "Ranger"}
          </Button>
        </div>
      </form>

      {result && !result.ok && (
        <p className="border-t border-border py-6 text-[15px] text-destructive">
          {result.error}
        </p>
      )}

      {result && result.ok && (
        <section className="border-t border-border py-8">
          <div className="flex flex-wrap items-start gap-5">
            {result.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.thumbnail}
                alt={result.titre}
                className="w-48 shrink-0 rounded-sm border border-border"
              />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-balance font-serif text-2xl">
                {result.titre}
              </h2>
              <p className="mt-2 max-w-3xl text-[15px] text-muted-foreground">
                {result.resume}
              </p>
              <p className="mt-4 font-mono text-sm text-muted-foreground">
                {result.items.length} éléments ajoutés
              </p>
            </div>
          </div>
          <div className="mt-2">
            {result.items.map((item, i) => (
              <div
                key={i}
                className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 border-b border-border py-4"
              >
                <p className="min-w-0 max-w-3xl font-serif text-lg leading-relaxed">
                  {item.texte}
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.dossier}
                  <span
                    className={`ml-3 uppercase tracking-wide ${
                      item.type === "fait"
                        ? "text-info"
                        : item.type === "argument"
                          ? "text-ok"
                          : item.type === "contre"
                            ? "text-destructive"
                            : ""
                    }`}
                  >
                    {item.type}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
