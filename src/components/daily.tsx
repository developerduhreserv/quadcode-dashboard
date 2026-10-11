"use client";

import { Check, Pin } from "lucide-react";
import { addDays, dayKey, statsByAccount } from "@/lib/analytics";
import { todayStart } from "@/lib/cycles";
import { useNow } from "@/lib/hooks";
import { accountsOf } from "@/lib/meta";
import { toggleDaily, useApp } from "@/lib/store";
import type { ChannelId, DB, Task } from "@/lib/types";
import { useShell } from "./AppShell";
import { Avatar, Button, ChannelIcon, cx } from "./ui";

export function dailyTasks(tasks: Record<string, Task>): Task[] {
  return Object.values(tasks)
    .filter((t) => t.daily)
    .sort((a, b) => a.order - b.order);
}

/** Сколько дней подряд задача сделана. Если сегодня ещё нет, считаем от вчера. */
function streakOf(t: Task, now: number): number {
  const days = t.doneDays ?? {};
  let n = 0;
  let ts = days[dayKey(now)] !== undefined ? now : addDays(now, -1);
  while (days[dayKey(ts)] !== undefined) {
    n++;
    ts = addDays(ts, -1);
  }
  return n;
}

/** Счёт по аккаунтам канала, у которых указан владелец. Свой аккаунт первым. «Сегодня» как на странице канала. */
function ownedAccounts(db: DB, channelId: ChannelId | null, me: string | null, now: number) {
  if (!channelId) return [];
  const ch = db.channels[channelId];
  const all = accountsOf(ch);
  const owned = all.filter((a) => a.memberId && db.members[a.memberId]);
  if (!owned.length) return [];
  const stats = statsByAccount(db, channelId, all.map((a) => a.handle), now, todayStart(channelId, ch, now));
  return owned
    .map((a) => ({ ...a, member: db.members[a.memberId], ...stats[a.handle] }))
    .sort((x, y) => Number(y.memberId === me) - Number(x.memberId === me));
}

/** Закреп сверху: обязательные ежедневные задачи с отметкой за сегодня. */
export function DailyStrip() {
  const { db, me } = useApp();
  const shell = useShell();
  const now = useNow();
  const today = dayKey(now);
  const list = dailyTasks(db.tasks);
  if (!list.length) return null;
  const done = list.filter((t) => t.doneDays?.[today] !== undefined).length;

  return (
    <section
      aria-label="Каждый день"
      className="rounded-[20px] border border-accent/35 bg-panel p-3 shadow-[0_0_0_4px_rgb(var(--glow)/0.06)] sm:p-4"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2.5">
          <Pin size={15} className="text-accent" />
          <h2 className="font-display text-[16px] font-medium">Каждый день</h2>
        </div>
        <span className="text-[13px] tabular-nums text-muted">
          <span className="font-medium text-ink">{done}</span> из {list.length} сегодня
        </span>
      </header>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {list.map((t) => {
          const by = t.doneDays?.[today];
          const isDone = by !== undefined;
          const who = by ? db.members[by]?.name : null;
          const streak = streakOf(t, now);
          const owned = ownedAccounts(db, t.channelId, me, now);
          return (
            <article
              key={t.id}
              onClick={() => shell.openTask(t.id)}
              className={cx(
                // flex-col и mt-auto у низа: кнопки «Выполнено» в одной строке, даже если карточка выше соседних
                "flex cursor-pointer flex-col rounded-2xl border p-3.5 transition-[transform,border-color,background-color] duration-300 ease-out-quint hover:-translate-y-0.5",
                isDone ? "border-accent/40 bg-accent/[0.07]" : "border-line bg-white/[0.035] hover:border-line-2 hover:bg-white/[0.06]",
              )}
            >
              <div className="flex items-start gap-2.5">
                {t.channelId && <ChannelIcon id={t.channelId} size={22} />}
                <span className={cx("min-w-0 flex-1 text-[14.5px] leading-snug", isDone ? "text-muted" : "text-ink")}>{t.title}</span>
              </div>
              {owned.length > 0 && (
                <ul className="mt-2.5 space-y-1" aria-label="По аккаунтам">
                  {owned.map((a) => (
                    <li
                      key={a.handle}
                      title={`${a.label || a.member.name}: сегодня ${a.today}, охвачено ${a.sent} из ${a.total}`}
                      className={cx("flex items-center gap-2 text-[12.5px]", a.memberId === me ? "text-ink-2" : "text-muted")}
                    >
                      <Avatar member={a.member} size={18} />
                      <span className="min-w-0 flex-1 truncate">{a.handle}</span>
                      <span className="shrink-0 tabular-nums">
                        <span className="font-medium text-ink">{a.today}</span> сегодня · {a.sent} из {a.total}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                {isDone ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-soft">
                      <Check size={15} strokeWidth={3} />
                      Выполнено{who ? `, ${who}` : ""}
                    </span>
                    <Button
                      variant="ghost"
                      className="h-8 px-3 text-[12.5px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleDaily(t.id, today, false);
                      }}
                    >
                      Отменить
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-[12.5px] text-muted">{streak > 0 ? `${streak} дн. подряд` : ""}</span>
                    <Button
                      variant="primary"
                      className="h-8 px-3.5 text-[13px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleDaily(t.id, today, true);
                      }}
                    >
                      <Check size={15} strokeWidth={3} />
                      Выполнено
                    </Button>
                  </>
                )}
              </div>
              {isDone && streak > 1 && <div className="mt-1 text-[12px] text-muted">{streak} дн. подряд</div>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
