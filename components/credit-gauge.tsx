// Anneau discret de conso du forfait. Au survol : ce qu'il te reste sur le pool.
// Mesure la dépense de Socrates (total_cost_usd cumulé sur 7 jours), sur le
// forfait Claude Code Max (pool 100 $). Ce n'est pas le solde exact côté Anthropic
// (non lisible par un programme), mais la conso réelle de Socrates dessus.
export function CreditGauge({ spend, pool = 100 }: { spend: number; pool?: number }) {
  const remaining = Math.max(0, pool - spend);
  const consumedPct = Math.min(100, (spend / pool) * 100);
  const low = remaining < pool * 0.15;
  const stroke = low ? "var(--destructive)" : "var(--info)";

  return (
    <div className="group relative inline-flex w-fit items-center">
      <svg width="22" height="22" viewBox="0 0 36 36" className="-rotate-90">
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          stroke="var(--secondary)"
          strokeWidth="4"
        />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${consumedPct} 100`}
        />
      </svg>

      {/* Tooltip au survol (pas de tooltip natif) */}
      <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 hidden w-max max-w-[16rem] rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-xl group-hover:block">
        <p className="text-sm">
          Il te reste{" "}
          <span className="font-mono tabular-nums text-foreground">
            {remaining.toFixed(2)} $
          </span>{" "}
          <span className="text-muted-foreground">/ {pool} $</span>
        </p>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          Forfait Claude Code Max. Conso de Socrates cette semaine :{" "}
          {spend.toFixed(2)} $.
        </p>
      </div>
    </div>
  );
}
