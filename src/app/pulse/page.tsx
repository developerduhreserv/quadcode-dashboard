"use client";

import { Loader2, RefreshCw, Settings2, Sparkles, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { InsightRow, ItemCard, ItemStats, ReplyBox, SourcesModal, requestDraft } from "@/components/pulse";
import { Button, ChannelGlyph, Empty, IconButton, PageHead, Panel, Segments, cx, toast } from "@/components/ui";
import { fmtNum, lastSnapshot, medianViews, verdictOf } from "@/lib/content";
import { useNow } from "@/lib/hooks";
import { NETWORK_NAME, fmtAgo, median, ruleDigest, sourcesOf, trackedTweets, weight } from "@/lib/pulse";
import type { PulseFeed } from "@/lib/pulse";
import { savePulseDigest, savePulseReply, useApp } from "@/lib/store";
import { PULSE_NETWORKS } from "@/lib/types";
import type { PulseDigest, PulseItem, PulseNetwork } from "@/lib/types";

type Net = "all" | PulseNetwork;
const CACHE_KEY = "qcai:pulse:feed";

function readCache(): PulseFeed | null {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(CACHE_KEY) : null;
    return raw ? (JSON.parse(raw) as PulseFeed) : null;
  } catch {
    return null;
  }
}

/** Лента с сервера. Последняя копия лежит в браузере, чтобы страница открывалась сразу. */
function useFeed(body: string, nonce: number) {
  const key = `${body}#${nonce}`;
  const [state, setState] = useState<{ key: string; feed: PulseFeed | null; error: string | null }>(() => ({ key: "", feed: readCache(), error: null }));
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/pulse", { method: "POST", headers: { "content-type": "application/json" }, body, signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<PulseFeed>) : Promise.reject(new Error(`Сервер ответил ${r.status}`))))
      .then((feed) => {
        setState({ key, feed, error: null });
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(feed));
        } catch {}
      })
      .catch((e: Error) => {
        if (!ctrl.signal.aborted) setState((s) => ({ ...s, key, error: e.message }));
      });
    return () => ctrl.abort();
  }, [body, key]);
  return { feed: state.feed, error: state.error, loading: state.key !== key };
}

/** «Пульс»: что заходит и что пишут в X, Reddit и Discord, и что с этим делать. */
export default function PulsePage() {
  const { db, me } = useApp();
  const now = useNow();
  const [net, setNet] = useState<Net>("all");
  const [nonce, setNonce] = useState(0);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [auto, setAuto] = useState<{ done: number; total: number } | null>(null);

  const sources = useMemo(() => sourcesOf(db), [db]);
  const tasks = useMemo(() => Object.values(db.tasks), [db.tasks]);
  const body = useMemo(() => JSON.stringify({ sources, tweets: trackedTweets(db) }), [db, sources]);
  const { feed, error, loading } = useFeed(body, nonce);

  const items = useMemo(() => feed?.items ?? [], [feed]);
  const shown = net === "all" ? items : items.filter((i) => i.network === net);
  const hot = useMemo(() => shown.filter((i) => i.kind === "post").sort((a, b) => weight(b) - weight(a)), [shown]);
  // Сначала те, кому ещё не ответили, внутри по свежести
  const sent = db.pulse.sent;
  const talk = useMemo(
    () => shown.filter((i) => i.kind === "mention" || i.kind === "message").sort((a, b) => Number(!!sent?.[a.url]) - Number(!!sent?.[b.url]) || b.at - a.at),
    [shown, sent],
  );
  const waiting = talk.filter((i) => !sent?.[i.url]);
  const servers = useMemo(() => shown.filter((i) => i.kind === "server").sort((a, b) => b.likes - a.likes), [shown]);

  // Сохранённая сводка или посчитанная на лету по правилам, чтобы блок не пустовал
  const saved = db.pulse.digest;
  const digest: PulseDigest | null = useMemo(() => saved ?? (items.length ? ruleDigest(items, tasks, me, sent) : null), [saved, items, tasks, me, sent]);
  const insights = digest ? (net === "all" ? digest.insights : digest.insights.filter((i) => i.network === net || i.network === "all")) : [];

  const collect = async () => {
    setBusy(true);
    try {
      const median = medianViews(tasks);
      const ours = tasks
        .filter((t) => t.postUrl)
        .map((t) => {
          const s = lastSnapshot(t);
          return { title: t.title, format: t.format, model: t.model, views: s?.views, likes: s?.likes, bookmarks: s?.bookmarks, verdict: verdictOf(t, median), url: t.postUrl };
        });
      const res = await fetch("/api/pulse/digest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: [...items].sort((a, b) => weight(b) - weight(a)).slice(0, 80), ours, releases: db.meta.releases ?? [] }),
      });
      if (res.status === 501) {
        savePulseDigest(ruleDigest(items, tasks, me, sent));
        toast("Claude не подключён, сводка по правилам", 2600);
      } else {
        const j = (await res.json()) as Omit<PulseDigest, "at" | "by"> & { error?: string };
        if (!res.ok || j.error) toast(j.error ?? "Не получилось", 3000, { wait: true });
        else savePulseDigest({ ...j, at: Date.now(), by: me });
      }
    } catch {
      toast("Сеть недоступна", 2000, { wait: true });
    }
    setBusy(false);
  };

  /** Автореплаер: черновики всем, кому ещё не ответили. Отправка остаётся за человеком, по одному клику. */
  const autoReply = async () => {
    const queue = waiting.filter((i) => !db.pulse.replies?.[i.url]).slice(0, 12);
    if (!queue.length) return toast("Черновики уже есть у всех", 1800);
    setAuto({ done: 0, total: queue.length });
    let done = 0;
    for (const i of queue) {
      const r = await requestDraft(i);
      if (r.noKey) {
        toast("Для автореплаера нужен ANTHROPIC_API_KEY", 2600, { wait: true });
        break;
      }
      if (r.draft) savePulseReply(i.url, r.draft);
      setAuto({ done: ++done, total: queue.length });
    }
    setAuto(null);
  };

  const keys = feed?.keys ?? null;
  const counts = (n: PulseNetwork) => items.filter((i) => i.network === n && i.kind !== "server").length;

  return (
    <div className="stagger space-y-4">
      <PageHead
        title="Пульс"
        right={
          <>
            <Button onClick={() => setNonce((n) => n + 1)} disabled={loading} title={feed ? `Обновлено ${fmtAgo(feed.at, now)} назад` : undefined}>
              <RefreshCw size={15} className={cx(loading && "animate-spin")} />
              <span className="hidden sm:inline">{feed && !loading ? fmtAgo(feed.at, now) : "Обновить"}</span>
            </Button>
            <IconButton label="Источники" className="size-10 border border-white/12 bg-white/[0.04]" onClick={() => setEditing(true)}>
              <Settings2 size={17} />
            </IconButton>
          </>
        }
      />

      <Segments
        label="Соцсеть"
        value={net}
        onChange={(v) => {
          setNet(v);
          setMore(false);
        }}
        options={[
          { value: "all" as Net, label: "Все" },
          ...PULSE_NETWORKS.map((n) => ({
            value: n as Net,
            label: (
              <>
                <ChannelGlyph id={n} size={13} />
                {NETWORK_NAME[n]}
                <span className="font-mono text-[11.5px] text-muted">{n === "discord" ? items.filter((i) => i.network === n).length : counts(n)}</span>
              </>
            ),
          })),
        ]}
      />

      {net === "all" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {PULSE_NETWORKS.map((n) => (
            <NetworkTile key={n} net={n} items={items.filter((i) => i.network === n)} sent={sent} live={keys?.[n] ?? false} onOpen={() => setNet(n)} onSetup={() => setEditing(true)} />
          ))}
        </div>
      )}

      {error && !feed && <Empty title="Лента не загрузилась">{error}</Empty>}

      <Panel
        title={digest?.headline || "Сводка"}
        eyebrow={digest ? `Сводка · ${digest.engine === "ai" ? "Claude" : "по правилам"} · ${fmtAgo(digest.at, now)}` : "Сводка"}
        right={
          <Button variant="primary" onClick={collect} disabled={busy || !items.length}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {busy ? "Собираю" : "Собрать"}
          </Button>
        }
      >
        {insights.length ? (
          <ul className="divide-y divide-line">
            {insights.map((x, i) => (
              <InsightRow key={i} insight={x} />
            ))}
          </ul>
        ) : (
          <Empty title={loading ? "Слушаю соцсети" : "Пока нечего сказать"} />
        )}
        {net === "all" && !!digest?.ideas.length && (
          <div className="mt-4 border-t border-line pt-4">
            <div className="eyebrow mb-2">Идеи постов</div>
            <ul className="space-y-1.5">
              {digest.ideas.map((idea) => (
                <li key={idea} className="text-[14px] text-ink-2">
                  {idea}
                </li>
              ))}
            </ul>
          </div>
        )}
        {net === "all" && !!digest?.replies.length && (
          <div className="mt-4 border-t border-line pt-4">
            <div className="eyebrow mb-2">Ответить</div>
            <ul className="space-y-2">
              {digest.replies.map((r) => (
                <li key={r.url} className="rounded-xl border border-line bg-white/[0.03] p-3 text-[13.5px]">
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-muted hover:text-ink">
                    {r.to}
                  </a>
                  <p className="mt-1 text-ink">{r.draft}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Panel title="Что заходит">
          {hot.length ? (
            <div className="space-y-2">
              {(more ? hot : hot.slice(0, 10)).map((i) => (
                <ItemCard key={i.id} item={i} now={now} />
              ))}
              {hot.length > 10 && !more && (
                <Button variant="ghost" className="w-full" onClick={() => setMore(true)}>
                  Ещё {hot.length - 10}
                </Button>
              )}
            </div>
          ) : (
            <Empty title={loading ? "Загрузка" : "Пусто"}>{(net === "reddit" || net === "threads") && keys && !keys[net] ? `${NETWORK_NAME[net]} без ключа не отдаёт данные` : null}</Empty>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel
            title={waiting.length ? `Что пишут · ${waiting.length}` : "Что пишут"}
            right={
              waiting.length > 0 && (
                <Button className="h-9 px-3.5 text-[13px]" onClick={autoReply} disabled={!!auto}>
                  {auto ? <Loader2 size={14} className="animate-spin" /> : <WandSparkles size={14} />}
                  {auto ? `${auto.done} из ${auto.total}` : "Автоответ"}
                </Button>
              )
            }
          >
            {talk.length ? (
              <div className="space-y-2">
                {talk.slice(0, 12).map((i) => (
                  <ItemCard key={i.id} item={i} now={now}>
                    <ReplyBox item={i} />
                  </ItemCard>
                ))}
              </div>
            ) : (
              <Empty title="Пусто">{keys && !keys.x && !keys.threads && !keys.reddit && !keys.discord ? "Упоминания появятся с ключами X, Threads, Reddit или Discord" : null}</Empty>
            )}
          </Panel>

          {(net === "all" || net === "discord") && (
            <Panel title="Discord-серверы">
              {servers.length ? (
                <ul className="divide-y divide-line">
                  {servers.map((s) => (
                    <li key={s.id}>
                      <a href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 py-2.5 text-[14px] hover:text-accent-soft">
                        <span className="min-w-0 flex-1 truncate text-ink">{s.author}</span>
                        <ItemStats item={s} />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <button type="button" onClick={() => setEditing(true)} className="w-full rounded-2xl border border-dashed border-white/12 px-4 py-6 text-[13.5px] text-muted transition-colors hover:border-accent/40 hover:text-ink">
                  Добавить серверы по инвайту
                </button>
              )}
            </Panel>
          )}
        </div>
      </div>

      {editing && <SourcesModal onClose={() => setEditing(false)} sources={sources} keys={keys} errors={feed?.errors} />}
    </div>
  );
}

/** Плитка соцсети: главное число, лидер, клик открывает её ленту. */
function NetworkTile({
  net,
  items,
  sent,
  live,
  onOpen,
  onSetup,
}: {
  net: PulseNetwork;
  items: PulseItem[];
  sent?: Record<string, number>;
  live: boolean;
  onOpen: () => void;
  onSetup: () => void;
}) {
  // Чужие посты важнее, но если их нет (Threads без поиска), считаем по нашим
  const others = items.filter((i) => i.kind === "post" && !i.ours);
  const posts = others.length ? others : items.filter((i) => i.kind === "post");
  const top = [...posts].sort((a, b) => weight(b) - weight(a))[0];
  const servers = items.filter((i) => i.kind === "server");
  const mentions = items.filter((i) => (i.kind === "mention" || i.kind === "message") && !sent?.[i.url]).length;

  let value: string;
  let sub: string;
  if (net === "discord") {
    const online = servers.reduce((a, s) => a + (s.online ?? 0), 0);
    value = servers.length ? fmtNum(online) : "—";
    sub = servers.length ? `онлайн на ${servers.length} серв.` : "серверы не добавлены";
  } else if (!posts.length) {
    value = "—";
    sub = (net === "reddit" || net === "threads") && !live ? `нужен ключ ${NETWORK_NAME[net]}` : "нет данных";
  } else {
    value = fmtNum(Math.round(median(posts.map((p) => p.likes))));
    sub = `${net === "reddit" ? "↑" : "♥"} медиана, ${posts.length} постов`;
  }
  const empty = value === "—";

  return (
    <button
      type="button"
      onClick={empty ? onSetup : onOpen}
      className="group min-w-0 rounded-2xl border border-line bg-white/[0.03] px-4 py-3.5 text-left transition-[border-color,background-color,transform] duration-300 ease-out-quint hover:-translate-y-0.5 hover:border-line-2 hover:bg-white/[0.05]"
    >
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <span style={{ color: `var(--c-${net})` }}>
          <ChannelGlyph id={net} size={14} />
        </span>
        {NETWORK_NAME[net]}
        {mentions > 0 && <span className="font-mono ml-auto rounded-md border border-accent/35 bg-accent/[0.1] px-1.5 text-[11px] text-accent-soft">{mentions} ждут ответа</span>}
      </div>
      <div className={cx("font-display mt-2 text-[28px] font-medium leading-none", empty ? "text-muted" : "text-ink")}>{value}</div>
      <div className="mt-1.5 truncate text-[12.5px] text-muted">{sub}</div>
      {top && <div className="mt-1 truncate text-[12.5px] text-ink-2">Топ: {net === "x" || net === "threads" ? `@${top.author}` : top.source}</div>}
    </button>
  );
}
