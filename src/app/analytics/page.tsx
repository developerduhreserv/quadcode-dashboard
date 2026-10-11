"use client";

import { useMemo, useState } from "react";
import { useShell } from "@/components/AppShell";
import { FormatBadge, VerdictBadge } from "@/components/post";
import { Empty, PageHead, Panel, Pills, Tile, cx } from "@/components/ui";
import { shortDate } from "@/lib/analytics";
import {
  THRESHOLD,
  fmtNum,
  isPost,
  isPublished,
  lastSnapshot,
  medianViews,
  pct,
  postedAt,
  rates,
  snapshotLabel,
  verdictOf,
} from "@/lib/content";
import { useApp } from "@/lib/store";
import type { FormatId, Task } from "@/lib/types";

const DAY = 86_400_000;
type Range = "7" | "30" | "90";

/**
 * «Результаты»: что сработало, что нет, что повторять.
 * Только вышедшие посты и их цифры. Никаких метрик активности команды.
 */
export default function ResultsPage() {
  const { db } = useApp();
  const shell = useShell();
  const [range, setRange] = useState<Range>("30");

  const all = useMemo(() => Object.values(db.tasks), [db.tasks]);
  const median = useMemo(() => medianViews(all, Number(range)), [all, range]);
  const posts = useMemo(() => {
    const from = Date.now() - Number(range) * DAY;
    return all
      .filter((t) => isPost(t) && isPublished(t) && (postedAt(t) ?? 0) >= from)
      .sort((a, b) => (postedAt(b) ?? 0) - (postedAt(a) ?? 0));
  }, [all, range]);

  const withData = posts.filter((t) => lastSnapshot(t));
  const withBm = withData.filter((t) => (lastSnapshot(t)?.bookmarks ?? 0) > 0).length;
  const verdicts = posts.map((t) => verdictOf(t, median));
  const hits = verdicts.filter((v) => v === "hit" || v === "boost").length;
  const dead = verdicts.filter((v) => v === "dead").length;
  const noData = posts.length - withData.length;

  // Медиана views по рубрике: какую рубрику ставить чаще
  const byFormat = useMemo(() => {
    const m = new Map<FormatId, number[]>();
    for (const t of withData) {
      const f = t.format ?? "other";
      m.set(f, [...(m.get(f) ?? []), lastSnapshot(t)!.views]);
    }
    return [...m.entries()]
      .map(([f, xs]) => {
        const s = [...xs].sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        return { f, n: s.length, median: s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2) };
      })
      .sort((a, b) => b.median - a.median);
  }, [withData]);
  const maxFormat = Math.max(1, ...byFormat.map((x) => x.median));

  return (
    <div className="stagger space-y-4">
      <PageHead
        title="Результаты"
        right={
          <Pills
            label="Период"
            value={range}
            onChange={setRange}
            options={[
              { value: "7", label: "7 дней" },
              { value: "30", label: "30 дней" },
              { value: "90", label: "90 дней" },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Медиана views" value={median ? fmtNum(median) : "—"} sub="цель ≥ 1 000" highlight={median >= 1000} />
        <Tile label="Постов с закладками" value={withData.length ? `${Math.round((withBm / withData.length) * 100)}%` : "—"} sub="цель ≥ 70%" highlight={withData.length > 0 && withBm / withData.length >= 0.7} />
        <Tile label="Вышло постов" value={posts.length} sub={noData ? `${noData} без метрик` : "у всех есть метрики"} />
        <Tile label="Хиты / умерли" value={`${hits} / ${dead}`} sub="хит ≥ 3× медианы" />
      </div>

      <Panel title="Вышедшие посты">
        {posts.length === 0 ? (
          <Empty title="Пока ничего не вышло" />
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="text-left font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                  <th className="px-2 py-2 font-normal">Дата</th>
                  <th className="px-2 py-2 font-normal">Пост</th>
                  <th className="px-2 py-2 text-right font-normal">Views</th>
                  <th className="px-2 py-2 text-right font-normal">Like</th>
                  <th className="px-2 py-2 text-right font-normal">Reply</th>
                  <th className="px-2 py-2 text-right font-normal">Закладки</th>
                  <th className="px-2 py-2 font-normal">Вердикт</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((t) => (
                  <ResultRow key={t.id} task={t} median={median} onOpen={() => shell.openTask(t.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Рубрики по медиане views">
        {byFormat.length === 0 ? (
          <Empty title="Нет данных" />
        ) : (
          <ul className="space-y-2.5">
            {byFormat.map(({ f, n, median: m }) => (
              <li key={f} className="flex items-center gap-3">
                <span className="w-40 shrink-0">
                  <FormatBadge id={f} size="xs" />
                </span>
                <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${(m / maxFormat) * 100}%` }} />
                </span>
                <span className="w-24 shrink-0 text-right font-mono text-[12px] tabular-nums text-ink-2">
                  {fmtNum(m)} <span className="text-muted">· {n}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function ResultRow({ task, median, onOpen }: { task: Task; median: number; onOpen: () => void }) {
  const s = lastSnapshot(task);
  const r = s ? rates(s) : null;
  const at = postedAt(task);
  const low = (bad: boolean) => cx("px-2 py-2.5 text-right font-mono tabular-nums", bad ? "text-crit" : "text-ink-2");
  return (
    <tr onClick={onOpen} className="cursor-pointer border-t border-line transition-colors hover:bg-white/[0.04]">
      <td className="whitespace-nowrap px-2 py-2.5 text-muted">{at ? shortDate(at) : "—"}</td>
      <td className="max-w-[340px] px-2 py-2.5">
        <div className="truncate text-ink">{task.title}</div>
        <div className="truncate text-[11.5px] text-muted">
          {task.model ?? "модель не указана"}
          {s ? ` · ${snapshotLabel(s.hours)}` : ""}
        </div>
      </td>
      {s && r ? (
        <>
          <td className="px-2 py-2.5 text-right font-mono tabular-nums text-ink">{fmtNum(s.views)}</td>
          <td className={low(r.likeRate < THRESHOLD.likeRate)}>{pct(r.likeRate)}</td>
          <td className={low(r.replyRate < THRESHOLD.replyRate)}>{pct(r.replyRate)}</td>
          <td className={low(r.bookmarkRate < THRESHOLD.bookmarkDuel)}>{pct(r.bookmarkRate)}</td>
        </>
      ) : (
        <td colSpan={4} className="px-2 py-2.5 text-right text-[12px] text-warn">
          нет метрик, снимите в карточке
        </td>
      )}
      <td className="px-2 py-2.5">
        <VerdictBadge verdict={verdictOf(task, median)} size="xs" />
      </td>
    </tr>
  );
}
