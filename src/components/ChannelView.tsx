"use client";

import { ChevronDown, Clock3, Download, ExternalLink, Link2Off, MessageSquareText, Pencil, Plus, Repeat, Search, Settings, Star, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AccountStats } from "@/lib/analytics";
import { channelStats, statsByAccount, todayByAccount } from "@/lib/analytics";
import * as clock from "@/lib/clock";
import type { Mark } from "@/lib/cycles";
import { COOLDOWN_HOURS, atText, cycleAt, cycleCfg, cyclesOn, markOf, todayStart, waitText } from "@/lib/cycles";
import { useEdgeFade, useFlip, useMedia, useNow, useStored } from "@/lib/hooks";
import { CHANNELS, STAGE_LABEL, accountTabKey, accountsOf, plural } from "@/lib/meta";
import { download, targetsCSV } from "@/lib/exporter";
import {
  deleteTarget,
  setCooldown,
  setVia,
  setStage,
  touchTarget,
  untouchTarget,
  updateChannel,
  updateTarget,
  useApp,
} from "@/lib/store";
import { CHANNEL_IDS, STAGES } from "@/lib/types";
import type { ChannelAccount, ChannelId, Member, Stage, Target } from "@/lib/types";
import { AccountsModal } from "./AccountsModal";
import { useShell } from "./AppShell";
import { CycleTimer, CyclesModal } from "./cycles";
import { ImportModal } from "./ImportModal";
import { MessageModal } from "./MessageModal";
import { QuickCapture, TaskRow, sortOpen } from "./tasks";
import {
  Avatar,
  Button,
  ChannelIcon,
  CheckCircle,
  Empty,
  IconButton,
  Meter,
  Modal,
  Num,
  PageHead,
  Panel,
  Pills,
  Segments,
  Tile,
  cx,
  fieldClass,
  toast,
} from "./ui";

type Filter = "all" | "new" | "sent" | "replied" | "star";

/** Список с кругами: свободные, отмеченные в этом круге и ждущие кулдаун. */
interface Sections {
  open: Target[];
  sent: Target[];
  wait: Target[];
}

/** Столбец списка: аккаунт канала или «Без аккаунта» (key = ""). */
interface Lane {
  key: string;
  account: ChannelAccount | null;
}

export function ChannelView({ id }: { id: ChannelId }) {
  const { db, me } = useApp();
  const shell = useShell();
  const now = useNow();
  const ch = db.channels[id];
  const meta = CHANNELS[id];
  // Круги: галочка значит «отмечено в текущем круге». «Сегодня» считаем по суткам того же пояса
  const cycles = cyclesOn(id, ch);
  const cfg = cycleCfg(ch);
  const cycle = cycles ? cycleAt(now, cfg) : null;
  const cyc: RowCycle | null = cycle ? { start: cycle.start, hours: cfg.hours, tz: cfg.tz, at: now } : null;
  const dayStart = todayStart(id, ch, now);
  const stats = channelStats(db, id, now, dayStart);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  // «+ ссылка» открывает «Изменить» сразу с курсором в поле «Ссылка»
  const [editLink, setEditLink] = useState(false);
  const [texting, setTexting] = useState<string | null>(null);
  const [editAccounts, setEditAccounts] = useState(false);
  const [editCycles, setEditCycles] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const accountList = accountsOf(ch);
  const accounts = accountList.map((a) => a.handle);
  const multi = accounts.length >= 2;
  const perAccount = todayByAccount(db, id, now, dayStart, accounts);
  // От 1024 px аккаунты идут столбцами, уже переключаются сегментами
  const wide = useMedia("(min-width: 1024px)");
  const columns = multi && wide;
  const [storedTab, setTab] = useStored(accountTabKey(id));
  // Блок «Отправлено в этом круге» можно свернуть, выбор помним в этом браузере
  const [sentFold, setSentFold] = useStored(`qcai.${id}.sentCollapsed`);
  const sentCollapsed = sentFold === "1";

  const targets = useMemo(
    () =>
      Object.values(db.targets)
        .filter((t) => t.channelId === id)
        .sort((a, b) => a.order - b.order),
    [db.targets, id],
  );
  const needle = q.trim().toLowerCase();
  // Фильтры и поиск общие: работают и в обычном списке, и во всех столбцах сразу
  const shown = targets.filter((t) => {
    if (filter === "new" && t.stage !== "new") return false;
    if (filter === "sent" && t.touches === 0) return false;
    if (filter === "replied" && t.at.replied === undefined) return false;
    if (filter === "star" && !t.starred) return false;
    if (needle && !`${t.title} ${t.note} ${t.offer}`.toLowerCase().includes(needle)) return false;
    return true;
  });
  const tasks = Object.values(db.tasks)
    .filter((t) => t.channelId === id && t.status !== "done")
    .sort(sortOpen);
  const left = targets.filter((t) => t.stage === "new").length;
  const inCycle = (t: Target) => cycle !== null && t.lastTouchAt !== null && t.lastTouchAt >= cycle.start;
  const markedNow = cycle ? targets.filter(inCycle).length : 0;
  // Свободны в этом круге: не отмечены и не ждут кулдаун
  const openNow = cyc ? targets.filter((t) => markOf(t, cyc, cyc.at).state === "empty").length : 0;

  /**
   * С кругами список делится на три части: сверху ещё не отмеченные (как раньше, по порядку),
   * ниже отмеченные в этом круге (по времени отметки, последний в конце), в самом низу ждущие кулдаун.
   * В новом круге отметки гаснут, и чаты сами возвращаются на свои места.
   */
  const arrange = (items: Target[]): Sections => {
    if (!cyc) return { open: items, sent: [], wait: [] };
    const out: Sections = { open: [], sent: [], wait: [] };
    for (const t of items) {
      const m = markOf(t, cyc, cyc.at);
      (m.state === "marked" ? out.sent : m.state === "locked" ? out.wait : out.open).push(t);
    }
    const byTouch = (a: Target, b: Target) => (a.lastTouchAt ?? 0) - (b.lastTouchAt ?? 0);
    out.sent.sort(byTouch);
    out.wait.sort(byTouch);
    return out;
  };
  const sectionKey = (s: Sections) => [s.open, s.sent, s.wait].map((x) => x.map((t) => t.id).join()).join("|");
  const sectioned = (s: Sections, row: (t: Target) => ReactNode): ReactNode => (
    <>
      {s.open.map(row)}
      {s.sent.length > 0 && (
        <SectionDivider
          label="Отправлено в этом круге"
          count={s.sent.length}
          collapsed={sentCollapsed}
          onToggle={() => setSentFold(sentCollapsed ? "0" : "1")}
        />
      )}
      {!sentCollapsed && s.sent.map(row)}
      {s.wait.length > 0 && <SectionDivider label="Ждут кулдаун" count={s.wait.length} />}
      {s.wait.map(row)}
    </>
  );

  // Цель без аккаунта или с ником, которого уже нет в списке, попадает в «Без аккаунта»
  const byAccount = statsByAccount(db, id, accounts, now, dayStart);
  const laneOf = (t: Target) => (t.via && accounts.includes(t.via) ? t.via : "");
  const lanes: Lane[] = multi
    ? [...accountList.map((a) => ({ key: a.handle, account: a })), ...(byAccount[""].total > 0 ? [{ key: "", account: null }] : [])]
    : [];
  const mine = accountList.find((a) => a.memberId && a.memberId === me)?.handle;
  const tabOk = (v: string | null): v is string =>
    v === "all" || (v === "none" ? byAccount[""].total > 0 : !!v && accounts.includes(v));
  const tab = tabOk(storedTab) ? storedTab : (mine ?? "all");
  const tabLane = tab === "all" ? null : (lanes.find((l) => l.key === (tab === "none" ? "" : tab)) ?? null);
  const list = multi && !columns && tabLane ? shown.filter((t) => laneOf(t) === tabLane.key) : shown;
  const listParts = arrange(list);
  const memberOf = (a: ChannelAccount | null): Member | undefined => (a?.memberId ? db.members[a.memberId] : undefined);
  const laneMarked = (key: string) => (cycle ? targets.filter((t) => laneOf(t) === key && inCycle(t)).length : undefined);

  const edit = (id: string, link = false) => {
    setEditing(id);
    setEditLink(link);
  };

  const drop = (lane: string) => {
    const t = drag ? db.targets[drag] : undefined;
    if (t && laneOf(t) !== lane) setVia(t.id, lane);
    setDrag(null);
    setOver(null);
  };

  return (
    <div className="stagger space-y-4">
      <PageHead
        title="Площадки"
      />
      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Площадки">
        {CHANNEL_IDS.map((c) => {
          const s = channelStats(db, c, now);
          const active = c === id;
          return (
            <Link
              key={c}
              href={`/channels/${c}`}
              aria-current={active ? "page" : undefined}
              className={cx(
                "press font-display flex shrink-0 items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-[15px] font-medium",
                active
                  ? "border-accent/50 bg-accent/[0.1] text-ink"
                  : "border-white/10 bg-white/[0.03] text-muted hover:border-white/20 hover:text-ink",
              )}
            >
              <ChannelIcon id={c} size={24} />
              {CHANNELS[c].name}
              {s.total > 0 && (
                <span className="font-mono text-[11.5px] font-normal tabular-nums tracking-normal text-muted">
                  {s.reached}/{s.total}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <ChannelIcon id={id} size={56} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-[28px] font-medium leading-none sm:text-[32px]">{meta.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditAccounts(true)}
                aria-label={accounts.length ? `Аккаунты канала: ${accounts.join(", ")}` : undefined}
                title="Аккаунты канала: ник, кто ведёт, подпись"
                className="group -ml-1.5 mt-1.5 flex max-w-full items-center gap-2 rounded-lg px-1.5 py-0.5 text-left text-[14.5px] text-ink-2 transition-colors hover:bg-white/[0.05]"
              >
                <span className={cx("truncate", !accounts.length && "text-muted")}>{accounts.length ? accounts.join(", ") : "Аккаунты канала"}</span>
                <Pencil size={13} className="shrink-0 text-muted/50 transition-colors group-hover:text-muted" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Tile label={`Всего ${meta.target[2]}`} value={stats.total} />
          {cycle ? (
            // С кругами плитка показывает текущий круг и обнуляется вместе с ним. Охват за всё время в подсказке и в «Аналитике»
            <Tile
              label="Охвачено в круге"
              value={markedNow}
              highlight
              sub={`осталось ${openNow} · круг ${cycle.label}`}
              title={`За всё время: ${stats.reached} из ${stats.total}`}
            />
          ) : (
            <Tile label="Охвачено" value={stats.reached} highlight sub={left > 0 ? `осталось ${left}` : undefined} />
          )}
          <Tile label="Ответили" value={stats.replied} />
          <div className="col-span-2 min-w-0 rounded-2xl border border-line bg-white/[0.03] px-4 py-3.5 md:col-span-1">
            <div className="flex items-start justify-between gap-2">
              <div className="font-display text-[30px] font-medium leading-none">
                <Num value={stats.today} />
              </div>
              <div className="-mr-1.5 flex items-center gap-0.5">
                <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
                  цель
                  <input
                    type="number"
                    min={0}
                    key={`${id}:${ch.dailyGoal}`}
                    defaultValue={ch.dailyGoal}
                    aria-label="Цель на день"
                    onBlur={(e) => {
                      const v = Math.max(0, Math.round(Number(e.target.value) || 0));
                      if (v !== ch.dailyGoal) updateChannel(id, { dailyGoal: v });
                    }}
                    className="w-12 rounded-md border border-line bg-white/[0.05] px-1.5 py-0.5 text-right text-ink-2 outline-none [appearance:textfield] focus:border-accent/60 [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </label>
                {/* Шестерёнка у Telegram и у каналов, где круги включили флагом. Остальные выглядят как раньше */}
                {(cycles || id === "discord") && (
                  <IconButton label="Круги" onClick={() => setEditCycles(true)} className="size-7">
                    <Settings size={14} />
                  </IconButton>
                )}
              </div>
            </div>
            <div className="mt-2 text-[13px] text-muted">Сегодня</div>
            {cycle && (
              <div className="mt-0.5 text-[12.5px] text-muted/80">
                в этом круге: <span className="font-medium tabular-nums text-ink-2">{markedNow}</span>
              </div>
            )}
            {multi && (
              <div className="mt-1.5 space-y-0.5 text-[12px] text-muted">
                {accounts.map((a) => (
                  <div key={a} className="flex justify-between gap-2">
                    <span className="truncate">{a}</span>
                    <span className="font-medium tabular-nums text-ink-2">{perAccount[a] ?? 0}</span>
                  </div>
                ))}
                {(perAccount[""] ?? 0) > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="truncate">без аккаунта</span>
                    <span className="font-medium tabular-nums text-ink-2">{perAccount[""]}</span>
                  </div>
                )}
              </div>
            )}
            {ch.dailyGoal > 0 && (
              <div className="mt-2">
                <Meter value={stats.today} max={ch.dailyGoal} color={meta.color} />
              </div>
            )}
          </div>
        </div>

        <textarea
          key={`${id}:${ch.note}`}
          defaultValue={ch.note}
          rows={2}
          placeholder="Правила и заметки по каналу: темп, ограничения, что работает"
          aria-label="Заметки по каналу"
          onBlur={(e) => {
            if (e.target.value !== ch.note) updateChannel(id, { note: e.target.value });
          }}
          className={cx(fieldClass, "mt-4 resize-y text-[14px] leading-relaxed text-ink-2")}
        />
      </Panel>

      <Panel
        eyebrow="Рассылка"
        title={`Список: ${targets.length} ${plural(targets.length, meta.target)}`}
        right={
          <div className="flex w-full flex-wrap items-start gap-x-3 gap-y-4 sm:w-auto">
            {/* Один общий таймер на весь список. На телефоне пилюля на всю ширину прямо над списком */}
            {cycle && targets.length > 0 && (
              <CycleTimer cfg={cfg} marked={markedNow} total={targets.length} className="order-last w-full sm:order-none sm:w-auto" />
            )}
            <div className="flex gap-2">
              {targets.length > 0 && (
                <Button onClick={() => download(`${id}-база-${new Date().toISOString().slice(0, 10)}.csv`, targetsCSV(db, id), "text/csv")}>
                  <Download size={15} />
                  CSV
                </Button>
              )}
              <Button variant="primary" onClick={() => setAdding(true)}>
                <Upload size={15} />
                Импорт базы
              </Button>
            </div>
          </div>
        }
      >
        {targets.length > 0 && multi && !columns && (
          <div className="mb-3">
            <Segments
              label="Аккаунт"
              value={tab}
              onChange={setTab}
              options={[
                ...accounts.map((a) => ({ value: a, label: `${a} (${byAccount[a].total})` })),
                ...(byAccount[""].total > 0 ? [{ value: "none", label: `Без аккаунта (${byAccount[""].total})` }] : []),
                { value: "all", label: "Все" },
              ]}
            />
          </div>
        )}

        {targets.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <Pills
              label="Фильтр списка"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "Все" },
                { value: "new", label: "Не отправлено" },
                { value: "sent", label: "Отправлено" },
                { value: "replied", label: "Ответили" },
                { value: "star", label: "★" },
              ]}
            />
            <label className="relative block w-full sm:w-56">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Поиск"
                aria-label="Поиск по списку"
                className={cx(fieldClass, "py-1.5 pl-8 text-[14px]")}
              />
            </label>
          </div>
        )}

        {targets.length === 0 ? (
          <Empty title="Список пока пуст">
            Нажмите «Импорт базы» и перетащите файл или вставьте ссылки и ники.
          </Empty>
        ) : columns ? (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${lanes.length}, minmax(0, 1fr))` }}>
            {lanes.map((l) => {
              const items = shown.filter((t) => laneOf(t) === l.key);
              const parts = arrange(items);
              const s = byAccount[l.key];
              return (
                <section
                  key={l.key || "none"}
                  aria-label={l.account?.handle ?? "Без аккаунта"}
                  onDragOver={(e) => {
                    if (!drag) return;
                    e.preventDefault();
                    if (over !== l.key) setOver(l.key);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    drop(l.key);
                  }}
                  className={cx(
                    "flex max-h-[calc(100dvh-88px)] min-h-[280px] flex-col overflow-hidden rounded-2xl border bg-white/[0.02] transition-[border-color,box-shadow] duration-300",
                    drag !== null && over === l.key ? "border-accent/70 shadow-[0_0_0_4px_rgb(var(--glow)/0.1)]" : "border-line",
                  )}
                >
                  <LaneHead
                    account={l.account}
                    member={memberOf(l.account)}
                    stats={s}
                    marked={laneMarked(l.key)}
                    color={meta.color}
                    onSetup={() => setEditAccounts(true)}
                    className="border-b border-line"
                  />
                  {items.length === 0 ? (
                    <div className="p-3">
                      <Empty title={s.total ? "Ничего не найдено" : "Пока пусто"}>
                        {s.total ? undefined : `Перетащите сюда ${meta.target[0]} из соседнего столбца`}
                      </Empty>
                    </div>
                  ) : (
                    <LaneList content={sectionKey(parts)}>
                      {sectioned(parts, (t) => (
                        <TargetRow
                          key={t.id}
                          t={t}
                          accounts={l.key ? [] : accounts}
                          cyc={cyc}
                          onEdit={() => edit(t.id)}
                          onAddLink={() => edit(t.id, true)}
                          onText={() => setTexting(t.id)}
                          touchWord={meta.touch[0]}
                          compact
                          drag={{
                            active: drag === t.id,
                            start: () => setDrag(t.id),
                            end: () => {
                              setDrag(null);
                              setOver(null);
                            },
                          }}
                        />
                      ))}
                    </LaneList>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <>
            {multi && tabLane && (
              <LaneHead
                account={tabLane.account}
                member={memberOf(tabLane.account)}
                stats={byAccount[tabLane.key]}
                marked={laneMarked(tabLane.key)}
                color={meta.color}
                onSetup={() => setEditAccounts(true)}
                className="mb-3 rounded-2xl border border-line bg-white/[0.02]"
              />
            )}
            {list.length === 0 ? (
              <Empty title="Ничего не найдено" />
            ) : (
              <FlipList content={sectionKey(listParts)} className="-mx-2 divide-y divide-line">
                {sectioned(listParts, (t) => (
                  <TargetRow
                    key={t.id}
                    t={t}
                    accounts={multi && (!tabLane || !tabLane.key) ? accounts : []}
                    cyc={cyc}
                    onEdit={() => edit(t.id)}
                    onAddLink={() => edit(t.id, true)}
                    onText={() => setTexting(t.id)}
                    touchWord={meta.touch[0]}
                  />
                ))}
              </FlipList>
            )}
          </>
        )}
      </Panel>

      <Panel eyebrow="Задачи" title="Задачи канала">
        {tasks.length > 0 && (
          <div className="-mx-2 mb-3 space-y-0.5">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} members={db.members} onOpen={shell.openTask} />
            ))}
          </div>
        )}
        <QuickCapture defaults={{ channelId: id }} placeholder={`Новая задача для ${meta.name}…`} />
      </Panel>

      <ImportModal key={adding ? `open-${id}` : "closed"} open={adding} fallback={id} onClose={() => setAdding(false)} />
      <EditTarget targetId={editing} focusLink={editLink} onClose={() => setEditing(null)} />
      <MessageModal targetId={texting} onClose={() => setTexting(null)} />
      {editAccounts && <AccountsModal id={id} onClose={() => setEditAccounts(false)} />}
      {editCycles && <CyclesModal id={id} onClose={() => setEditCycles(false)} />}
    </div>
  );
}

const LANE_COUNTERS: [keyof AccountStats, string][] = [
  ["total", "всего"],
  ["sent", "отправлено"],
  ["replied", "ответили"],
  ["today", "сегодня"],
];

/** Шапка столбца аккаунта: ник, подпись, счётчики и полоса «охвачено». marked: сколько отмечено в текущем круге. */
function LaneHead({
  account,
  member,
  stats,
  marked,
  color,
  onSetup,
  className,
}: {
  account: ChannelAccount | null;
  member?: Member;
  stats: AccountStats;
  marked?: number;
  color: string;
  /** Открыть справочник аккаунтов: там задают, кто ведёт аккаунт */
  onSetup: () => void;
  className?: string;
}) {
  // С кругами полоса показывает текущий круг и обнуляется вместе с ним
  const reached = marked ?? stats.sent;
  const pct = stats.total ? Math.round((reached / stats.total) * 100) : 0;
  const label = account ? account.label || member?.name || "" : "аккаунт не выбран";
  return (
    <header className={cx("px-3.5 pb-3.5 pt-3", className)}>
      <div className="flex items-center gap-2.5">
        {/* Аватар только у аккаунта с владельцем. Пока владельца нет, вместо подписи тихая ссылка в справочник */}
        {member && <Avatar member={member} size={30} />}
        <div className="min-w-0 flex-1">
          <div className="font-display truncate text-[16px] font-medium leading-tight">{account?.handle ?? "Без аккаунта"}</div>
          {label ? (
            <div className="truncate text-[12.5px] text-muted">{label}</div>
          ) : (
            <button
              type="button"
              onClick={onSetup}
              className="-mx-1 rounded-md px-1 text-[12.5px] text-muted/80 underline decoration-white/20 underline-offset-[3px] transition-colors hover:text-accent-soft hover:decoration-accent/50"
            >
              кто ведёт?
            </button>
          )}
        </div>
        {marked !== undefined && (
          <span
            data-lane-cycle
            title="Отмечено в текущем круге"
            className="shrink-0 whitespace-nowrap rounded-full border border-line bg-white/[0.03] px-2.5 py-1 text-[12px] text-muted"
          >
            в круге <span className="font-medium tabular-nums text-ink-2">{marked}</span> из {stats.total}
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {LANE_COUNTERS.map(([k, name]) => (
          <div key={k} className="min-w-0">
            <div className="font-display text-[20px] font-medium leading-none tabular-nums">
              <Num value={stats[k]} />
            </div>
            <div className="mt-1 truncate text-[11.5px] text-muted">{name}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <Meter value={reached} max={stats.total} color={color} />
        </div>
        <span className="shrink-0 text-[12px] tabular-nums text-muted">{marked !== undefined ? "в круге" : "охвачено"} {pct}%</span>
      </div>
    </header>
  );
}

/** Список в столбце: свой скролл, у края мягкое затухание, пока есть что листать. */
function LaneList({ content, children }: { content: string; children: ReactNode }) {
  const [ref, fade] = useEdgeFade<HTMLUListElement>("y", content);
  useFlip(ref, content);
  return (
    <ul ref={ref} style={fade} className="@container min-h-0 flex-1 divide-y divide-line overflow-y-auto px-1.5 py-1">
      {children}
    </ul>
  );
}

/** Обычный список без столбцов: та же плавная перестановка строк. */
function FlipList({ content, className, children }: { content: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  useFlip(ref, content);
  return (
    <ul ref={ref} className={className}>
      {children}
    </ul>
  );
}

/** Разделитель внутри списка: «Отправлено в этом круге · 12». С onToggle сворачивает блок под собой. */
function SectionDivider({
  label,
  count,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const body = (
    <>
      {onToggle && <ChevronDown size={13} className={cx("shrink-0 transition-transform duration-200", collapsed && "-rotate-90")} />}
      <span className="shrink-0">
        {label} · <span className="tabular-nums">{count}</span>
      </span>
      <span className="h-px min-w-6 flex-1 bg-line" aria-hidden />
    </>
  );
  const cls = "font-mono flex w-full items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-muted";
  return (
    <li data-section className="px-2 pb-1.5 pt-3.5">
      {onToggle ? (
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={onToggle}
          title={collapsed ? "Показать отправленные" : "Свернуть отправленные"}
          className={cx(cls, "rounded-md transition-colors hover:text-ink-2")}
        >
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

/** Круг для строки списка: начало, длина, пояс и время, на которое считаем кулдаун. */
interface RowCycle {
  start: number;
  hours: number;
  tz: string;
  at: number;
}

function TargetRow({
  t,
  accounts,
  cyc,
  onEdit,
  onAddLink,
  onText,
  touchWord,
  compact,
  drag,
}: {
  t: Target;
  accounts: string[];
  /** Круги включены: кружок показывает отметку в текущем круге, а не «отправлено когда-то» */
  cyc: RowCycle | null;
  onEdit: () => void;
  /** Нет ссылки: «+ ссылка» открывает «Изменить» на поле «Ссылка» */
  onAddLink: () => void;
  onText: () => void;
  touchWord: string;
  /** В столбце: название на всю строку, кнопки строкой ниже */
  compact?: boolean;
  /** Перетаскивание в другой столбец меняет аккаунт */
  drag?: { active: boolean; start: () => void; end: () => void };
}) {
  const sent = t.touches > 0;
  const mark = cyc ? markOf(t, cyc, cyc.at) : null;
  const done = mark ? mark.state !== "empty" : sent;
  const locked = cyc && mark?.state === "locked" ? mark : null;
  // Отмеченный в этом круге или на кулдауне: строка внизу, приглушена и зачёркнута, но кнопки работают
  const faded = !!cyc && !!mark && mark.state !== "empty";
  const sentAt = cyc && mark?.state === "marked" && t.lastTouchAt ? atText(t.lastTouchAt, cyc.at, cyc.tz).replace(/^в /, "") : null;
  // Снять можно, если не потеряем этап: у «Ответил» и дальше последнее касание не снимаем
  const undoable = t.stage === "sent" || t.touches > 1;
  const hasText = !!t.message?.trim();
  // Состояние на момент клика: на границе круга экран мог ещё не перерисоваться
  const markAt = (at: number): Mark | null => (cyc ? markOf(t, { ...cyc, start: cycleAt(at, cyc).start }, at) : null);
  // Кулдаун чата: ни кружок, ни «×N» не засчитывают касание раньше срока
  const early = (at: number, m: Mark | null) => {
    if (!cyc || m?.state !== "locked") return false;
    toast(`Рано: правила чата, следующий пост ${atText(m.until, at, cyc.tz)}`, 2600, { wait: true });
    return true;
  };
  const offerText = /^[A-Za-zА-Яа-я]?\d+$/u.test(t.offer) ? `оффер ${t.offer}` : t.offer;
  // Клик по офферу копирует первое сообщение. Текста нет или буфер недоступен: открываем диалог
  const copyOffer = async () => {
    if (!hasText) return onText();
    try {
      await navigator.clipboard.writeText(t.message ?? "");
      toast("Скопировано");
    } catch {
      onText();
    }
  };
  return (
    <li
      data-flip={t.id}
      draggable={drag ? true : undefined}
      onDragStart={
        drag
          ? (e) => {
              e.dataTransfer.setData("text/plain", t.id);
              e.dataTransfer.effectAllowed = "move";
              drag.start();
            }
          : undefined
      }
      onDragEnd={drag?.end}
      className={cx(
        "group flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-2 py-2.5 transition-[background-color,opacity] duration-200 hover:bg-white/[0.04]",
        drag && "cursor-grab active:cursor-grabbing",
        faded && !drag?.active && "opacity-45 hover:opacity-80 focus-within:opacity-80",
        drag?.active && "opacity-40",
      )}
    >
      {cyc && mark ? (
        <CheckCircle
          checked={mark.state !== "empty"}
          locked={mark.state === "locked"}
          label={
            mark.state === "locked"
              ? `Снова можно через ${waitText(mark.until - cyc.at)}`
              : mark.state === "marked"
                ? undoable
                  ? "Снять отметку в этом круге"
                  : "Этап меняется в списке справа"
                : "Отметить: запостили в этом круге"
          }
          onChange={() => {
            const at = clock.now();
            const m = markAt(at);
            if (early(at, m)) return;
            if (m?.state === "marked") {
              if (undoable) untouchTarget(t.id);
            } else touchTarget(t.id);
          }}
        />
      ) : (
        <CheckCircle
          checked={sent}
          label={sent ? (t.stage === "sent" ? "Снять отметку" : "Этап меняется в списке справа") : "Отметить: отправлено"}
          onChange={(v) => {
            if (v) touchTarget(t.id);
            else if (t.stage === "sent") untouchTarget(t.id);
          }}
        />
      )}
      <button
        type="button"
        aria-label={t.starred ? "Убрать из приоритетных" : "Сделать приоритетным"}
        aria-pressed={t.starred}
        onClick={() => updateTarget(t.id, { starred: !t.starred })}
        className={cx("shrink-0 transition-colors", t.starred ? "text-warn" : "text-muted/40 hover:text-muted")}
      >
        <Star size={15} fill={t.starred ? "currentColor" : "none"} />
      </button>
      <div className={cx("min-w-0 flex-1", compact ? "basis-[calc(100%-4rem)]" : "basis-56")}>
        <div className="flex items-center gap-2">
          {t.url ? (
            <a
              href={t.url}
              target="_blank"
              rel="noreferrer"
              className={cx("inline-flex min-w-0 items-center gap-1 text-[14.5px] hover:underline", done ? "text-ink-2" : "text-ink")}
            >
              <span className={cx("truncate", faded && "line-through decoration-muted/70")}>{t.title}</span>
              <ExternalLink size={12} className="shrink-0 text-muted" />
            </a>
          ) : (
            // Без ссылки название не ссылка. Значок рядом, чтобы такие чаты было видно в списке
            <span className={cx("inline-flex min-w-0 items-center gap-1 text-[14.5px]", done ? "text-ink-2" : "text-ink")}>
              <span className={cx("truncate", faded && "line-through decoration-muted/70")}>{t.title}</span>
              <span role="img" aria-label="Нет ссылки" title="Нет ссылки на чат" data-no-link className="inline-flex shrink-0 text-warn/80">
                <Link2Off size={12} />
              </span>
            </span>
          )}
          {t.offer && (
            <button
              type="button"
              onClick={copyOffer}
              title="Скопировать текст оффера"
              aria-label={`${offerText}: скопировать текст`}
              className={cx(
                "press font-mono shrink-0 rounded-md border border-white/8 bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-ink-2 hover:border-white/20 hover:bg-white/[0.08] hover:text-ink",
                faded && "line-through decoration-muted/70",
              )}
            >
              {offerText}
            </button>
          )}
          {sentAt && (
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-accent-soft/90" title="Когда отметили в этом круге">
              отпр. {sentAt}
            </span>
          )}
        </div>
        {cyc && locked && (
          <div className="flex items-center gap-1 text-[12.5px] text-accent-soft/80" title="Правила чата: пост реже, чем раз в круг">
            <Clock3 size={12} className="shrink-0" />
            <span className="truncate">снова можно через {waitText(locked.until - cyc.at)}</span>
          </div>
        )}
        {t.url ? (
          t.note && <div className="truncate text-[13px] text-muted">{t.note}</div>
        ) : (
          <div className="flex min-w-0 items-center gap-2 text-[13px]">
            <button
              type="button"
              onClick={onAddLink}
              title="Добавить ссылку на чат"
              className="press inline-flex h-[22px] shrink-0 items-center gap-0.5 rounded-md border border-dashed border-white/15 px-1.5 text-[12px] font-medium text-accent-soft transition-colors hover:border-accent/50 hover:bg-accent/[0.08]"
            >
              <Plus size={12} strokeWidth={2.4} />
              ссылка
            </button>
            {t.note && <span className="truncate text-muted">{t.note}</span>}
          </div>
        )}
      </div>
      <div
        className={cx(
          // Размер шрифта на обёртке: select наследует его (font: inherit в globals.css), свои классы у select не работают.
          // На телефоне остаётся 16 px, иначе iPhone приближает страницу при выборе
          "flex shrink-0 flex-wrap items-center gap-1 sm:gap-1.5 sm:text-[13px]",
          // В широком столбце кнопки встают под название, в узком на всю ширину
          compact ? "max-w-full @min-[420px]:ml-[59px] @min-[420px]:max-w-[calc(100%-59px)]" : "max-w-full",
        )}
      >
        {accounts.length > 0 && (
          <select
            value={t.via ?? ""}
            aria-label="С какого аккаунта пишем"
            title="С какого аккаунта пишем"
            onChange={(e) => setVia(t.id, e.target.value)}
            className={cx(
              "h-8 max-w-[150px] rounded-[10px] border bg-field px-2 text-[13px] outline-none transition-colors hover:border-white/25 focus:border-accent/60",
              t.via ? "border-accent/30 text-ink-2" : "border-white/10 text-muted",
            )}
          >
            <option value="">аккаунт?</option>
            {accounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
            {t.via && !accounts.includes(t.via) && <option value={t.via}>{t.via}</option>}
          </select>
        )}
        <button
          type="button"
          onClick={onText}
          title={hasText ? "Текст сообщения для этого аккаунта" : "Написать текст для этого аккаунта"}
          className={cx(
            "press inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium",
            hasText
              ? "border border-accent/40 bg-accent/[0.1] text-accent-soft hover:bg-accent/[0.16]"
              : "border border-white/10 text-muted hover:text-ink",
          )}
        >
          <MessageSquareText size={14} />
          Текст
        </button>
        {/* Место под «×N» есть всегда, чтобы кнопки справа стояли ровной колонкой. Без касаний оно пустое */}
        <button
          type="button"
          onClick={() => {
            const at = clock.now();
            if (!early(at, markAt(at))) touchTarget(t.id);
          }}
          title={locked && cyc ? `Снова можно через ${waitText(locked.until - cyc.at)}` : `Ещё один ${touchWord}`}
          aria-disabled={locked ? true : undefined}
          className={cx(
            "press font-mono inline-flex h-8 items-center gap-1 rounded-full px-2 text-[12px] tabular-nums sm:px-2.5",
            locked ? "text-muted/50" : "text-muted hover:bg-white/[0.08] hover:text-ink",
            !sent && "invisible",
          )}
        >
          <Repeat size={13} />×{t.touches}
        </button>
        <select
          value={t.stage}
          aria-label="Этап"
          onChange={(e) => setStage(t.id, e.target.value as Stage)}
          className="h-8 rounded-[10px] border border-white/10 bg-field px-2 text-[13px] text-ink-2 outline-none transition-colors hover:border-white/25 focus:border-accent/60"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
        <IconButton label="Изменить" onClick={onEdit}>
          <Pencil size={14} />
        </IconButton>
      </div>
    </li>
  );
}

function EditTarget({ targetId, focusLink, onClose }: { targetId: string | null; focusLink?: boolean; onClose: () => void }) {
  const { db } = useApp();
  const t = targetId ? db.targets[targetId] : undefined;
  if (!t) return null;
  const accounts = accountsOf(db.channels[t.channelId]).map((a) => a.handle);
  const cycles = cyclesOn(t.channelId, db.channels[t.channelId]);
  const field = (label: string, key: "title" | "url" | "offer" | "note", placeholder = "") => (
    <label className="block">
      <span className="eyebrow mb-2 block">{label}</span>
      <input
        key={`${t.id}:${key}`}
        defaultValue={t[key]}
        placeholder={placeholder}
        data-autofocus={focusLink && key === "url" ? true : undefined}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== t[key] && (key !== "title" || v)) updateTarget(t.id, { [key]: v });
        }}
        className={fieldClass}
      />
    </label>
  );
  return (
    <Modal open onClose={onClose} title="Запись в списке">
      <div className="space-y-3">
        {field("Название", "title")}
        {field("Ссылка", "url", "https://")}
        {field("Оффер", "offer", "Какой текст отправляем")}
        {field("Заметка", "note")}
        {accounts.length >= 2 && (
          <label className="block">
            <span className="eyebrow mb-2 block">С какого аккаунта пишем</span>
            <select
              value={t.via ?? ""}
              onChange={(e) => setVia(t.id, e.target.value)}
              className="h-11 w-full rounded-xl border border-line bg-field px-3 text-[15px] text-ink outline-none transition-colors hover:border-line-2 focus:border-accent/60"
            >
              <option value="">не выбран</option>
              {accounts.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
              {t.via && !accounts.includes(t.via) && <option value={t.via}>{t.via}</option>}
            </select>
          </label>
        )}
        {cycles && (
          <label className="block">
            <span className="eyebrow mb-2 block">Можно постить раз в</span>
            <select
              value={String(t.cooldownHours ?? COOLDOWN_HOURS[0])}
              onChange={(e) => {
                const h = Number(e.target.value);
                setCooldown(t.id, h === COOLDOWN_HOURS[0] ? null : h);
              }}
              className="h-11 w-full rounded-xl border border-line bg-field px-3 text-[15px] text-ink outline-none transition-colors hover:border-line-2 focus:border-accent/60"
            >
              {COOLDOWN_HOURS.map((h) => (
                <option key={h} value={h}>
                  {`${h === 168 ? "7 дней" : `${h} ч`}${h === COOLDOWN_HOURS[0] ? " (по умолчанию)" : ""}`}
                </option>
              ))}
              {t.cooldownHours && !COOLDOWN_HOURS.includes(t.cooldownHours) && <option value={t.cooldownHours}>{t.cooldownHours} ч</option>}
            </select>
            <span className="mt-1.5 block text-[12.5px] text-muted">По правилам из закрепа. Реже, чем раз в круг: кружок ждёт с часами до следующего поста</span>
          </label>
        )}
        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-[12.5px] text-muted">
            {STAGE_LABEL[t.stage]}
            {t.touches > 0 ? `, касаний: ${t.touches}` : ""}
          </span>
          <Button
            variant="danger"
            onClick={() => {
              deleteTarget(t.id);
              onClose();
            }}
          >
            <Trash2 size={15} />
            Удалить
          </Button>
        </div>
      </div>
    </Modal>
  );
}
