"use client";

import { AlertTriangle, Check, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  FORMATS,
  SNAPSHOT_HOURS,
  THRESHOLD,
  VERDICT_LABEL,
  fmtNum,
  lint,
  medianViews,
  pct,
  rates,
  snapshotLabel,
  verdictOf,
} from "@/lib/content";
import { CHANNELS, accountsOf } from "@/lib/meta";
import { addSnapshot, markPosted, removeSnapshot, updateTask, useApp } from "@/lib/store";
import { CHANNEL_IDS, FORMAT_IDS } from "@/lib/types";
import type { ChannelId, FormatId, MetricSnapshot, Task, Verdict } from "@/lib/types";
import { Button, ChannelGlyph, IconButton, Pills, cx, fieldClass } from "./ui";

const TONE: Record<"good" | "warn" | "crit" | "muted", string> = {
  good: "border-good/40 bg-good/10 text-good",
  warn: "border-warn/40 bg-warn/10 text-warn",
  crit: "border-crit/40 bg-crit/10 text-crit",
  muted: "border-white/10 bg-white/[0.04] text-muted",
};

export function FormatBadge({ id, size = "sm" }: { id?: FormatId; size?: "sm" | "xs" }) {
  const f = FORMATS[id ?? "other"];
  const none = !id || id === "other";
  return (
    <span
      title={f.hint}
      className={cx(
        "font-mono inline-flex shrink-0 items-center gap-1 rounded-md border uppercase tracking-[0.08em]",
        size === "xs" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[10.5px]",
        none ? TONE.crit : "border-accent/35 bg-accent/[0.1] text-accent-soft",
      )}
    >
      {f.code}
      <span className="normal-case tracking-normal">{none ? "нет рубрики" : f.name}</span>
    </span>
  );
}

/** Куда выходит пост: логотип соцсети, наш аккаунт и дубли. Без канала пост считается постом в X. */
export function Where({ task, className, compact }: { task: Task; className?: string; compact?: boolean }) {
  const { db } = useApp();
  const main: ChannelId = task.channelId ?? "x";
  const handle = accountsOf(db.channels[main])[0]?.handle;
  const extra = (task.alsoTo ?? []).filter((c) => c !== main);
  const title = [`${CHANNELS[main].name}${handle ? `, ${handle}` : ""}`, ...extra.map((c) => `дубль в ${CHANNELS[c].name}`)].join(" · ");
  return (
    <span title={title} className={cx("inline-flex shrink-0 items-center gap-1.5 text-ink-2", className)}>
      <span style={{ color: CHANNELS[main].color }}>
        <ChannelGlyph id={main} size={12} />
      </span>
      {!compact && <span>{handle ?? CHANNELS[main].name}</span>}
      {extra.map((c) => (
        <span key={c} style={{ color: CHANNELS[c].color }} className="opacity-80">
          <ChannelGlyph id={c} size={11} />
        </span>
      ))}
    </span>
  );
}

export function VerdictBadge({ verdict, size = "sm" }: { verdict: Verdict | null; size?: "sm" | "xs" }) {
  if (!verdict) return null;
  const v = VERDICT_LABEL[verdict];
  return (
    <span
      title={v.hint}
      className={cx(
        "font-mono inline-flex shrink-0 items-center rounded-md border uppercase tracking-[0.08em]",
        size === "xs" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[10.5px]",
        TONE[v.tone],
      )}
    >
      {v.label}
    </span>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow mb-2 flex items-baseline justify-between gap-3">
        <span>{label}</span>
        {hint && <span className="font-sans normal-case tracking-normal text-muted/80">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function RateCell({ value, min, label }: { value: number; min?: number; label: string }) {
  const bad = min !== undefined && value < min;
  return (
    <td className={cx("font-mono px-2 py-1.5 text-right text-[12.5px] tabular-nums", bad ? "text-crit" : "text-ink-2")} title={label}>
      {pct(value)}
    </td>
  );
}

function SnapshotForm({ taskId, taken }: { taskId: string; taken: number[] }) {
  const free = SNAPSHOT_HOURS.filter((h) => !taken.includes(h));
  const [hours, setHours] = useState<number>(free[0] ?? 24);
  const [v, setV] = useState({ views: "", likes: "", replies: "", reposts: "", bookmarks: "" });
  const n = (s: string) => Math.max(0, Math.round(Number(s.replace(/[^\d]/g, "")) || 0));
  const ok = n(v.views) > 0;
  const submit = () => {
    if (!ok) return;
    addSnapshot(taskId, { hours, views: n(v.views), likes: n(v.likes), replies: n(v.replies), reposts: n(v.reposts), bookmarks: n(v.bookmarks) });
    setV({ views: "", likes: "", replies: "", reposts: "", bookmarks: "" });
    const next = SNAPSHOT_HOURS.find((h) => h > hours && !taken.includes(h));
    if (next) setHours(next);
  };
  const cell = "font-mono w-full rounded-lg border border-line bg-white/[0.04] px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent/60";
  return (
    <div className="rounded-xl border border-dashed border-white/12 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] text-muted">Снимок</span>
        <Pills
          label="Момент"
          value={String(hours)}
          onChange={(h) => setHours(Number(h))}
          options={SNAPSHOT_HOURS.map((h) => ({ value: String(h), label: snapshotLabel(h) + (taken.includes(h) ? " ✓" : "") }))}
        />
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {(["views", "likes", "replies", "reposts", "bookmarks"] as const).map((k) => (
          <label key={k} className="block">
            <span className="mb-1 block text-[11px] text-muted">{{ views: "Views", likes: "Likes", replies: "Replies", reposts: "RT", bookmarks: "Bookmarks" }[k]}</span>
            <input
              inputMode="numeric"
              value={v[k]}
              onChange={(e) => setV({ ...v, [k]: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className={cell}
            />
          </label>
        ))}
      </div>
      <div className="mt-2 flex justify-end">
        <Button variant="primary" disabled={!ok} onClick={submit} className="h-9">
          <Plus size={15} />
          Записать {snapshotLabel(hours)}
        </Button>
      </div>
    </div>
  );
}

function MetricsTable({ task }: { task: Task }) {
  const list = [...(task.metrics ?? [])].sort((a, b) => a.hours - b.hours);
  if (!list.length) return null;
  const isRecipe = task.format === "howbuilt" || task.format === "prompt";
  const bmMin = isRecipe ? THRESHOLD.bookmarkRecipe : THRESHOLD.bookmarkDuel;
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-left">
        <thead>
          <tr className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">
            <th className="px-2 py-1.5 font-normal">Когда</th>
            <th className="px-2 py-1.5 text-right font-normal">Views</th>
            <th className="px-2 py-1.5 text-right font-normal">Like</th>
            <th className="px-2 py-1.5 text-right font-normal">Reply</th>
            <th className="px-2 py-1.5 text-right font-normal">Bookm.</th>
            <th className="px-2 py-1.5 text-right font-normal">RT/like</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {list.map((s: MetricSnapshot) => {
            const r = rates(s);
            return (
              <tr key={s.hours} className="border-t border-line">
                <td className="font-mono px-2 py-1.5 text-[12.5px] text-ink">{snapshotLabel(s.hours)}</td>
                <td className="font-mono px-2 py-1.5 text-right text-[12.5px] tabular-nums text-ink">{fmtNum(s.views)}</td>
                <RateCell value={r.likeRate} min={THRESHOLD.likeRate} label={`${s.likes} лайков`} />
                <RateCell value={r.replyRate} min={THRESHOLD.replyRate} label={`${s.replies} ответов`} />
                <RateCell value={r.bookmarkRate} min={bmMin} label={`${s.bookmarks} закладок`} />
                <RateCell value={r.rtLike} min={THRESHOLD.rtLike} label={`${s.reposts} репостов`} />
                <td className="px-1">
                  <IconButton label="Удалить снимок" onClick={() => removeSnapshot(task.id, s.hours)} className="size-7">
                    <Trash2 size={13} />
                  </IconButton>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LintList({ task, all }: { task: Task; all: Task[] }) {
  const issues = useMemo(() => lint(task, all), [task, all]);
  if (!issues.length)
    return (
      <div className="inline-flex items-center gap-1.5 text-[13px] text-good">
        <Check size={14} /> Линтер чист: можно выпускать.
      </div>
    );
  return (
    <ul className="space-y-1">
      {issues.map((i, k) => (
        <li key={k} className={cx("flex items-start gap-2 text-[13px]", i.level === "error" ? "text-crit" : "text-warn")}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span className="text-ink-2">{i.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Блок «Пост» в карточке задачи: рубрика, модель, текст, реплай, референсы, выход, метрики. */
export function PostFields({ task }: { task: Task }) {
  const { db } = useApp();
  const all = useMemo(() => Object.values(db.tasks), [db.tasks]);
  const median = useMemo(() => medianViews(all), [all]);
  const verdict = verdictOf(task, median);
  const first = (task.hook ?? "").split("\n")[0] ?? "";
  const f = FORMATS[task.format ?? "other"];

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="eyebrow">Пост</div>
        <div className="flex items-center gap-2">
          <FormatBadge id={task.format} />
          <VerdictBadge verdict={verdict} />
        </div>
      </div>

      <WhereFields task={task} />

      <Field label="Рубрика">
        <Pills
          label="Рубрика"
          value={task.format ?? "other"}
          onChange={(v) => updateTask(task.id, { format: v as FormatId })}
          options={FORMAT_IDS.map((id) => ({ value: id, label: `${FORMATS[id].code} ${FORMATS[id].name}` }))}
        />
        {f.hint && <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{f.hint}</p>}
      </Field>

      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <Field label="Модель">
          <input
            key={task.id + ":model"}
            defaultValue={task.model ?? ""}
            placeholder="Claude Opus 5.5"
            onBlur={(e) => {
              const model = e.target.value.trim();
              if (model !== (task.model ?? "")) updateTask(task.id, { model });
            }}
            className={fieldClass}
          />
        </Field>
        <Field label="Время">
          <input
            type="time"
            value={task.time ?? ""}
            onChange={(e) => updateTask(task.id, { time: e.target.value || undefined })}
            className={fieldClass}
          />
        </Field>
      </div>

      <Field label="Текст поста" hint={`первая строка ${first.length}/60`}>
        <textarea
          key={task.id + ":hook"}
          defaultValue={task.hook ?? ""}
          rows={2}
          placeholder={f.hook || "Модель в первой строке. ≤ 2 строк."}
          onBlur={(e) => {
            if (e.target.value !== (task.hook ?? "")) updateTask(task.id, { hook: e.target.value });
          }}
          className={cx(fieldClass, "font-mono resize-y text-[14px] leading-relaxed")}
        />
      </Field>

      <Field label="Первый комментарий">
        <textarea
          key={task.id + ":reply"}
          defaultValue={task.firstReply ?? ""}
          rows={3}
          placeholder={"Prompt:\n…\n\nBuilt with Quadcode AI → quadcode.ai"}
          onBlur={(e) => {
            if (e.target.value !== (task.firstReply ?? "")) updateTask(task.id, { firstReply: e.target.value });
          }}
          className={cx(fieldClass, "font-mono resize-y text-[13.5px] leading-relaxed")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Референсы">
          <textarea
            key={task.id + ":refs"}
            defaultValue={(task.refs ?? []).join("\n")}
            rows={Math.max(2, (task.refs ?? []).length)}
            placeholder="https://x.com/…"
            onBlur={(e) => {
              const refs = e.target.value.split(/\s+/).map((s) => s.trim()).filter(Boolean);
              if (refs.join("\n") !== (task.refs ?? []).join("\n")) updateTask(task.id, { refs });
            }}
            className={cx(fieldClass, "font-mono resize-y text-[12.5px] leading-relaxed")}
          />
          {!!task.refs?.length && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {task.refs.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-accent-soft hover:underline">
                  <ExternalLink size={11} />
                  {u.replace(/^https?:\/\/(www\.)?/, "").split("/status/")[0]}
                </a>
              ))}
            </div>
          )}
        </Field>
        <Field label="Видео в группе">
          <input
            key={task.id + ":video"}
            defaultValue={task.video ?? ""}
            placeholder="https://t.me/c/…"
            onBlur={(e) => {
              const video = e.target.value.trim();
              if (video !== (task.video ?? "")) updateTask(task.id, { video: video || undefined });
            }}
            className={cx(fieldClass, "font-mono text-[13px]")}
          />
          {task.video && (
            <a href={task.video} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-accent-soft hover:underline">
              <ExternalLink size={11} />
              открыть видео
            </a>
          )}
        </Field>
      </div>

      <Field label="Проверка перед выходом">
        <LintList task={task} all={all} />
      </Field>

      <Field label="Ссылка на вышедший пост">
        <input
          key={task.id + ":url"}
          defaultValue={task.postUrl ?? ""}
          placeholder="https://x.com/quadcode_ai/status/…"
          onBlur={(e) => {
            const url = e.target.value.trim();
            if (url !== (task.postUrl ?? "")) markPosted(task.id, url);
          }}
          className={cx(fieldClass, "font-mono text-[13px]")}
        />
      </Field>

      {task.postUrl && (
        <Field label="Метрики" hint={median ? `медиана 30 дней ${fmtNum(median)}` : "медианы пока нет: нужны снимки"}>
          <div className="space-y-2">
            <MetricsTable task={task} />
            <SnapshotForm taskId={task.id} taken={(task.metrics ?? []).map((s) => s.hours)} />
            {verdict && (
              <p className="text-[12.5px] text-muted">
                <span className="text-ink-2">{VERDICT_LABEL[verdict].label}.</span> {VERDICT_LABEL[verdict].hint}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[12.5px] text-muted">Вердикт вручную:</span>
              <Pills
                label="Вердикт"
                value={task.verdict ?? "auto"}
                onChange={(v) => updateTask(task.id, { verdict: v === "auto" ? undefined : (v as Verdict) })}
                options={[
                  { value: "auto", label: "По правилам" },
                  ...(Object.keys(VERDICT_LABEL) as Verdict[]).map((v) => ({ value: v, label: VERDICT_LABEL[v].label })),
                ]}
              />
            </div>
          </div>
        </Field>
      )}
    </div>
  );
}

/** Где выходит пост: основная соцсеть (с неё снимаем метрики) и куда дублируем. */
function WhereFields({ task }: { task: Task }) {
  const { db } = useApp();
  const main: ChannelId = task.channelId ?? "x";
  const also = task.alsoTo ?? [];
  const chip = (c: ChannelId, on: boolean) => (
    <span className="inline-flex items-center gap-1.5">
      <span style={{ color: on ? CHANNELS[c].color : undefined }}>
        <ChannelGlyph id={c} size={13} />
      </span>
      {CHANNELS[c].name}
      {c === main && accountsOf(db.channels[c])[0] && <span className="text-muted">{accountsOf(db.channels[c])[0].handle}</span>}
    </span>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Где выходит">
        <Pills
          label="Где выходит"
          value={main}
          onChange={(c) => updateTask(task.id, { channelId: c, alsoTo: also.filter((x) => x !== c) })}
          options={CHANNEL_IDS.map((c) => ({ value: c, label: chip(c, c === main) }))}
        />
      </Field>
      <Field label="Дубль">
        <div className="inline-flex flex-wrap items-center gap-1.5">
          {CHANNEL_IDS.filter((c) => c !== main).map((c) => {
            const on = also.includes(c);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() => updateTask(task.id, { alsoTo: on ? also.filter((x) => x !== c) : [...also, c] })}
                className={cx(
                  "press inline-flex h-8 items-center gap-1.5 rounded-[10px] border px-3 text-[13.5px] font-medium",
                  on ? "border-accent/50 bg-accent/[0.12] text-ink" : "border-white/10 bg-white/[0.035] text-muted hover:border-white/20 hover:text-ink",
                )}
              >
                {chip(c, on)}
              </button>
            );
          })}
        </div>
      </Field>
    </div>
  );
}
