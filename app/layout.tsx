import type { Metadata } from "next";
import { Inter, JetBrains_Mono, EB_Garamond } from "next/font/google";
import {
  countDueDossierCards,
  groupByCategorie,
  listContradictions,
  listDossiers,
  weekSpendUsd,
} from "@/lib/db";
import { Sidebar } from "@/components/sidebar";
import { StudyTimer } from "@/components/study-timer";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const ebGaramond = EB_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Socrates",
  description:
    "Un OS de pensée politique et intellectuelle. Construire une vision du monde cohérente.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const dossiers = listDossiers();
  const contradictions = listContradictions();
  // Les flashcards ne viennent QUE des leçons entamées et des ressources ingérées
  // (liens vus). Plus de cartes « chiffres » auto depuis les faits.
  const dues = countDueDossierCards();
  const weekSpend = weekSpendUsd();

  return (
    <html
      lang="fr"
      className={`${inter.variable} ${ebGaramond.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full" suppressHydrationWarning>
        <div className="flex min-h-screen w-full">
          <Sidebar
            groups={groupByCategorie(dossiers).map(([c, items]) => [
              c,
              items.map((d) => ({
                slug: d.slug,
                nom: d.nom,
                position: d.position,
                confiance: d.confiance,
              })),
            ])}
            dues={dues}
            contradictions={contradictions.length}
            weekSpend={weekSpend}
          />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
        <StudyTimer />
      </body>
    </html>
  );
}
