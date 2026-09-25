import { YoutubeTranscript } from "youtube-transcript";

export function youtubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/
  );
  return m ? m[1] : null;
}

export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export async function getTranscript(
  url: string
): Promise<{ text: string; lang?: string }> {
  const items = await YoutubeTranscript.fetchTranscript(url, {
    lang: "fr",
  }).catch(() => YoutubeTranscript.fetchTranscript(url));
  const text = items
    .map((i) => i.text)
    .join(" ")
    .replace(/&amp;#39;/g, "'")
    .replace(/&amp;quot;/g, "”")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) throw new Error("Transcript vide");
  return { text };
}
