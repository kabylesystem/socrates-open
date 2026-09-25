// Enrichit un livre avec une couverture et un lien d'achat. Couverture cherchée
// d'abord sur Google Books (très large couverture des livres francophones),
// puis OpenLibrary en secours.
export async function enrichBook(
  titre: string,
  auteur: string
): Promise<{ cover_url: string | null; buy_url: string }> {
  const buy_url = `https://www.amazon.fr/s?k=${encodeURIComponent(
    `${titre} ${auteur}`
  )}`;

  // 1) Google Books : couvertures riches, bon taux de réussite.
  try {
    const q = encodeURIComponent(`intitle:${titre} inauthor:${auteur}`);
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=5&langRestrict=fr`,
      { signal: AbortSignal.timeout(7000) }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        items?: {
          volumeInfo?: {
            imageLinks?: { thumbnail?: string; smallThumbnail?: string };
          };
        }[];
      };
      for (const item of data.items ?? []) {
        const img = item.volumeInfo?.imageLinks;
        const url = img?.thumbnail || img?.smallThumbnail;
        if (url) {
          const cover = url
            .replace(/^http:/, "https:")
            .replace(/&edge=curl/, "");
          return { cover_url: cover, buy_url };
        }
      }
    }
  } catch {
    // on passe au secours
  }

  // 2) OpenLibrary en secours.
  try {
    const q = encodeURIComponent(`${titre} ${auteur}`);
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${q}&limit=1&fields=cover_i`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (res.ok) {
      const data = (await res.json()) as { docs?: { cover_i?: number }[] };
      const coverId = data.docs?.[0]?.cover_i;
      if (coverId)
        return {
          cover_url: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`,
          buy_url,
        };
    }
  } catch {
    // pas de couverture trouvée
  }

  return { cover_url: null, buy_url };
}
