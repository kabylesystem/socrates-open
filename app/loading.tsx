// Écran de chargement instantané : toute navigation (Réviser, un sujet, Lire…)
// affiche tout de suite ce repère au lieu d'une page figée et vide.
export default function Loading() {
  return (
    <div className="flex min-h-[70vh] flex-1 items-center justify-center">
      <p className="flex items-center gap-3 font-serif text-2xl text-muted-foreground">
        <span className="inline-block size-2.5 animate-pulse rounded-full bg-info" />
        Socrates…
      </p>
    </div>
  );
}
