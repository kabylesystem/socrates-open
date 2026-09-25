"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

// Champ catégorie : saisie libre + suggestions stylées (remplace le <datalist>
// natif, qui affichait un menu déroulant « Windows XP » du navigateur).
export function CategoryCombo({ categories }: { categories: string[] }) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const v = value.trim().toLowerCase();
  const matches = (
    v ? categories.filter((c) => c.toLowerCase().includes(v)) : categories
  ).filter((c) => c.toLowerCase() !== v);

  return (
    <div className="relative w-56">
      <Input
        name="categorie"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder="Catégorie (sinon l'IA range)"
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
          {matches.map((c) => (
            <button
              key={c}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setValue(c);
                setOpen(false);
              }}
              className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
