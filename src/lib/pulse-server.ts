/**
 * Сбор «Пульса» на сервере. Каждый источник работает сам по себе: упал один, остальные приходят.
 *
 * X без ключа: публичные карточки твитов (лайки, ответы, текст, видео) по ссылкам из плана.
 * X с X_BEARER_TOKEN: поиск, watchlist и упоминания с просмотрами и закладками.
 * Reddit: нужен REDDIT_CLIENT_ID и REDDIT_CLIENT_SECRET (app-only OAuth), без них Reddit отдаёт 403.
 * Discord без ключа: размер и онлайн серверов по инвайтам. С DISCORD_BOT_TOKEN: сообщения каналов.
 */
import { OUR_X, tweetId } from "./pulse";
import type { PulseFeed } from "./pulse";
import type { PulseItem, PulseSources } from "./types";

const UA = "web:quadcode-content-dashboard:1.0 (by /u/quadcode_ai)";
/** Повторный запрос того же адреса в течение 10 минут берётся из кэша Next */
const CACHE = { next: { revalidate: 600 } } as const;

export const KEYS = () => ({
  x: !!process.env.X_BEARER_TOKEN,
  reddit: !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET),
  discord: !!process.env.DISCORD_BOT_TOKEN,
  ai: !!process.env.ANTHROPIC_API_KEY,
});

async function getJSON<T>(url: string, init: RequestInit & { next?: { revalidate: number } } = {}, ms = 8000): Promise<T> {
  const res = await fetch(url, { ...CACHE, ...init, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return (await res.json()) as T;
}

/** Ограничение параллельных запросов, чтобы не словить 429. */
async function pool<T, R>(list: T[], n: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        try {
          out[i] = { status: "fulfilled", value: await fn(list[i]) };
        } catch (reason) {
          out[i] = { status: "rejected", reason };
        }
      }
    }),
  );
  return out;
}

const clean = (s: string) => s.replace(/https:\/\/t\.co\/\w+$/g, "").trim();

// ───────────── X: публичные карточки твитов ─────────────

interface Syndication {
  id_str: string;
  text: string;
  created_at: string;
  favorite_count?: number;
  conversation_count?: number;
  user?: { screen_name: string; name: string };
  mediaDetails?: { type: string }[];
  video?: unknown;
}

/** Токен публичного эндпоинта карточек: тот же расчёт, что в react-tweet. */
const synToken = (id: string) => ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");

async function tweetCard(id: string): Promise<PulseItem | null> {
  const t = await getJSON<Syndication>(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${synToken(id)}`);
  if (!t?.id_str || !t.user) return null;
  const media = t.video || t.mediaDetails?.some((m) => m.type === "video" || m.type === "animated_gif") ? "video" : t.mediaDetails?.length ? "image" : null;
  return {
    id: `x:${id}`,
    network: "x",
    kind: "post",
    author: t.user.screen_name,
    text: clean(t.text),
    url: `https://x.com/${t.user.screen_name}/status/${id}`,
    at: Date.parse(t.created_at),
    likes: t.favorite_count ?? 0,
    replies: t.conversation_count ?? 0,
    source: "карточка",
    media,
    ours: t.user.screen_name.toLowerCase() === OUR_X,
  };
}

// ───────────── X API v2 ─────────────

interface XSearch {
  data?: {
    id: string;
    text: string;
    created_at: string;
    author_id: string;
    attachments?: { media_keys?: string[] };
    public_metrics: { like_count: number; reply_count: number; retweet_count: number; quote_count: number; bookmark_count?: number; impression_count?: number };
  }[];
  includes?: { users?: { id: string; username: string }[]; media?: { media_key: string; type: string }[] };
}

async function xSearch(query: string, kind: PulseItem["kind"], source: string): Promise<PulseItem[]> {
  const q = new URLSearchParams({
    query,
    max_results: "25",
    sort_order: "relevancy",
    "tweet.fields": "public_metrics,created_at,author_id,attachments",
    expansions: "author_id,attachments.media_keys",
    "user.fields": "username",
    "media.fields": "type",
  });
  const r = await getJSON<XSearch>(`https://api.x.com/2/tweets/search/recent?${q}`, {
    headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` },
  });
  const users = new Map((r.includes?.users ?? []).map((u) => [u.id, u.username]));
  const media = new Map((r.includes?.media ?? []).map((m) => [m.media_key, m.type]));
  return (r.data ?? []).map((t) => {
    const author = users.get(t.author_id) ?? t.author_id;
    const types = (t.attachments?.media_keys ?? []).map((k) => media.get(k));
    return {
      id: `x:${t.id}`,
      network: "x",
      kind,
      author,
      text: clean(t.text),
      url: `https://x.com/${author}/status/${t.id}`,
      at: Date.parse(t.created_at),
      likes: t.public_metrics.like_count,
      replies: t.public_metrics.reply_count,
      reposts: t.public_metrics.retweet_count + t.public_metrics.quote_count,
      bookmarks: t.public_metrics.bookmark_count,
      views: t.public_metrics.impression_count,
      source,
      media: types.some((x) => x === "video" || x === "animated_gif") ? "video" : types.length ? "image" : null,
      ours: author.toLowerCase() === OUR_X,
    } satisfies PulseItem;
  });
}

async function collectX(src: PulseSources, tweets: string[], errors: string[]): Promise<PulseItem[]> {
  const items: PulseItem[] = [];
  const ids = [...new Set([...tweets, ...src.xPosts.map((u) => tweetId(u)).filter((x): x is string => !!x)])].slice(0, 80);
  const cards = await pool(ids, 8, tweetCard);
  let failed = 0;
  for (const c of cards) {
    if (c.status === "fulfilled" && c.value) items.push(c.value);
    else failed++;
  }
  if (failed && failed === ids.length) errors.push("X: карточки твитов не ответили");

  if (process.env.X_BEARER_TOKEN) {
    const handles = src.xAccounts.map((h) => h.replace(/^@/, "").trim()).filter(Boolean);
    const jobs: [string, PulseItem["kind"], string][] = [
      ...src.xQueries.slice(0, 3).map((q): [string, PulseItem["kind"], string] => [q, "post", q]),
      [`(@${OUR_X} OR quadcode) -from:${OUR_X} -is:retweet`, "mention", "упоминания"],
    ];
    // Запрос X ограничен 512 символами: watchlist режем на части
    for (let i = 0; i < handles.length; i += 8) {
      jobs.push([`(${handles.slice(i, i + 8).map((h) => `from:${h}`).join(" OR ")}) -is:retweet -is:reply`, "post", "watchlist"]);
    }
    const res = await pool(jobs, 3, ([q, kind, source]) => xSearch(q, kind, source));
    res.forEach((r, i) => {
      if (r.status === "fulfilled") items.push(...r.value);
      else errors.push(`X: «${jobs[i][2]}» ${(r.reason as Error).message}`);
    });
  }
  return items;
}

// ───────────── Reddit ─────────────

let redditToken: { value: string; until: number } | null = null;

async function redditAuth(): Promise<string> {
  if (redditToken && redditToken.until > Date.now() + 60_000) return redditToken.value;
  const basic = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Reddit OAuth ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  redditToken = { value: j.access_token, until: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

interface RedditListing {
  data: {
    children: {
      data: {
        id: string;
        title: string;
        selftext: string;
        permalink: string;
        author: string;
        subreddit_name_prefixed: string;
        score: number;
        num_comments: number;
        created_utc: number;
        is_video?: boolean;
        post_hint?: string;
      };
    }[];
  };
}

async function redditList(path: string, kind: PulseItem["kind"], token: string): Promise<PulseItem[]> {
  const r = await getJSON<RedditListing>(`https://oauth.reddit.com${path}${path.includes("?") ? "&" : "?"}raw_json=1`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": UA },
  });
  return r.data.children.map(({ data: p }) => ({
    id: `reddit:${p.id}`,
    network: "reddit",
    kind,
    author: p.author,
    title: p.title,
    text: p.selftext.slice(0, 600),
    url: `https://www.reddit.com${p.permalink}`,
    at: p.created_utc * 1000,
    likes: p.score,
    replies: p.num_comments,
    source: p.subreddit_name_prefixed,
    media: p.is_video || p.post_hint === "hosted:video" || p.post_hint === "rich:video" ? "video" : p.post_hint === "image" ? "image" : null,
  }));
}

async function collectReddit(src: PulseSources, errors: string[]): Promise<PulseItem[]> {
  if (!process.env.REDDIT_CLIENT_ID || !process.env.REDDIT_CLIENT_SECRET) return [];
  let token: string;
  try {
    token = await redditAuth();
  } catch (e) {
    errors.push((e as Error).message);
    return [];
  }
  const jobs: [string, PulseItem["kind"]][] = [
    ...src.subreddits.slice(0, 10).map((s): [string, PulseItem["kind"]] => [`/r/${s.replace(/^r\//, "")}/top?t=day&limit=8`, "post"]),
    ...src.redditQueries.slice(0, 3).map((q): [string, PulseItem["kind"]] => [`/search?q=${encodeURIComponent(q)}&sort=new&t=week&limit=12`, "mention"]),
  ];
  const items: PulseItem[] = [];
  const res = await pool(jobs, 4, ([path, kind]) => redditList(path, kind, token));
  res.forEach((r, i) => {
    if (r.status === "fulfilled") items.push(...r.value);
    else errors.push(`Reddit ${jobs[i][0].split("?")[0]}: ${(r.reason as Error).message}`);
  });
  return items;
}

// ───────────── Discord ─────────────

interface Invite {
  code: string;
  guild?: { id: string; name: string };
  approximate_member_count?: number;
  approximate_presence_count?: number;
}

interface DiscordMessage {
  id: string;
  content: string;
  timestamp: string;
  author: { username: string; bot?: boolean };
  reactions?: { count: number }[];
  thread?: { message_count?: number };
}

async function collectDiscord(src: PulseSources, errors: string[]): Promise<PulseItem[]> {
  const items: PulseItem[] = [];
  const codes = src.discordInvites.map((c) => c.replace(/^https?:\/\/(www\.)?(discord\.gg|discord\.com\/invite)\//, "").trim()).filter(Boolean);
  const inv = await pool(codes.slice(0, 15), 4, (code) => getJSON<Invite>(`https://discord.com/api/v10/invites/${code}?with_counts=true`));
  inv.forEach((r, i) => {
    if (r.status !== "fulfilled" || !r.value.guild) {
      errors.push(`Discord: инвайт ${codes[i]} не открылся`);
      return;
    }
    const g = r.value;
    items.push({
      id: `discord:server:${g.guild!.id}`,
      network: "discord",
      kind: "server",
      author: g.guild!.name,
      text: "",
      url: `https://discord.gg/${g.code}`,
      at: Date.now(),
      likes: g.approximate_member_count ?? 0,
      online: g.approximate_presence_count ?? 0,
      replies: 0,
      source: "сервер",
    });
  });

  const bot = process.env.DISCORD_BOT_TOKEN;
  if (bot && src.discordChannels.length) {
    const headers = { Authorization: `Bot ${bot}` };
    const res = await pool(src.discordChannels.slice(0, 10), 3, async (channel) => {
      const info = await getJSON<{ guild_id: string; name: string }>(`https://discord.com/api/v10/channels/${channel}`, { headers });
      const list = await getJSON<DiscordMessage[]>(`https://discord.com/api/v10/channels/${channel}/messages?limit=30`, { headers });
      return list
        .filter((m) => !m.author.bot && m.content.trim())
        .map(
          (m): PulseItem => ({
            id: `discord:${m.id}`,
            network: "discord",
            kind: "message",
            author: m.author.username,
            text: m.content.slice(0, 600),
            url: `https://discord.com/channels/${info.guild_id}/${channel}/${m.id}`,
            at: Date.parse(m.timestamp),
            likes: (m.reactions ?? []).reduce((a, r) => a + r.count, 0),
            replies: m.thread?.message_count ?? 0,
            source: `#${info.name}`,
          }),
        );
    });
    res.forEach((r, i) => {
      if (r.status === "fulfilled") items.push(...r.value);
      else errors.push(`Discord: канал ${src.discordChannels[i]} ${(r.reason as Error).message}`);
    });
  }
  return items;
}

export async function collect(src: PulseSources, tweets: string[]): Promise<PulseFeed> {
  const errors: string[] = [];
  const [x, reddit, discord] = await Promise.all([collectX(src, tweets, errors), collectReddit(src, errors), collectDiscord(src, errors)]);
  // Один и тот же твит мог прийти и карточкой, и из поиска: оставляем версию с просмотрами
  const byId = new Map<string, PulseItem>();
  for (const i of [...x, ...reddit, ...discord]) {
    const prev = byId.get(i.id);
    if (!prev || (i.views ?? 0) > (prev.views ?? 0) || (prev.kind === "post" && i.kind === "mention")) byId.set(i.id, i);
  }
  return { items: [...byId.values()], keys: KEYS(), errors, at: Date.now() };
}
