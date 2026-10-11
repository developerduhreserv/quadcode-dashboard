"use client";

import { ArrowBigUp, Check, Copy, ExternalLink, Eye, Heart, Loader2, MessageCircle, Play, Repeat2, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import { NETWORK_NAME, clip, fmtAgo } from "@/lib/pulse";
import { fmtNum } from "@/lib/content";
import { savePulseReply, savePulseSources, useApp } from "@/lib/store";
import type { PulseFeed } from "@/lib/pulse";
import type { PulseInsight, PulseItem, PulseNetwork, PulseSources } from "@/lib/types";
import { Button, ChannelGlyph, IconButton, Modal, cx, fieldClass, toast } from "./ui";

const NET_COLOR: Record<PulseNetwork, string> = { x: "var(--c-x)", reddit: "var(--c-reddit)", discord: "var(--c-discord)" };

function Stat({ icon, value, title }: { icon: React.ReactNode; value: number; title: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={title}>
      {icon}
      {fmtNum(value)}
    </span>
  );
}

/** Цифры поста одной строкой: у Reddit стрелка вверх вместо сердца. */
export function ItemStats({ item }: { item: PulseItem }) {
  if (item.kind === "server")
    return (
      <span className="font-mono inline-flex items-center gap-3 text-[12px] tabular-nums text-ink-2">
        <Stat icon={<Users size={12} />} value={item.likes} title="участников" />
        <span className="inline-flex items-center gap-1 text-good" title="онлайн">
          <span className="size-1.5 rounded-full bg-good" />
          {fmtNum(item.online ?? 0)}
        </span>
      </span>
    );
  return (
    <span className="font-mono inline-flex items-center gap-2.5 text-[12px] tabular-nums text-ink-2">
      {!!item.views && <Stat icon={<Eye size={12} />} value={item.views} title="просмотры" />}
      <Stat icon={item.network === "reddit" ? <ArrowBigUp size={13} /> : <Heart size={12} />} value={item.likes} title={item.network === "reddit" ? "апвоуты" : "лайки"} />
      <Stat icon={<MessageCircle size={12} />} value={item.replies} title="ответы" />
      {!!item.reposts && <Stat icon={<Repeat2 size={13} />} value={item.reposts} title="репосты" />}
    </span>
  );
}

/** Карточка поста: клик открывает оригинал. */
export function ItemCard({ item, now, children }: { item: PulseItem; now: number; children?: React.ReactNode }) {
  const who = item.network === "x" ? `@${item.author}` : item.network === "reddit" ? `u/${item.author}` : item.author;
  return (
    <article className="rounded-xl border border-line bg-white/[0.03] transition-colors duration-300 hover:border-line-2 hover:bg-white/[0.05]">
      <a href={item.url} target="_blank" rel="noreferrer" className="block p-3">
        <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-muted">
          <span style={{ color: NET_COLOR[item.network] }}>
            <ChannelGlyph id={item.network} size={13} />
          </span>
          <span className="truncate text-ink-2">{who}</span>
          {item.source && item.network !== "x" && <span className="hidden truncate sm:inline">{item.source}</span>}
          <span className="shrink-0">{fmtAgo(item.at, now)}</span>
          {item.media === "video" && <Play size={11} className="shrink-0 fill-current" aria-label="видео" />}
          {item.ours && <span className="font-mono shrink-0 rounded border border-accent/40 px-1 text-[10px] uppercase text-accent-soft">наш</span>}
          <span className="ml-auto shrink-0">
            <ItemStats item={item} />
          </span>
        </div>
        {(item.title || item.text) && (
          <p className="mt-1.5 line-clamp-2 text-[14px] leading-snug text-ink">{clip(item.title ?? item.text, 220)}</p>
        )}
      </a>
      {children}
    </article>
  );
}

/** Ответ на упоминание: черновик от Claude, правка, копирование. */
export function ReplyBox({ item }: { item: PulseItem }) {
  const { db } = useApp();
  const saved = db.pulse.replies?.[item.url] ?? "";
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const draft = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/pulse/reply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(item) });
      const j = (await res.json()) as { draft?: string; error?: string };
      if (res.status === 501) toast("Для ответов нужен ANTHROPIC_API_KEY", 2600, { wait: true });
      else if (!res.ok || !j.draft) toast(j.error ?? "Не получилось", 2600, { wait: true });
      else savePulseReply(item.url, j.draft);
    } catch {
      toast("Сеть недоступна", 2000, { wait: true });
    }
    setBusy(false);
  };

  if (!saved)
    return (
      <div className="flex justify-end px-3 pb-2.5">
        <Button variant="ghost" className="h-8 px-3 text-[13px]" onClick={draft} disabled={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Ответ
        </Button>
      </div>
    );
  return (
    <div className="border-t border-line px-3 pb-3 pt-2.5">
      <textarea
        key={saved}
        defaultValue={saved}
        rows={2}
        aria-label="Черновик ответа"
        onBlur={(e) => e.target.value !== saved && savePulseReply(item.url, e.target.value)}
        className={cx(fieldClass, "resize-y text-[13.5px] leading-relaxed")}
      />
      <div className="mt-1.5 flex items-center justify-end gap-1">
        <IconButton label="Ещё вариант" onClick={draft} disabled={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        </IconButton>
        <IconButton
          label="Скопировать"
          onClick={async () => {
            await navigator.clipboard.writeText(saved).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? <Check size={14} className="text-good" /> : <Copy size={14} />}
        </IconButton>
        <IconButton label="Открыть пост" onClick={() => window.open(item.url, "_blank")}>
          <ExternalLink size={14} />
        </IconButton>
      </div>
    </div>
  );
}

/** Один вывод сводки: что увидели и что делаем. */
export function InsightRow({ insight }: { insight: PulseInsight }) {
  const net = insight.network === "all" ? null : insight.network;
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-[9px]"
        style={net ? { color: NET_COLOR[net], background: `color-mix(in srgb, ${NET_COLOR[net]} 14%, transparent)` } : { color: "var(--accent-soft)", background: "rgb(var(--glow) / 0.12)" }}
      >
        {net ? <ChannelGlyph id={net} size={13} /> : <Sparkles size={13} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-medium text-ink">{insight.title}</div>
        <div className="mt-0.5 text-[13px] leading-relaxed text-muted">{insight.detail}</div>
        {(insight.action || !!insight.refs?.length) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
            {insight.action && <span className="text-accent-soft">→ {insight.action}</span>}
            {insight.refs?.slice(0, 3).map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-ink">
                <ExternalLink size={11} />
                {u.replace(/^https?:\/\/(www\.)?/, "").split("/").slice(0, 2).join("/")}
              </a>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

const lines = (s: string) => s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);

const FIELDS: { key: keyof PulseSources; net: PulseNetwork; label: string; placeholder: string; needs?: keyof PulseFeed["keys"] }[] = [
  { key: "xAccounts", net: "x", label: "Watchlist X", placeholder: "higgsfield_ai", needs: "x" },
  { key: "xQueries", net: "x", label: "Поиск по X", placeholder: '"vs" Claude game -is:retweet', needs: "x" },
  { key: "xPosts", net: "x", label: "Отдельные твиты", placeholder: "https://x.com/…/status/…" },
  { key: "subreddits", net: "reddit", label: "Сабреддиты", placeholder: "aivideo", needs: "reddit" },
  { key: "redditQueries", net: "reddit", label: "Поиск по Reddit", placeholder: "quadcode", needs: "reddit" },
  { key: "discordInvites", net: "discord", label: "Discord-серверы", placeholder: "discord.gg/код" },
  { key: "discordChannels", net: "discord", label: "Каналы для бота", placeholder: "ID канала", needs: "discord" },
];

const ENV: Record<keyof PulseFeed["keys"], { name: string; vars: string }> = {
  x: { name: "X API: поиск, watchlist, упоминания, просмотры", vars: "X_BEARER_TOKEN" },
  reddit: { name: "Reddit", vars: "REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET" },
  discord: { name: "Discord-бот: сообщения каналов", vars: "DISCORD_BOT_TOKEN" },
  ai: { name: "Claude: сводка и ответы", vars: "ANTHROPIC_API_KEY" },
};

/** Что слушаем и какие ключи подключены. Монтируется при открытии, поэтому форма всегда свежая. */
export function SourcesModal({ onClose, sources, keys, errors = [] }: { onClose: () => void; sources: PulseSources; keys: PulseFeed["keys"] | null; errors?: string[] }) {
  const [form, setForm] = useState<Record<keyof PulseSources, string>>(() => toForm(sources));

  return (
    <Modal open onClose={onClose} title="Источники" wide>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="eyebrow mb-1.5 flex items-center gap-1.5">
              <ChannelGlyph id={f.net} size={11} />
              {f.label}
              {f.needs && keys && !keys[f.needs] && <span className="font-sans normal-case tracking-normal text-warn">нужен ключ</span>}
            </span>
            <textarea
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              rows={f.key === "xAccounts" ? 4 : 2}
              placeholder={f.placeholder}
              className={cx(fieldClass, "font-mono resize-y text-[12.5px] leading-relaxed")}
            />
          </label>
        ))}
      </div>
      <p className="mt-2 text-[12.5px] text-muted">По одному в строке. Референсы из «Плана» и наши вышедшие посты X слушаются сами.</p>
      {errors.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[12.5px] text-warn">
          {errors.slice(0, 6).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="mt-5 rounded-xl border border-line p-3">
        <div className="eyebrow mb-2">Ключи на Vercel</div>
        <ul className="space-y-1.5">
          {(Object.keys(ENV) as (keyof PulseFeed["keys"])[]).map((k) => (
            <li key={k} className="flex items-start gap-2 text-[13px]">
              {keys?.[k] ? <Check size={14} className="mt-0.5 shrink-0 text-good" /> : <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-white/25" />}
              <span className={keys?.[k] ? "text-ink-2" : "text-muted"}>
                {ENV[k].name} <span className="font-mono text-[11.5px] text-muted">{ENV[k].vars}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            const next = Object.fromEntries((Object.keys(form) as (keyof PulseSources)[]).map((k) => [k, lines(form[k])])) as unknown as PulseSources;
            savePulseSources(next);
            onClose();
          }}
        >
          Сохранить
        </Button>
      </div>
    </Modal>
  );
}

function toForm(s: PulseSources): Record<keyof PulseSources, string> {
  return Object.fromEntries((Object.keys(s) as (keyof PulseSources)[]).map((k) => [k, (s[k] ?? []).join("\n")])) as Record<keyof PulseSources, string>;
}

export { NETWORK_NAME };
