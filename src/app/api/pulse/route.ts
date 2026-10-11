import { DEFAULT_SOURCES } from "@/lib/pulse";
import { KEYS, collect } from "@/lib/pulse-server";
import type { PulseSources } from "@/lib/types";

export const maxDuration = 60;

const list = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 300)).slice(0, max) : [];

/** Что подключено на сервере: без запросов наружу. */
export async function GET() {
  return Response.json({ keys: KEYS() });
}

/** Лента «Пульса»: источники и отслеживаемые твиты приходят из общей базы дашборда. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { sources?: Partial<PulseSources>; tweets?: unknown };
  const s = body.sources ?? {};
  const sources: PulseSources = {
    xAccounts: list(s.xAccounts ?? DEFAULT_SOURCES.xAccounts, 40),
    xQueries: list(s.xQueries ?? DEFAULT_SOURCES.xQueries, 5),
    xPosts: list(s.xPosts, 80),
    subreddits: list(s.subreddits ?? DEFAULT_SOURCES.subreddits, 15),
    redditQueries: list(s.redditQueries ?? DEFAULT_SOURCES.redditQueries, 5),
    discordInvites: list(s.discordInvites, 20),
    discordChannels: list(s.discordChannels, 15),
  };
  const tweets = list(body.tweets, 120).filter((id) => /^\d{6,25}$/.test(id));
  return Response.json(await collect(sources, tweets));
}
