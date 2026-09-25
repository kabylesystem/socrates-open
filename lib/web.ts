// Lit le contenu textuel d'une page (tweet/thread X, article…) à partir de son
// URL, via le lecteur gratuit r.jina.ai (rend n'importe quelle page en texte
// propre pour un LLM). Renvoie null si la lecture échoue (X bloque parfois).
export async function fetchUrlContent(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { "X-Return-Format": "text" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    // Trop court = page vide / bloquée. On plafonne pour ne pas exploser le prompt.
    return text.length > 80 ? text.slice(0, 20000) : null;
  } catch {
    return null;
  }
}

// Détecte si le contenu collé est essentiellement un simple lien (et non du texte).
export function isBareUrl(s: string): string | null {
  const t = s.trim();
  return /^https?:\/\/\S+$/.test(t) ? t : null;
}
