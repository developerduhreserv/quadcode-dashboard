/**
 * «Пульс»: что происходит в X, Reddit и Discord. Общие для браузера и сервера функции:
 * источники по умолчанию, какие твиты отслеживаем, вес поста и сводка по правилам без AI.
 */
import { fmtNum, lastSnapshot, medianViews, verdictOf } from "./content";
import type { DB, PulseDigest, PulseInsight, PulseItem, PulseNetwork, PulseSources, Task } from "./types";

/** Наш аккаунт в X: его посты помечаем как свои. */
export const OUR_X = "quadcode_ai";

/** Watchlist из документа «Watchlist: бренды и креаторы» и сабы из заметки канала Reddit. */
export const DEFAULT_SOURCES: PulseSources = {
  xAccounts: ["higgsfield_ai", "Magnific_AI", "ManusAI_HQ", "MengTo", "chongdashu", "DannyLimanseta", "shneural", "AiBattle_", "xikhar"],
  xQueries: ['"vs" (Claude OR GPT OR Gemini OR Grok) game -is:retweet', "(unreal OR unity OR blender) AI prompt game -is:retweet"],
  xPosts: [],
  subreddits: ["aivideo", "gamedev", "unrealengine", "Unity3D", "blender", "aigamedev"],
  redditQueries: ["quadcode", "AI game dev"],
  discordInvites: [],
  discordChannels: [],
};

export const NETWORK_NAME: Record<PulseNetwork, string> = { x: "X", reddit: "Reddit", discord: "Discord" };

export function sourcesOf(db: DB): PulseSources {
  return { ...DEFAULT_SOURCES, ...(db.pulse.sources ?? {}) };
}

/** ID твита из ссылки x.com или twitter.com. */
export function tweetId(url: string): string | null {
  const m = /(?:x|twitter)\.com\/[^/]+\/status(?:es)?\/(\d{6,})/i.exec(url);
  return m ? m[1] : null;
}

/** Твиты, которые слушаем без X API: референсы из плана, наши вышедшие посты и ручной список. */
export function trackedTweets(db: DB): string[] {
  const urls = new Set<string>();
  const add = (u?: string) => {
    const id = u ? tweetId(u) : null;
    if (id) urls.add(id);
  };
  for (const t of Object.values(db.tasks)) {
    add(t.postUrl);
    t.refs?.forEach(add);
  }
  sourcesOf(db).xPosts.forEach(add);
  return [...urls];
}

/** Вес для сортировки «что заходит»: реплаи и репосты дороже лайков. */
export function weight(i: PulseItem): number {
  if (i.kind === "server") return i.likes;
  return i.likes + 3 * i.replies + 4 * (i.reposts ?? 0) + 2 * (i.bookmarks ?? 0);
}

export function fmtAgo(ts: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - ts) / 60_000));
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} дн` : `${Math.round(d / 30)} мес`;
}

/** Медиана, а не среднее: один вирусный мем на 90K лайков не должен решать за всю выборку. */
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const round = (x: number) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10);
const isDuel = (i: PulseItem) => /\bvs\.?\b|versus|same prompt/i.test(`${i.title ?? ""} ${i.text}`);

/**
 * Сводка по правилам, когда AI недоступен: что заходит, кто лидирует, что у нас.
 * Короткие выводы с действием, без воды.
 */
export function ruleDigest(items: PulseItem[], tasks: Task[], me: string | null): PulseDigest {
  const out: PulseInsight[] = [];
  const posts = items.filter((i) => i.kind === "post" && !i.ours);
  const x = posts.filter((i) => i.network === "x");

  if (x.length >= 4) {
    const duel = x.filter(isDuel);
    const rest = x.filter((i) => !isDuel(i));
    const a = median(duel.map((i) => i.likes));
    const b = median(rest.map((i) => i.likes));
    if (duel.length >= 2 && rest.length >= 2 && a > 0 && b > 0) {
      const k = a / b;
      out.push(
        k >= 1.2
          ? { network: "x", title: `Дуэли моделей заходят в ${round(k)}× лучше`, detail: `Медиана ${fmtNum(Math.round(a))} ♥ против ${fmtNum(Math.round(b))} у остальных`, action: "Держать R1 в плане каждый день" }
          : { network: "x", title: "Дуэли не выделяются", detail: `Медиана ${fmtNum(Math.round(a))} ♥ против ${fmtNum(Math.round(b))} у остальных`, action: "Пробовать боссов и ремейки" },
      );
    }
    const vid = x.filter((i) => i.media === "video");
    const still = x.filter((i) => i.media !== "video");
    if (vid.length >= 2 && still.length >= 2) {
      const k = median(vid.map((i) => i.likes)) / Math.max(1, median(still.map((i) => i.likes)));
      if (k >= 1.3) out.push({ network: "x", title: `Видео собирает в ${round(k)}× больше`, detail: "Посты без видео проседают", action: "Каждый пост с клипом" });
    }
    const top = [...x].sort((p, q) => weight(q) - weight(p))[0];
    if (top) {
      out.push({
        network: "x",
        title: `Лучший пост: @${top.author}`,
        detail: `${fmtNum(top.likes)} ♥, ${fmtNum(top.replies)} ответов. ${clip(top.text, 90)}`,
        action: "Разобрать механику и взять в референс",
        refs: [top.url],
      });
    }
    const byAuthor = new Map<string, number[]>();
    for (const i of x) byAuthor.set(i.author, [...(byAuthor.get(i.author) ?? []), i.likes]);
    const lead = [...byAuthor.entries()].filter(([, l]) => l.length >= 2).sort((p, q) => median(q[1]) - median(p[1]))[0];
    if (lead) out.push({ network: "x", title: `Стабильнее всех @${lead[0]}`, detail: `Медиана ${fmtNum(Math.round(median(lead[1])))} ♥ на ${lead[1].length} постах`, action: "Смотреть его посты первыми" });
  }

  const reddit = posts.filter((i) => i.network === "reddit");
  if (reddit.length) {
    const bySub = new Map<string, number[]>();
    for (const i of reddit) bySub.set(i.source, [...(bySub.get(i.source) ?? []), i.likes]);
    const best = [...bySub.entries()].sort((p, q) => median(q[1]) - median(p[1]))[0];
    const top = [...reddit].sort((p, q) => weight(q) - weight(p))[0];
    out.push({
      network: "reddit",
      title: `Горячее всего в ${best[0]}`,
      detail: `Топ дня: «${clip(top.title ?? top.text, 80)}», ${fmtNum(top.likes)} ↑`,
      action: "Пост туда с видео, ссылка в комментарии",
      refs: [top.url],
    });
  }

  const servers = items.filter((i) => i.kind === "server");
  if (servers.length) {
    const live = [...servers].sort((p, q) => (q.online ?? 0) / Math.max(1, q.likes) - (p.online ?? 0) / Math.max(1, p.likes))[0];
    out.push({
      network: "discord",
      title: `Живее всех ${live.author}`,
      detail: `${fmtNum(live.online ?? 0)} онлайн из ${fmtNum(live.likes)}`,
      action: "Выкладывать туда видео с промптом в треде",
      refs: [live.url],
    });
  }

  const asks = items.filter((i) => (i.kind === "mention" || i.kind === "message") && i.text.includes("?"));
  if (asks.length) out.push({ network: asks[0].network, title: `${asks.length} вопросов к нам без ответа`, detail: clip(asks[0].text, 90), action: "Ответить в первый час", refs: asks.slice(0, 3).map((i) => i.url) });

  const ourMedian = medianViews(tasks);
  const ours = tasks.filter((t) => t.postUrl && lastSnapshot(t));
  if (ours.length) {
    const v = ours.map((t) => verdictOf(t, ourMedian));
    const hits = v.filter((x) => x === "hit" || x === "boost").length;
    const dead = v.filter((x) => x === "dead").length;
    out.push({ network: "x", title: `Наши: ${hits} хитов, ${dead} умерло`, detail: `${ours.length} постов с метриками`, action: hits ? "Хиты развернуть в тред «как построено»" : "Сверить первую строку и видео с лидерами" });
  }

  return {
    at: Date.now(),
    by: me,
    engine: "rules",
    headline: "",
    insights: out.slice(0, 6),
    replies: [],
    ideas: [],
  };
}

export function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").replace(/https?:\/\/\S+/g, "").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

/** Ответ /api/pulse */
export interface PulseFeed {
  items: PulseItem[];
  /** Что подключено на сервере */
  keys: { x: boolean; reddit: boolean; discord: boolean; ai: boolean };
  errors: string[];
  at: number;
}
