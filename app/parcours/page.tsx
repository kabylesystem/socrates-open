import Link from "next/link";
import { slugify } from "@/lib/db";

// Le parcours conseillé pour « comprendre le monde » : socle d'abord (les lunettes),
// puis entrelacement. Page de consultation, pas de logique. Chaque sujet est cliquable.
const TIERS: { titre: string; pourquoi: string; sujets: string[] }[] = [
  {
    titre: "Socle · les lunettes",
    pourquoi:
      "À faire à peu près dans l'ordre, c'est le plus rentable : ça installe les axes qui décodent tout désaccord (liberté contre égalité, individu contre collectif). Après, tu ne vois plus un débat comme une bagarre d'opinions mais comme un point sur une carte.",
    sujets: [
      "Philosophie politique",
      "Idéologies",
      "Histoire",
      "Sciences",
      "Psychologie",
      "Capitalisme",
      "Démocratie",
      "Droit",
      "Religions du monde",
    ],
  },
  {
    titre: "1 · L'économie, grammaire du réel",
    pourquoi:
      "Presque rien dans le monde moderne n'est lisible sans comprendre ce qu'est l'argent et comment circule la richesse. Le réflexe « avec quel argent ? » que ça donne sert partout.",
    sujets: [
      "Monnaie",
      "Inflation",
      "Finance",
      "Croissance",
      "Mondialisation",
      "Inégalités",
      "Dette",
      "Fiscalité",
      "Protection sociale",
    ],
  },
  {
    titre: "2 · Les contraintes dures",
    pourquoi:
      "Population et planète sont les murs porteurs. La démographie explique à elle seule retraites, immigration et croissance ; le climat recadre tout le reste.",
    sujets: ["Démographie", "Climat", "Énergie", "Ressources", "Biodiversité", "Pollution"],
  },
  {
    titre: "3 · Les clivages du quotidien",
    pourquoi:
      "Là où la société se déchire concrètement, et ce qui touche les gens directement. Le bloc culturel (immigration, laïcité, identité, wokisme) se fait groupé : les quatre se répondent.",
    sujets: [
      "Immigration",
      "Laïcité",
      "Identité",
      "Wokisme",
      "Religion",
      "Nationalisme",
      "Travail",
      "Retraites",
      "Santé",
      "École",
      "Sécurité",
      "Logement",
      "Justice",
      "Genre",
      "Famille",
      "Territoires",
      "Drogues",
      "Culture",
      "Corruption",
    ],
  },
  {
    titre: "4 · Produire et tenir debout",
    pourquoi:
      "La souveraineté, à faire dans cet ordre : c'est une chaîne logique (l'énergie alimente l'industrie, l'industrie a besoin des puces).",
    sujets: ["Industrie", "Semi-conducteurs", "Agriculture", "Numérique", "IA", "Biotechnologies"],
  },
  {
    titre: "5 · Le monde, du proche au lointain",
    pourquoi:
      "Les rapports de force, du cadre national aux puissances. Venezuela et Haïti en études de cas (effondrement d'État), Kabylie quand tu veux (ton terrain, motivation max).",
    sujets: [
      "Institutions",
      "Europe",
      "États-Unis",
      "Chine",
      "Russie",
      "Moyen-Orient",
      "Inde",
      "Afrique du Nord",
      "Afrique subsaharienne",
      "Amérique latine",
      "Défense",
      "Géopolitique",
      "Institutions internationales",
      "Venezuela",
      "Haïti",
      "Kabylie",
    ],
  },
  {
    titre: "6 · Le futur proche",
    pourquoi: "Ce qui redessine la société et la puissance sous nos yeux.",
    sujets: ["Réseaux sociaux", "Espace", "Médias"],
  },
];

export default function ParcoursPage() {
  return (
    <div className="px-6 py-10 md:px-12 lg:px-16">
      <header className="border-b border-border pb-8">
        <h1 className="text-balance font-serif text-6xl tracking-tight lg:text-7xl">
          Parcours conseillé
        </h1>
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
          Pas une prépa de campagne : une prépa pour comprendre le monde. La logique
          tient en deux temps. D&apos;abord le <strong className="text-foreground">socle</strong> (les
          lunettes conceptuelles), à peu près dans l&apos;ordre, parce qu&apos;il rend
          tout le reste lisible. Ensuite, <strong className="text-foreground">entrelace</strong> :
          2-3 sujets en parallèle maximum, en mélangeant les domaines plutôt qu&apos;en
          finissant un étage avant le suivant. Mélanger muscle la mémoire (l&apos;effort
          de « recharger » chaque contexte) et fait surgir les ponts entre sujets, ce qui
          est très exactement « comprendre le monde ». Alterne un gros morceau (énergie,
          libéralisme) et un sujet concret et rapide (Haïti, Venezuela) pour souffler.
        </p>
      </header>

      <div className="divide-y divide-border">
        {TIERS.map((tier) => (
          <section key={tier.titre} className="py-8">
            <h2 className="font-serif text-2xl tracking-tight">{tier.titre}</h2>
            <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
              {tier.pourquoi}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {tier.sujets.map((nom, i) => (
                <Link
                  key={nom}
                  href={`/d/${slugify(nom)}`}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <span className="font-mono text-[11px] text-muted-foreground/60">
                    {i + 1}
                  </span>
                  {nom}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="border-t border-border py-8 text-[15px] leading-relaxed text-muted-foreground">
        Cadence concrète : le socle en linéaire (4 sujets), puis un cycle entrelacé. 1 sujet
        lourd en fil principal + 1 sujet léger en parallèle + Réviser tous les jours (qui
        mixe déjà tout). Quand tu boucles un lourd, prends le suivant dans le domaine que tu
        as le plus négligé, pour tirer la couverture en largeur au lieu de creuser toujours
        le même coin.
      </p>
    </div>
  );
}
