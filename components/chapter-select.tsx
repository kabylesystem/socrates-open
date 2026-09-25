"use client";

import { Select } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";

type Chapter = { num: string; titre: string };

function label(c: Chapter): string {
  return /^\d+$/.test(c.num) ? `Ch. ${c.num} — ${c.titre}` : `${c.num} — ${c.titre}`;
}

// Sélecteur de chapitre stylé (remplace le <select> natif). Soumet la valeur
// dans le champ `chapitre` du formulaire via la prop `name` de Radix.
export function ChapterSelect({
  chapters,
  defaultValue,
}: {
  chapters: Chapter[];
  defaultValue?: string;
}) {
  const initial =
    defaultValue && chapters.some((c) => c.num === defaultValue)
      ? defaultValue
      : chapters[0]?.num;

  return (
    <Select.Root name="chapitre" defaultValue={initial}>
      <Select.Trigger className="inline-flex h-8 max-w-[20rem] items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors hover:border-ring focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30">
        <Select.Value placeholder="Chapitre" />
        <Select.Icon className="ml-auto text-muted-foreground">
          <ChevronDown className="size-4" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-[20rem] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
        >
          <Select.Viewport className="p-1">
            {chapters.map((c) => (
              <Select.Item
                key={c.num}
                value={c.num}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[state=checked]:text-primary"
              >
                <Select.ItemIndicator>
                  <Check className="size-3.5" />
                </Select.ItemIndicator>
                <Select.ItemText>{label(c)}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
