"use client";

import { useSyncExternalStore } from "react";
import type { Backend } from "./backend";
import { applyRows, dbToRows, rowsToDB } from "./backend";
import * as clock from "./clock";
import { localBackend } from "./backend-local";
import { SUPABASE_ENABLED, SUPABASE_KEY, SUPABASE_URL, WORKSPACE } from "./config";
import { dayKey, shortDate } from "./analytics";
import type { ExpenseInput } from "./expenses";
import { ROW_FORMS, expenseKey, expenseLabel, isPaid, moneyByCurrency, resultLabel } from "./expenses";
import { TELETARGET_BUDGET, TELETARGET_MONTH, teleTargetInputs } from "./expenses-seed";
import { CHANNELS, STAGE_LABEL, STATUS_LABEL, cleanHandle, plural } from "./meta";
import { emptyDB, seedRows } from "./seed";
import type {
  Channel,
  ChannelAccount,
  ChannelId,
  Currency,
  DB,
  Ev,
  EvType,
  Expense,
  FormatId,
  FunnelStage,
  Member,
  Meta,
  MetricSnapshot,
  Doc,
  Priority,
  PulseDigest,
  PulseSources,
  Release,
  Row,
  Stage,
  Target,
  Task,
  TaskStatus,
} from "./types";
import { CHANNEL_IDS, FUNNEL_STAGES } from "./types";

export interface State {
  ready: boolean;
  db: DB;
  /** Кто работает в этом браузере. Хранится локально. */
  me: string | null;
  sync: "local" | "supabase";
  error: string | null;
}

const ME_KEY = "qcai:v1:me";

let state: State = { ready: false, db: emptyDB(), me: null, sync: "local", error: null };
const SERVER_STATE = state;
const listeners = new Set<() => void>();
let backend: Backend | null = null;
let started = false;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useApp(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
}

export function getState(): State {
  return state;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function initStore() {
  if (started) return;
  started = true;

  let me: string | null = null;
  try {
    me = localStorage.getItem(ME_KEY);
  } catch {}

  let error: string | null = null;
  let rows: Row[] = [];

  if (SUPABASE_ENABLED) {
    try {
      const { supabaseBackend } = await import("./backend-supabase");
      backend = await supabaseBackend(SUPABASE_URL, SUPABASE_KEY, WORKSPACE);
      rows = await backend.load();
    } catch (e) {
      error = `Supabase недоступен, данные хранятся только в этом браузере. ${message(e)}`;
      backend = null;
    }
  }
  if (!backend) {
    backend = localBackend();
    rows = await backend.load();
  }

  if (rows.length === 0) {
    rows = seedRows();
    backend.save(rows, rowsToDB(rows)).catch((e) => set({ error: `Не удалось сохранить: ${message(e)}` }));
  }

  const db = rowsToDB(rows);
  if (me && !db.members[me]) me = null;
  set({ ready: true, db, me, sync: backend.kind, error });

  backend.subscribe(
    (incoming) => set({ db: applyRows(state.db, incoming) }),
    (all) => set({ db: rowsToDB(all) }),
  );
  autoWeeklyReport().catch(() => {});
}

function commit(rows: Row[]) {
  if (!rows.length) return;
  const db = applyRows(state.db, rows);
  set({ db });
  backend?.save(rows, db).catch((e) => set({ error: `Не удалось сохранить: ${message(e)}` }));
}

export function dismissError() {
  set({ error: null });
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function ev(type: EvType, channelId: ChannelId | null, text: string, extra: Partial<Ev> = {}): Row {
  const e: Ev = { id: uid(), ts: clock.now(), by: state.me, type, channelId, text, ...extra };
  return { kind: "event", id: e.id, data: e };
}

// ───────────── Задачи ─────────────

export interface TaskInput {
  title: string;
  note?: string;
  channelId?: ChannelId | null;
  assigneeId?: string | null;
  priority?: Priority;
  due?: string | null;
  /** Поля слота контент-плана. */
  time?: string;
  format?: FormatId;
  model?: string;
  refs?: string[];
}

function taskRows(input: TaskInput, order: number): Row[] {
  const t: Task = {
    id: uid(),
    title: input.title.trim(),
    note: input.note ?? "",
    status: "todo",
    channelId: input.channelId ?? null,
    assigneeId: input.assigneeId ?? null,
    priority: input.priority ?? 1,
    due: input.due ?? null,
    createdAt: clock.now(),
    createdBy: state.me,
    doneAt: null,
    order,
  };
  if (input.time) t.time = input.time;
  if (input.format) t.format = input.format;
  if (input.model) t.model = input.model;
  if (input.refs?.length) t.refs = input.refs;
  return [
    { kind: "task", id: t.id, data: t },
    ev("task.add", t.channelId, t.title, { ref: t.id }),
  ];
}

export function addTasks(inputs: TaskInput[]) {
  const base = clock.now();
  commit(inputs.filter((i) => i.title.trim()).flatMap((input, i) => taskRows(input, base + i)));
}

export function addTask(input: TaskInput) {
  addTasks([input]);
}

/** Кто перетащил в «В работе», тот и берёт задачу. Вернул в очередь, задача снова ничья. */
function claim(t: Task, status: TaskStatus): string | null {
  if (status === "doing") return state.me ?? t.assigneeId;
  if (status === "todo") return null;
  return t.assigneeId ?? state.me;
}

export function updateTask(id: string, patch: Partial<Task>) {
  const t = state.db.tasks[id];
  if (!t) return;
  const next = { ...t, ...patch };
  if (patch.status && patch.status !== t.status && !("assigneeId" in patch)) next.assigneeId = claim(t, patch.status);
  commit([{ kind: "task", id, data: next }]);
}

/** Меняет статус и ставит карточку перед beforeId (или в конец колонки). */
export function moveTask(id: string, status: TaskStatus, beforeId: string | null = null) {
  const t = state.db.tasks[id];
  if (!t) return;
  const column = Object.values(state.db.tasks)
    .filter((x) => x.status === status && x.id !== id)
    .sort((a, b) => a.order - b.order);
  let order: number;
  const idx = beforeId ? column.findIndex((x) => x.id === beforeId) : -1;
  if (idx === -1) order = (column.length ? column[column.length - 1].order : 0) + 1;
  else {
    const prev = idx > 0 ? column[idx - 1].order : column[idx].order - 2;
    order = (prev + column[idx].order) / 2;
  }

  const rows: Row[] = [];
  const next: Task = { ...t, status, order };
  if (status !== t.status) {
    next.doneAt = status === "done" ? clock.now() : null;
    next.assigneeId = claim(t, status);
    if (status === "done") rows.push(ev("task.done", t.channelId, t.title, { ref: id }));
    else if (t.status === "done") rows.push(ev("task.reopen", t.channelId, t.title, { ref: id }));
    else if (status === "doing") rows.push(ev("task.start", t.channelId, t.title, { ref: id }));
  }
  rows.unshift({ kind: "task", id, data: next });
  commit(rows);
}

/** Отметка ежедневной задачи за день. Кто отметил, того и записываем. */
export function toggleDaily(id: string, day: string, done: boolean) {
  const t = state.db.tasks[id];
  if (!t) return;
  const doneDays = { ...(t.doneDays ?? {}) };
  if (done) doneDays[day] = state.me;
  else delete doneDays[day];
  const rows: Row[] = [{ kind: "task", id, data: { ...t, doneDays } }];
  if (done) rows.push(ev("task.daily", t.channelId, t.title, { ref: id }));
  commit(rows);
}

export function deleteTask(id: string) {
  const t = state.db.tasks[id];
  if (!t) return;
  commit([{ kind: "task", id, data: null }, ev("task.delete", t.channelId, t.title)]);
}

// ───────────── Метрики постов и релизы ─────────────

/** Снимок метрик на T+N часов. Снимок на тот же час заменяется. */
export function addSnapshot(taskId: string, snap: Omit<MetricSnapshot, "at">) {
  const t = state.db.tasks[taskId];
  if (!t) return;
  const metrics = [...(t.metrics ?? []).filter((s) => s.hours !== snap.hours), { ...snap, at: clock.now() }].sort(
    (a, b) => a.hours - b.hours,
  );
  commit([{ kind: "task", id: taskId, data: { ...t, metrics } }]);
}

export function removeSnapshot(taskId: string, hours: number) {
  const t = state.db.tasks[taskId];
  if (!t) return;
  commit([{ kind: "task", id: taskId, data: { ...t, metrics: (t.metrics ?? []).filter((s) => s.hours !== hours) } }]);
}

/** Ссылка на вышедший пост: задача закрывается, фиксируем время выхода. */
export function markPosted(taskId: string, postUrl: string) {
  const t = state.db.tasks[taskId];
  if (!t) return;
  const url = postUrl.trim();
  const next: Task = { ...t };
  if (url) {
    next.postUrl = url;
    next.postedAt = t.postedAt ?? clock.now();
    next.status = "done";
    next.doneAt = t.doneAt ?? clock.now();
  } else {
    delete next.postUrl;
    delete next.postedAt;
  }
  const rows: Row[] = [{ kind: "task", id: taskId, data: next }];
  if (url && !t.postUrl) rows.push(ev("task.done", t.channelId, `Вышел пост: ${t.title}`, { ref: taskId }));
  commit(rows);
}

export function saveRelease(r: Omit<Release, "id"> & { id?: string }): string {
  const id = r.id ?? uid();
  const list = (state.db.meta.releases ?? []).filter((x) => x.id !== id);
  updateMeta({ releases: [...list, { ...r, id }].sort((a, b) => (a.date < b.date ? -1 : 1)) });
  return id;
}

export function deleteRelease(id: string) {
  updateMeta({ releases: (state.db.meta.releases ?? []).filter((x) => x.id !== id) });
}

/** Разворачивает протокол релиза в 5 слотов плана. Повторно не дублирует: ищет по названию. */
export async function applyReleaseProtocol(releaseId: string): Promise<number> {
  const r = (state.db.meta.releases ?? []).find((x) => x.id === releaseId);
  if (!r) return 0;
  const { protocolTasks } = await import("./content");
  const have = new Set(Object.values(state.db.tasks).map((t) => t.title));
  const fresh = protocolTasks(r).filter((p) => !have.has(p.title));
  addTasks(fresh.map((p) => ({ ...p, channelId: "x" as const })));
  return fresh.length;
}

// ───────────── Цели рассылки ─────────────

export interface TargetInput {
  title: string;
  url?: string;
  offer?: string;
  note?: string;
  starred?: boolean;
}

export function addTargets(channelId: ChannelId, inputs: TargetInput[]) {
  const items = inputs.filter((i) => i.title.trim());
  if (!items.length) return;
  const existing = Object.values(state.db.targets).filter((t) => t.channelId === channelId);
  let order = existing.reduce((m, t) => Math.max(m, t.order), -1) + 1;
  const rows: Row[] = items.map((input) => {
    const t: Target = {
      id: uid(),
      channelId,
      title: input.title.trim(),
      url: input.url ?? "",
      offer: input.offer ?? "",
      note: input.note ?? "",
      starred: input.starred ?? false,
      stage: "new",
      touches: 0,
      lastTouchAt: null,
      at: {},
      createdAt: clock.now(),
      order: order++,
    };
    return { kind: "target", id: t.id, data: t };
  });
  const n = items.length;
  const text = n === 1 ? items[0].title.trim() : `+${n} ${plural(n, CHANNELS[channelId].target)}`;
  rows.push(ev("target.add", channelId, text));
  commit(rows);
}

export function updateTarget(id: string, patch: Partial<Target>) {
  const t = state.db.targets[id];
  if (!t) return;
  commit([{ kind: "target", id, data: { ...t, ...patch } }]);
}

/** Одно касание: написали или запостили. */
export function touchTarget(id: string) {
  const t = state.db.targets[id];
  if (!t) return;
  const now = clock.now();
  const next: Target = { ...t, touches: t.touches + 1, lastTouchAt: now };
  if (t.stage === "new") {
    next.stage = "sent";
    next.at = { ...t.at, sent: now };
  }
  commit([
    { kind: "target", id, data: next },
    ev("target.touch", t.channelId, t.title, t.via ? { ref: id, account: t.via } : { ref: id }),
  ]);
}

/** Закрепляет цель за аккаунтом канала, чтобы ей не написали с двух аккаунтов. */
export function setVia(id: string, via: string) {
  const t = state.db.targets[id];
  if (!t) return;
  const next: Target = { ...t };
  if (via) next.via = via;
  else delete next.via;
  commit([{ kind: "target", id, data: next }]);
}

/**
 * Отмена последнего касания, если отметили по ошибке.
 * lastTouchAt возвращается к предыдущему касанию, чтобы кружок круга снова опустел.
 */
export function untouchTarget(id: string) {
  const t = state.db.targets[id];
  if (!t || t.touches === 0) return;
  const [last, prev] = Object.values(state.db.events)
    .filter((e) => e.type === "target.touch" && e.ref === id)
    .sort((a, b) => b.ts - a.ts);
  const next: Target = { ...t, touches: t.touches - 1, lastTouchAt: prev?.ts ?? null };
  if (next.touches === 0) {
    next.lastTouchAt = null;
    if (t.stage === "sent") {
      next.stage = "new";
      next.at = {};
    }
  }
  const rows: Row[] = [{ kind: "target", id, data: next }];
  if (last) rows.push({ kind: "event", id: last.id, data: null });
  commit(rows);
}

/** «Можно постить раз в» по правилам чата. null = по умолчанию, раз в круг. */
export function setCooldown(id: string, hours: number | null) {
  const t = state.db.targets[id];
  if (!t) return;
  const next: Target = { ...t };
  if (hours) next.cooldownHours = hours;
  else delete next.cooldownHours;
  commit([{ kind: "target", id, data: next }]);
}

export function setStage(id: string, stage: Stage) {
  const t = state.db.targets[id];
  if (!t || t.stage === stage) return;
  const now = clock.now();
  const rows: Row[] = [];
  const next: Target = { ...t, stage };

  if (stage === "new") {
    next.at = {};
    next.touches = 0;
    next.lastTouchAt = null;
  } else if (stage !== "lost") {
    const reach = FUNNEL_STAGES.indexOf(stage as FunnelStage);
    const at: Target["at"] = {};
    FUNNEL_STAGES.forEach((s, i) => {
      if (i <= reach) at[s] = t.at[s] ?? now;
    });
    next.at = at;
    if (t.touches === 0) {
      next.touches = 1;
      next.lastTouchAt = now;
      rows.push(ev("target.touch", t.channelId, t.title, { ref: id }));
    }
  }
  if (stage !== "new" && !(stage === "sent" && t.stage === "new")) {
    rows.push(ev("target.stage", t.channelId, `${t.title}: ${STAGE_LABEL[stage].toLowerCase()}`, { ref: id, stage }));
  }
  rows.unshift({ kind: "target", id, data: next });
  commit(rows);
}

export function deleteTarget(id: string) {
  if (!state.db.targets[id]) return;
  commit([{ kind: "target", id, data: null }]);
}

// ───────────── Импорт базы ─────────────

/** Добавляет разобранную базу сразу в несколько каналов одной записью. Дубли отбрасываются заранее. */
export function importTargets(items: (TargetInput & { channelId: ChannelId })[], source: string) {
  if (!items.length) return;
  const rows: Row[] = [];
  const byChannel = new Map<ChannelId, number>();
  for (const id of CHANNEL_IDS) {
    const list = items.filter((i) => i.channelId === id);
    if (!list.length) continue;
    let order = Object.values(state.db.targets).filter((t) => t.channelId === id).reduce((m, t) => Math.max(m, t.order), -1) + 1;
    for (const input of list) {
      const t: Target = {
        id: uid(),
        channelId: id,
        title: input.title.trim(),
        url: input.url ?? "",
        offer: input.offer ?? "",
        note: input.note ?? "",
        starred: input.starred ?? false,
        stage: "new",
        touches: 0,
        lastTouchAt: null,
        at: {},
        createdAt: clock.now(),
        order: order++,
      };
      rows.push({ kind: "target", id: t.id, data: t });
    }
    byChannel.set(id, list.length);
  }
  for (const [id, n] of byChannel) {
    rows.push(ev("target.import", id, `+${n} ${plural(n, CHANNELS[id].target)}${source ? ` из ${source}` : ""}`));
  }
  commit(rows);
}

// ───────────── Документы ─────────────

export const DOC_LIMIT = 900_000;

export function saveDoc(input: { id?: string; title: string; body: string; format: Doc["format"] }, silent = false): string {
  const id = input.id ?? uid();
  const old = state.db.docs[id];
  const now = clock.now();
  const doc: Doc = {
    id,
    title: input.title.trim() || "Без названия",
    body: input.body.slice(0, DOC_LIMIT),
    format: input.format,
    createdAt: old?.createdAt ?? now,
    updatedAt: now,
    createdBy: old?.createdBy ?? state.me,
  };
  const rows: Row[] = [{ kind: "doc", id, data: doc }];
  if (!old && !silent) rows.push(ev("doc.add", null, doc.title, { ref: id }));
  commit(rows);
  return id;
}

export function updateDoc(id: string, patch: Partial<Pick<Doc, "title" | "body">>) {
  const d = state.db.docs[id];
  if (!d) return;
  commit([{ kind: "doc", id, data: { ...d, ...patch, body: (patch.body ?? d.body).slice(0, DOC_LIMIT), updatedAt: clock.now() } }]);
}

export function deleteDoc(id: string) {
  if (!state.db.docs[id]) return;
  commit([{ kind: "doc", id, data: null }]);
}

/**
 * Раз в неделю сам сохраняет отчёт за прошлую неделю в «Документы».
 * id отчёта зависит только от недели, поэтому два открытых браузера не создадут дубль.
 */
async function autoWeeklyReport() {
  const { buildReport, weekStart, WEEK } = await import("./exporter");
  const thisWeek = weekStart(clock.now());
  const from = weekStart(thisWeek - 1);
  const id = `report-${dayKey(from)}`;
  if (state.db.docs[id]) return;
  const had = Object.values(state.db.events).some((e) => e.ts >= from && e.ts < from + WEEK);
  if (!had) return;
  const title = `Отчёт за неделю ${shortDate(from)} - ${shortDate(thisWeek - 1)}`;
  saveDoc({ id, title, body: buildReport(state.db, from, thisWeek, title), format: "md" }, true);
}

// ───────────── Расходы ─────────────

function expenseOf(input: ExpenseInput, createdAt: number): Expense {
  const { id, ...rest } = input;
  const x: Expense = { ...rest, id: id ?? uid(), createdBy: state.me ?? "", createdAt, updatedAt: createdAt };
  // Оплаченная строка без даты: ставим сегодня
  if (isPaid(x.status) && !x.date) x.date = dayKey(createdAt);
  return x;
}

export function addExpense(input: ExpenseInput): string {
  const x = expenseOf(input, clock.now());
  commit([
    { kind: "expense", id: x.id, data: x },
    ev("expense.add", null, expenseLabel(x), { ref: x.id }),
  ]);
  return x.id;
}

/**
 * Правка строки. При переходе в «оплачено» (и дальше: вышло, итог) пустая дата становится сегодняшней.
 * В журнал пишем оплату и итог. Цифры, внесённые уже после «итога», дописываем в ту же запись журнала.
 */
export function updateExpense(id: string, patch: Partial<Omit<Expense, "id">>) {
  const x = state.db.expenses[id];
  if (!x) return;
  const now = clock.now();
  const next: Expense = { ...x, ...patch, updatedAt: now };
  const rows: Row[] = [{ kind: "expense", id, data: next }];
  if (patch.status && patch.status !== x.status) {
    if (isPaid(next.status) && !next.date) next.date = dayKey(now);
    if (isPaid(next.status) && !isPaid(x.status)) rows.push(ev("expense.paid", null, expenseLabel(next), { ref: id }));
    if (next.status === "result") rows.push(ev("expense.result", null, resultLabel(next), { ref: id }));
  } else if (next.status === "result" && resultLabel(next) !== resultLabel(x)) {
    const last = Object.values(state.db.events)
      .filter((e) => e.type === "expense.result" && e.ref === id)
      .sort((a, b) => b.ts - a.ts)[0];
    if (last) rows.push({ kind: "event", id: last.id, data: { ...last, text: resultLabel(next) } });
    else rows.push(ev("expense.result", null, resultLabel(next), { ref: id }));
  }
  commit(rows);
}

export function deleteExpense(id: string) {
  if (!state.db.expenses[id]) return;
  commit([{ kind: "expense", id, data: null }]);
}

/** Бюджет месяца. null убирает бюджет. */
export function setBudget(month: string, amount: number | null, currency: Currency = "RUB") {
  const budgets = { ...(state.db.meta.budgets ?? {}) };
  if (amount === null) delete budgets[month];
  else budgets[month] = { amount, currency };
  updateMeta({ budgets });
}

function expenseImportRows(items: ExpenseInput[], source: string): { rows: Row[]; added: number } {
  const seen = new Set(Object.values(state.db.expenses).map(expenseKey));
  const base = clock.now();
  const fresh: Expense[] = [];
  for (const input of items) {
    const key = expenseKey(input);
    if (seen.has(key) || (input.id && state.db.expenses[input.id])) continue;
    seen.add(key);
    fresh.push(expenseOf(input, base + fresh.length));
  }
  const rows: Row[] = fresh.map((x) => ({ kind: "expense", id: x.id, data: x }));
  if (fresh.length === 1) rows.push(ev("expense.add", null, expenseLabel(fresh[0]), { ref: fresh[0].id }));
  else if (fresh.length > 1) {
    const n = fresh.length;
    rows.push(ev("expense.import", null, `${n} ${plural(n, ROW_FORMS)}${source ? ` из ${source}` : ""}, ${moneyByCurrency(fresh)}`));
  }
  return { rows, added: fresh.length };
}

/** Добавляет строки одним пакетом. Дубли по месяцу и ссылке на канал пропускаются. Возвращает, сколько добавлено. */
export function importExpenses(items: ExpenseInput[], source = ""): number {
  const { rows, added } = expenseImportRows(items, source);
  commit(rows);
  return added;
}

/** Есть ли уже закупка TeleTarget за октябрь целиком. */
export function teleTargetLoaded(db: DB = state.db): boolean {
  const have = new Set(Object.values(db.expenses).map(expenseKey));
  return teleTargetInputs().every((x) => have.has(expenseKey(x)));
}

/**
 * Загружает закупку TeleTarget и бюджет октября один раз.
 * Повторный запуск ничего не дублирует: строки сверяются по ссылке и месяцу, id у строк постоянные.
 */
export function loadTeleTarget(): number {
  const { rows, added } = expenseImportRows(teleTargetInputs(), "TeleTarget");
  if (!state.db.meta.budgets?.[TELETARGET_MONTH]) {
    rows.push({
      kind: "meta",
      id: "meta",
      data: { ...state.db.meta, budgets: { ...(state.db.meta.budgets ?? {}), [TELETARGET_MONTH]: TELETARGET_BUDGET } },
    });
  }
  commit(rows);
  return added;
}

// ───────────── Каналы, команда, настройки ─────────────

export function updateChannel(id: ChannelId, patch: Partial<Channel>) {
  const c = state.db.channels[id];
  const rows: Row[] = [{ kind: "channel", id, data: { ...c, ...patch } }];
  if (patch.status && patch.status !== c.status) {
    rows.push(ev("channel.status", id, `${CHANNELS[id].name}: ${STATUS_LABEL[patch.status].toLowerCase()}`));
  }
  commit(rows);
}

/**
 * Справочник аккаунтов канала. Строку account пишем рядом: ники через запятую, её читает старый код.
 * renames: старый ник → новый, закреплённые цели переезжают вслед за переименованным аккаунтом.
 */
export function setChannelAccounts(id: ChannelId, accounts: ChannelAccount[], renames: Record<string, string> = {}) {
  const c = state.db.channels[id];
  if (!c) return;
  const list: ChannelAccount[] = [];
  for (const a of accounts) {
    const handle = cleanHandle(a.handle);
    if (!handle || list.some((x) => x.handle === handle)) continue;
    list.push({ handle, memberId: a.memberId, label: a.label.trim() });
  }
  const rows: Row[] = [{ kind: "channel", id, data: { ...c, accounts: list, account: list.map((a) => a.handle).join(", ") } }];
  for (const t of Object.values(state.db.targets)) {
    const to = t.channelId === id && t.via ? cleanHandle(renames[t.via] ?? "") : "";
    if (to && to !== t.via) rows.push({ kind: "target", id: t.id, data: { ...t, via: to } });
  }
  commit(rows);
}

export function saveMember(m: Omit<Member, "id"> & { id?: string }): string {
  const id = m.id ?? uid();
  commit([{ kind: "member", id, data: { id, name: m.name.trim(), color: m.color } }]);
  return id;
}

export function removeMember(id: string) {
  commit([{ kind: "member", id, data: null }]);
  if (state.me === id) setMe(null);
}

export function setMe(id: string | null) {
  try {
    if (id) localStorage.setItem(ME_KEY, id);
    else localStorage.removeItem(ME_KEY);
  } catch {}
  set({ me: id });
}

// ───────────── Пульс ─────────────

export function savePulseSources(sources: PulseSources) {
  commit([{ kind: "pulse", id: "sources", data: sources }]);
}

export function savePulseDigest(digest: PulseDigest) {
  commit([{ kind: "pulse", id: "digest", data: digest }]);
}

/** Черновик ответа на пост по его ссылке. Пустой текст удаляет черновик. */
export function savePulseReply(url: string, draft: string) {
  const replies = { ...(state.db.pulse.replies ?? {}) };
  if (draft.trim()) replies[url] = draft;
  else delete replies[url];
  commit([{ kind: "pulse", id: "replies", data: replies }]);
}

/** Ответ отправлен (at) или отметка снята (null). */
export function savePulseSent(url: string, at: number | null) {
  const sent = { ...(state.db.pulse.sent ?? {}) };
  if (at) sent[url] = at;
  else delete sent[url];
  commit([{ kind: "pulse", id: "sent", data: sent }]);
}

export function updateMeta(patch: Partial<Meta>) {
  commit([{ kind: "meta", id: "meta", data: { ...state.db.meta, ...patch } }]);
}

// ───────────── Экспорт и импорт ─────────────

export function exportJSON(): string {
  return JSON.stringify({ app: "pult", version: 1, exportedAt: new Date().toISOString(), rows: dbToRows(state.db) }, null, 2);
}

function replaceAll(rows: Row[]) {
  const keep = new Set(rows.map((r) => `${r.kind}:${r.id}`));
  const removals: Row[] = dbToRows(state.db)
    .filter((r) => r.kind !== "meta" && !keep.has(`${r.kind}:${r.id}`))
    .map((r) => ({ kind: r.kind, id: r.id, data: null }));
  commit([...removals, ...rows]);
  if (state.me && !state.db.members[state.me]) setMe(null);
}

export function importJSON(text: string) {
  const parsed = JSON.parse(text) as { rows?: Row[] };
  if (!parsed || !Array.isArray(parsed.rows)) throw new Error("Это не файл экспорта дашборда");
  const rows = parsed.rows.filter((r) => r && typeof r.kind === "string" && typeof r.id === "string" && r.data);
  replaceAll(rows);
}

export function resetToSeed() {
  replaceAll(seedRows());
}
