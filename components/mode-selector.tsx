"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Mode = { value: string; label: string };

const GROUPS: { titre: string; modes: string[] }[] = [
  { titre: "Apprendre", modes: ["cours"] },
  { titre: "Affronter", modes: ["destroy", "devil", "steelman"] },
  {
    titre: "Face à un courant",
    modes: [
      "socialiste",
      "conservateur",
      "libertarien",
      "marxiste",
      "technocrate",
      "federaliste",
    ],
  },
];

export function ModeSelector({
  slug,
  current,
  modes,
}: {
  slug: string;
  current: string;
  currentLabel?: string;
  modes: Mode[];
}) {
  const router = useRouter();
  const label = (v: string) => modes.find((m) => m.value === v)?.label ?? v;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          Changer d&apos;interlocuteur ▾
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {GROUPS.map((g, gi) => (
          <div key={g.titre}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
              {g.titre}
            </DropdownMenuLabel>
            {g.modes.map((v) => (
              <DropdownMenuItem
                key={v}
                onSelect={() => router.push(`/d/${slug}/debat?mode=${v}`)}
                className={v === current ? "text-primary" : ""}
              >
                {label(v)}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
