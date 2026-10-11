"use client";

import { AlertTriangle, Bookmark, ChevronLeft, ChevronRight, Link2, Plus, Radar, Trash2, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { useShell } from "@/components/AppShell";
import { FormatBadge, VerdictBadge, Where } from "@/components/post";
import { Avatar, Button, Empty, IconButton, Meter, Modal, PageHead, Panel, Pills, cx, fieldClass, toast } from "@/components/ui";
import { addDays, dayKey, shortDate, startOfDay } from "@/lib/analytics";
import {
  FORMATS,
  FORMAT_GROUP_LABEL,
  QUOTA,
  WINDOW_LABEL,
  fmtNum,
  isPost,
  isPublished,
  lastSnapshot,
  lint,
  medianViews,
  quotaFill,
  releaseTs,
  verdictOf,
  windowAt,
} from "@/lib/content";
import type { FormatGroup } from "@/lib/content";
import { applyReleaseProtocol, deleteRelease, saveRelease, useApp } from "@/lib/store";
import type { Release, Task } from "@/lib/types";

const WEEKDAY = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function monday(ts: number): number {
  const d = startOfDay(ts);
  const dow = new Date(d).getDay();
  return addDays(d, dow === 0 ? -6 : 1 - dow);
}

export default function PlanPage() {
  const { db } = useApp();
  const shell = useShell();
  const [week, setWeek] = useState(() => monday(Date.now()));
  const [release, setRelease] = useState<Release | "new" | null>(null);

  const all = useMemo(() => Object.values(db.tasks), [db.tasks]);
  const posts = useMemo(() => all.filter((t) => isPost(t) && !t.daily), [all]);
  const releases = db.meta.releases ?? [];
  const median = useMemo(() => medianViews(all), [all]);
  const today = dayKey(Date.now());

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const weekPosts = useMemo(() => {
    const from = dayKey(week);
    const to = dayKey(addDays(week, 6));
    return posts.filter((t) => t.due && t.due >= from && t.due <= to);
  }, [posts, week]);
  const quota = useMemo(() => quotaFill(weekPosts), [weekPosts]);

  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of weekPosts) {
      const list = m.get(t.due!) ?? [];
      list.push(t);
      m.set(t.due!, list);
    }
    for (const list of m.values()) list.sort((a, b) => (a.time ?? "99") < (b.time ?? "99") ? -1 : 1);
    return m;
  }, [weekPosts]);

  return (
    <div className="stagger">
      <PageHead
        title="План"
        right={
          <>
            <Button onClick={() => setRelease("new")}>
              <Radar size={15} />
              Релиз
            </Button>
            <Button variant="primary" onClick={() => shell.openAdd({ channelId: "x", due: today, time: "15:00" })}>
              <Plus size={16} />
              Пост
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <IconButton label="Предыдущая неделя" onClick={() => setWeek(addDays(week, -7))}>
            <ChevronLeft size={18} />
          </IconButton>
          <button type="button" onClick={() => setWeek(monday(Date.now()))} className="font-display px-2 text-[16px] font-medium text-ink hover:text-accent-soft">
            {shortDate(week)} – {shortDate(addDays(week, 6))}
          </button>
          <IconButton label="Следующая неделя" onClick={() => setWeek(addDays(week, 7))}>
            <ChevronRight size={18} />
          </IconButton>
        </div>
        <span className="text-[12.5px] text-muted">{weekPosts.length} постов</span>
      </div>

      <WeekGrid days={days} byDay={byDay} today={today} releases={releases} all={all} median={median} />

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Релизы моделей">
          {releases.length === 0 ? (
            <Empty title="Релизов нет" />
          ) : (
            <ul className="space-y-2">
              {releases.map((r) => {
                const w = windowAt(Date.now(), [r]);
                const hours = Math.round((Date.now() - releaseTs(r)) / 3_600_000);
                const state = w?.state ?? (hours < 0 ? "before" : "closed");
                const inDays = Math.ceil(-hours / 24);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-white/[0.03] px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-[15px] font-medium text-ink">{r.model}</span>
                        <span className="text-[12.5px] text-muted">{r.vendor}</span>
                        {!r.confirmed && (
                          <span className="font-mono rounded-md border border-warn/40 bg-warn/10 px-1.5 py-px text-[10px] uppercase tracking-[0.08em] text-warn">слух</span>
                        )}
                        <span
                          className={cx(
                            "font-mono rounded-md border px-1.5 py-px text-[10px] uppercase tracking-[0.08em]",
                            state === "open" || state === "day0"
                              ? "border-good/40 bg-good/10 text-good"
                              : state === "tail"
                                ? "border-accent/35 bg-accent/[0.1] text-accent-soft"
                                : "border-white/10 bg-white/[0.04] text-muted",
                          )}
                        >
                          {state === "before" ? `через ${inDays} ${inDays === 1 ? "день" : inDays < 5 ? "дня" : "дней"}` : WINDOW_LABEL[state]}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[12.5px] text-muted">
                        {shortDate(releaseTs(r))}
                        {r.note ? ` · ${r.note}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        className="h-8 px-3 text-[13px]"
                        onClick={async () => {
                          const n = await applyReleaseProtocol(r.id);
                          toast(n ? `Создано ${n} слотов протокола` : "Слоты протокола уже есть", 1800, { wait: !n });
                        }}
                        title="Создать 5 слотов по протоколу релиза"
                      >
                        <Zap size={14} />
                        Протокол
                      </Button>
                      {r.source && (
                        <IconButton label="Источник" onClick={() => window.open(r.source, "_blank")}>
                          <Link2 size={15} />
                        </IconButton>
                      )}
                      <IconButton label="Изменить" onClick={() => setRelease(r)}>
                        <Radar size={15} />
                      </IconButton>
                      <IconButton label="Удалить" onClick={() => deleteRelease(r.id)}>
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Баланс недели">
          <div className="space-y-3">
            {(Object.keys(QUOTA) as FormatGroup[]).map((g) => {
              const q = quota[g];
              const color = g === "reach" ? "var(--accent)" : g === "engage" ? "var(--good)" : "var(--warn)";
              return (
                <div key={g}>
                  <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                    <span className="text-ink-2">
                      {FORMAT_GROUP_LABEL[g]}{" "}
                      <span className="font-mono text-[11px] text-muted">
                        {Object.values(FORMATS)
                          .filter((f) => f.group === g && f.code !== "—")
                          .map((f) => f.code)
                          .join(" ")}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-muted">
                      {q.have} / {q.want}
                    </span>
                  </div>
                  <Meter value={q.have} max={Math.max(1, q.want)} color={color} />
                </div>
              );
            })}
            {weekPosts.some((t) => !t.format || t.format === "other") && (
              <p className="pt-1 text-[12.5px] text-crit">Без рубрики: {weekPosts.filter((t) => !t.format || t.format === "other").length}</p>
            )}
          </div>
        </Panel>
      </div>

      <ReleaseModal value={release} onClose={() => setRelease(null)} />
    </div>
  );
}

function WeekGrid({
  days,
  byDay,
  today,
  releases,
  all,
  median,
}: {
  days: number[];
  byDay: Map<string, Task[]>;
  today: string;
  releases: Release[];
  all: Task[];
  median: number;
}) {
  const shell = useShell();
  return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        {days.map((d) => {
          const key = dayKey(d);
          const list = byDay.get(key) ?? [];
          const w = windowAt(d + 12 * 3_600_000, releases);
          const isToday = key === today;
          const past = key < today;
          return (
            <section
              key={key}
              className={cx(
                "flex min-h-[200px] flex-col rounded-[18px] border bg-panel p-2.5 transition-colors duration-300",
                isToday ? "border-accent/60" : "border-line",
                past && "opacity-80",
              )}
            >
              <header className="mb-2 flex items-start justify-between gap-2 px-1">
                <div>
                  <div className={cx("font-display text-[15px] font-medium leading-none", isToday ? "grad-text" : "text-ink")}>
                    {WEEKDAY[new Date(d).getDay()]} {new Date(d).getDate()}
                  </div>
                  {w && (
                    <div
                      className={cx(
                        "mt-1.5 inline-flex max-w-full items-center gap-1 truncate rounded-md border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.06em]",
                        w.state === "open" || w.state === "day0" ? "border-good/40 bg-good/10 text-good" : "border-accent/35 bg-accent/[0.1] text-accent-soft",
                      )}
                      title={`${w.release.model}: ${WINDOW_LABEL[w.state]}`}
                    >
                      <Radar size={10} />
                      <span className="truncate normal-case tracking-normal">{w.release.model}</span>
                    </div>
                  )}
                </div>
                <IconButton label="Добавить слот" className="size-7" onClick={() => shell.openAdd({ channelId: "x", due: key, time: list.length ? "23:00" : "15:00" })}>
                  <Plus size={15} />
                </IconButton>
              </header>

              <div className="flex flex-1 flex-col gap-1.5">
                {list.map((t) => (
                  <SlotCard key={t.id} task={t} all={all} median={median} onOpen={() => shell.openTask(t.id)} />
                ))}
                {list.length === 0 && (
                  <button
                    type="button"
                    onClick={() => shell.openAdd({ channelId: "x", due: key, time: "15:00" })}
                    className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 text-[12.5px] text-muted transition-colors hover:border-accent/40 hover:text-ink"
                  >
                    пусто
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
  );
}

function SlotCard({ task, all, median, onOpen }: { task: Task; all: Task[]; median: number; onOpen: () => void }) {
  const { db } = useApp();
  const issues = lint(task, all);
  const errors = issues.filter((i) => i.level === "error").length;
  const published = isPublished(task);
  const snap = lastSnapshot(task);
  const verdict = verdictOf(task, median);
  const member = task.assigneeId ? db.members[task.assigneeId] : null;
  return (
    <article
      onClick={onOpen}
      className={cx(
        "cursor-pointer rounded-xl border border-line bg-white/[0.035] p-2.5 transition-[transform,border-color,background-color,box-shadow] duration-300 ease-out-quint hover:-translate-y-0.5 hover:border-line-2 hover:bg-white/[0.06] hover:shadow-[0_14px_30px_-20px_rgba(0,0,0,0.9)]",
        published && "border-good/30",
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[11.5px] text-muted">
          <span className="font-mono">{task.time ?? "—"}</span>
          <Where task={task} compact />
        </span>
        <div className="flex items-center gap-1">
          {published ? (
            <VerdictBadge verdict={verdict ?? "ok"} size="xs" />
          ) : errors > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-crit" title={issues.map((i) => i.text).join("\n")}>
              <AlertTriangle size={11} />
              {errors}
            </span>
          ) : (
            <span className="size-1.5 rounded-full bg-good" title="Линтер чист" />
          )}
          {member && <Avatar member={member} size={16} />}
        </div>
      </div>
      <FormatBadge id={task.format} size="xs" />
      <div className={cx("mt-1.5 text-[13px] leading-snug", published ? "text-ink-2" : "text-ink")}>{task.title}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted">
        {task.model && <span className="truncate">{task.model}</span>}
        {!!task.refs?.length && (
          <span className="inline-flex items-center gap-0.5">
            <Link2 size={10} />
            {task.refs.length}
          </span>
        )}
        {snap && (
          <span className="font-mono inline-flex items-center gap-1 tabular-nums text-ink-2">
            {fmtNum(snap.views)}
            <Bookmark size={10} />
            {snap.bookmarks}
          </span>
        )}
      </div>
    </article>
  );
}

function ReleaseModal({ value, onClose }: { value: Release | "new" | null; onClose: () => void }) {
  const editing = value && value !== "new" ? value : null;
  const [form, setForm] = useState<Omit<Release, "id">>({ model: "", vendor: "", date: dayKey(Date.now()), confirmed: false, source: "", note: "" });
  const [key, setKey] = useState<string | null>(null);
  const openKey = value === null ? null : editing ? editing.id : "new";
  if (openKey !== key) {
    setKey(openKey);
    if (editing) setForm({ model: editing.model, vendor: editing.vendor, date: editing.date, confirmed: editing.confirmed, source: editing.source, note: editing.note ?? "" });
    else if (openKey === "new") setForm({ model: "", vendor: "", date: dayKey(Date.now()), confirmed: false, source: "", note: "" });
  }
  const ok = form.model.trim() && /^\d{4}-\d{2}-\d{2}$/.test(form.date);
  return (
    <Modal open={value !== null} onClose={onClose} title={editing ? "Релиз" : "Новый релиз"}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="eyebrow mb-2 block">Модель</span>
            <input data-autofocus="" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Claude Opus 6" className={fieldClass} />
          </label>
          <label className="block">
            <span className="eyebrow mb-2 block">Вендор</span>
            <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Anthropic" className={fieldClass} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="eyebrow mb-2 block">Дата</span>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={fieldClass} />
          </label>
          <div>
            <span className="eyebrow mb-2 block">Статус</span>
            <Pills
              label="Статус"
              value={form.confirmed ? "yes" : "no"}
              onChange={(v) => setForm({ ...form, confirmed: v === "yes" })}
              options={[
                { value: "no", label: "Слух" },
                { value: "yes", label: "Подтверждён" },
              ]}
            />
          </div>
        </div>
        <label className="block">
          <span className="eyebrow mb-2 block">Источник</span>
          <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="https://x.com/…" className={cx(fieldClass, "font-mono text-[13px]")} />
        </label>
        <label className="block">
          <span className="eyebrow mb-2 block">Заметка</span>
          <input value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Что известно, что уточнить" className={fieldClass} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() => {
              saveRelease({ ...(editing ? { id: editing.id } : {}), ...form, model: form.model.trim(), vendor: form.vendor.trim(), source: form.source.trim(), note: form.note?.trim() || undefined });
              onClose();
            }}
          >
            {editing ? "Сохранить" : "Добавить в радар"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
