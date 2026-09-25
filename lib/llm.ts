import { spawn } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { logUsage } from "./db";

// Plan-first (préférence permanente de the user) : tout appel LLM passe par le
// FORFAIT (Claude Code headless `claude -p`, authentifié via la session du plan
// ou CLAUDE_CODE_OAUTH_TOKEN), PAS l'API au token. L'API reste le filet de
// débordement, activable d'un swap : LLM_BACKEND=api.
const BACKEND = (process.env.LLM_BACKEND ?? "plan") as "plan" | "api";

const api = new Anthropic();

// ---------- Claude Code headless (forfait) ----------

function runClaude(
  args: string[],
  prompt: string,
  onLine?: (line: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    // On retire la clé API de l'environnement du sous-process : sinon `claude`
    // retombe sur l'API (au token) au lieu du forfait. Le token = l'auth du plan.
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const child = spawn("claude", args, { env });
    let out = "";
    let err = "";
    let buf = "";
    child.stdout.on("data", (d: Buffer) => {
      const s = d.toString();
      out += s;
      if (onLine) {
        buf += s;
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (line.trim()) onLine(line);
        }
      }
    });
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (onLine && buf.trim()) onLine(buf);
      if (code === 0) resolve(out);
      else reject(new Error(err || `claude a quitté avec le code ${code}`));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function baseArgs(model: string, system: string, web: boolean): string[] {
  const args = [
    "-p",
    "--model",
    model,
    "--append-system-prompt",
    system,
  ];
  if (web) args.push("--allowedTools", "WebSearch", "--dangerously-skip-permissions");
  else args.push("--allowedTools", "");
  return args;
}

// Extrait le premier objet/tableau JSON d'un texte (tolère un éventuel habillage).
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  if (start < 0) return body.trim();
  const open = body[start];
  const close = open === "{" ? "}" : "]";
  const end = body.lastIndexOf(close);
  return end > start ? body.slice(start, end + 1) : body.slice(start);
}

async function planText(
  system: string,
  prompt: string,
  model: string,
  web: boolean
): Promise<string> {
  const raw = await runClaude(
    [...baseArgs(model, system, web), "--output-format", "json"],
    prompt
  );
  let json: { result?: string; is_error?: boolean; total_cost_usd?: number };
  try {
    json = JSON.parse(raw);
  } catch {
    // enveloppe claude -p illisible : on renvoie vide (contrat « null/vide »)
    return "";
  }
  try {
    if (typeof json.total_cost_usd === "number") logUsage(json.total_cost_usd);
  } catch {
    // la mesure de conso ne doit jamais casser un appel
  }
  // L'IA a renvoyé une erreur (crédits épuisés, limite atteinte…) : on la
  // PROPAGE (les appelants la transforment en message transparent), au lieu de
  // l'avaler. Les échecs de parsing JSON, eux, restent gérés en null par l'appelant.
  if (json.is_error) {
    throw new Error(json.result || "L'IA a renvoyé une erreur.");
  }
  return json.result ?? "";
}

async function* planStream(
  system: string,
  prompt: string,
  model: string
): AsyncGenerator<string> {
  const queue: string[] = [];
  let done = false;
  let waiter: (() => void) | null = null;
  const push = (t: string) => {
    queue.push(t);
    waiter?.();
    waiter = null;
  };

  const finished = runClaude(
    [
      ...baseArgs(model, system, false),
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
    ],
    prompt,
    (line) => {
      try {
        const ev = JSON.parse(line);
        if (
          ev.type === "stream_event" &&
          ev.event?.type === "content_block_delta" &&
          ev.event.delta?.type === "text_delta"
        ) {
          push(ev.event.delta.text as string);
        } else if (ev.type === "result" && typeof ev.total_cost_usd === "number") {
          try {
            logUsage(ev.total_cost_usd);
          } catch {
            // la mesure de conso ne doit jamais casser le stream
          }
        }
      } catch {
        // ligne NDJSON partielle/non pertinente
      }
    }
  ).finally(() => {
    done = true;
    waiter?.();
    waiter = null;
  });

  while (true) {
    if (queue.length) {
      yield queue.shift()!;
      continue;
    }
    if (done) break;
    await new Promise<void>((r) => (waiter = r));
  }
  await finished;
}

// ---------- API surface unique pour le reste de l'app ----------

export async function completeJSON<S extends z.ZodTypeAny>(
  schema: S,
  opts: {
    model: string;
    system: string;
    prompt: string;
    web?: boolean;
    maxTokens?: number;
  }
): Promise<z.infer<S> | null> {
  if (BACKEND === "api") {
    const r = await api.messages.parse({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 16000,
      thinking: { type: "adaptive" },
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
      output_config: { format: zodOutputFormat(schema) },
    });
    return r.parsed_output;
  }
  const text = await planText(
    `${opts.system}\n\nIMPÉRATIF DE SORTIE : réponds UNIQUEMENT avec un JSON valide conforme exactement au schéma demandé. Aucun texte, aucune balise, aucun commentaire autour.`,
    opts.prompt,
    opts.model,
    opts.web ?? false
  );
  try {
    return schema.parse(JSON.parse(extractJson(text)));
  } catch {
    return null;
  }
}

// Texte libre via le forfait (pour la recherche web sourcée notamment).
export async function completeText(opts: {
  model: string;
  system: string;
  prompt: string;
  web?: boolean;
}): Promise<string> {
  if (BACKEND === "api") {
    const r = await api.messages.create({
      model: opts.model,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    });
    return r.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }
  return planText(opts.system, opts.prompt, opts.model, opts.web ?? false);
}

// Streaming (débats, explore) : un flux de deltas texte, forfait ou API.
export async function* streamText(opts: {
  model: string;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
}): AsyncGenerator<string> {
  if (BACKEND === "api") {
    const stream = api.messages.stream({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2048,
      system: opts.system,
      messages: opts.messages,
    });
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
    return;
  }
  // En headless, on déroule l'historique dans un seul prompt.
  const convo = opts.messages
    .map(
      (m) => `${m.role === "user" ? "UTILISATEUR" : "TOI (assistant)"} : ${m.content}`
    )
    .join("\n\n");
  const prompt = `Voici l'échange jusqu'ici. Réponds au DERNIER message de l'utilisateur, dans ton rôle, sans préfixe.\n\n${convo}`;
  yield* planStream(opts.system, prompt, opts.model);
}

// La vision (photos de copies) reste sur l'API — le headless ne la porte pas
// proprement ; c'est un débordement assumé.
export function apiClient() {
  return api;
}
