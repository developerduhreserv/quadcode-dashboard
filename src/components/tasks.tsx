"use client";

import { ArrowDown, CalendarDays, ClipboardPaste, CornerDownLeft, Flame, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { addDays, dayKey, shortDate, startOfDay } from "@/lib/analytics";
import { CHANNELS, PRIORITY_LABEL, TASK_FORMS, TASK_STATUS_LABEL, plural } from "@/lib/meta";
import { parseBulk, parseQuick } from "@/lib/parse";
import type { TaskInput } from "@/lib/store";
import { addTask, addTasks, deleteTask, moveTask, updateTask, useApp } from "@/lib/store";
import { CHANNEL_IDS } from "@/lib/types";
import type { ChannelId, Member, Priority, Task, TaskStatus } from "@/lib/types";
import { isPost } from "@/lib/content";
import { FormatBadge, PostFields } from "./post";
import { Avatar, Button, ChannelChip, CheckCircle, Modal, Pills, cx, fieldClass } from "./ui";

export function dueInfo(due: string | null, now = Date.now()): { label: string; overdue: boolean } | null {
  if (!due) return null;
  const today = dayKey(now);
  const [y, m, d] = due.split("-").map(Number);
  const ts = new Date(y, m - 1, d).getTime();
  let label = shortDate(ts);
  if (due === today) label = "сегодня";
  else if (due === dayKey(addDays(startOfDay(now), 1))) label = "завтра";
  else if (due === dayKey(addDays(startOfDay(now), -1))) label = "вчера";
  return { label, overdue: due < today };
}

/** По сроку: ближайшие сверху, без срока в конце. Внутри дня сначала срочные. */
export function byDue(a: Task, b: Task): number {
  if (a.due !== b.due) return (a.due ?? "9999") < (b.due ?? "9999") ? -1 : 1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.order - b.order;
}

export function sortOpen(a: Task, b: Task): number {
  if (a.status !== b.status) return a.status === "doing" ? -1 : 1;
  return byDue(a, b);
}

export function PriorityMark({ priority }: { priority: Priority }) {
  if (priority === 2)
    return (
      <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-2" title="Срочно">
        <Flame size={13} className="text-serious" />
        срочно
      </span>
    );
  if (priority === 0)
    return (
      <span className="inline-flex items-center text-muted" title="Низкий приоритет">
        <ArrowDown size={13} />
      </span>
    );
  return null;
}

export function TaskMeta({ task }: { task: Task }) {
  const due = dueInfo(task.due);
  const post = isPost(task) && !task.daily;
  if (!task.channelId && task.priority === 1 && !due && !post) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <ChannelChip id={task.channelId} />
      {post && <FormatBadge id={task.format} size="xs" />}
      {post && task.time && <span className="font-mono text-[12px] text-muted">{task.time}</span>}
      <PriorityMark priority={task.priority} />
      {due && task.status !== "done" && (
        <span className={cx("inline-flex items-center gap-1 text-[12.5px]", due.overdue ? "text-ink" : "text-muted")}>
          <CalendarDays size={13} className={due.overdue ? "text-crit" : ""} />
          {due.overdue ? `просрочено, ${due.label}` : due.label}
        </span>
      )}
    </div>
  );
}

/** Строка задачи для списков на «Обзоре» и в карточке канала. */
export function TaskRow({ task, members, onOpen }: { task: Task; members: Record<string, Member>; onOpen: (id: string) => void }) {
  const done = task.status === "done";
  return (
    <div
      className="group flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2.5 transition-colors duration-200 hover:bg-white/[0.05]"
      onClick={() => onOpen(task.id)}
    >
      <div className="pt-0.5">
        <CheckCircle
          checked={done}
          label={done ? "Вернуть в работу" : "Отметить выполненной"}
          onChange={(v) => moveTask(task.id, v ? "done" : "todo")}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className={cx("text-[14.5px] leading-snug transition-colors duration-300", done ? "text-muted line-through" : "text-ink")}>{task.title}</div>
        <TaskMeta task={task} />
      </div>
      {task.assigneeId && members[task.assigneeId] && <Avatar member={members[task.assigneeId]} size={22} />}
    </div>
  );
}

function ParsedChips({ input, members }: { input: TaskInput; members: Record<string, Member> }) {
  const due = dueInfo(input.due ?? null);
  const who = input.assigneeId ? members[input.assigneeId] : null;
  if (!input.channelId && !who && input.priority === 1 && !due) return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <ChannelChip id={input.channelId ?? null} />
      {who && (
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
          <Avatar member={who} size={16} />
          {who.name}
        </span>
      )}
      <PriorityMark priority={input.priority ?? 1} />
      {due && (
        <span className="inline-flex items-center gap-1 text-[12.5px] text-muted">
          <CalendarDays size={13} />
          {due.label}
        </span>
      )}
    </span>
  );
}

/** Поле быстрого ввода задачи. Enter добавляет. */
export function QuickCapture({
  defaults,
  placeholder = "Кинуть задачу в список…",
  autoFocus,
  large,
  onAdded,
}: {
  defaults?: Partial<TaskInput>;
  placeholder?: string;
  autoFocus?: boolean;
  large?: boolean;
  onAdded?: () => void;
}) {
  const { db } = useApp();
  const [value, setValue] = useState("");
  const members = useMemo(() => Object.values(db.members), [db.members]);
  const parsed = useMemo(() => {
    const p = parseQuick(value, members);
    return {
      ...defaults,
      ...p,
      channelId: p.channelId ?? defaults?.channelId ?? null,
      assigneeId: p.assigneeId ?? defaults?.assigneeId ?? null,
      due: p.due ?? defaults?.due ?? null,
    };
  }, [value, members, defaults]);

  const submit = () => {
    if (!parsed.title) return;
    addTask(parsed);
    setValue("");
    onAdded?.();
  };

  return (
    <div className={cx("prompt", large ? "rounded-[18px] px-5 py-4" : "rounded-2xl px-4 py-3")}>
      <div className="flex items-center gap-3">
        <span className={cx("font-mono shrink-0 text-accent", large ? "text-[17px]" : "text-[15px]")} aria-hidden>
          ›
        </span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          aria-label="Новая задача"
          data-autofocus={autoFocus ? "" : undefined}
          className={cx("min-w-0 flex-1 bg-transparent outline-none placeholder:text-white/40", large ? "text-[17px]" : "text-[15px]")}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!parsed.title}
          aria-label="Добавить задачу"
          className="press inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_8px_20px_-10px_rgb(var(--glow)/0.8)] hover:bg-accent-hover disabled:bg-white/[0.06] disabled:text-muted disabled:shadow-none"
        >
          <CornerDownLeft size={17} />
        </button>
      </div>
      {value.trim() && (
        <div className={cx("mt-2 flex min-h-[20px] flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted", large ? "pl-7" : "pl-6")}>
          <ParsedChips input={parsed} members={db.members} />
        </div>
      )}
    </div>
  );
}

function ChannelPicker({ value, onChange }: { value: ChannelId | null; onChange: (v: ChannelId | null) => void }) {
  return (
    <Pills
      label="Канал"
      value={value ?? "none"}
      onChange={(v) => onChange(v === "none" ? null : (v as ChannelId))}
      options={[
        ...CHANNEL_IDS.map((id) => ({
          value: id as string,
          label: (
            <>
              <span className="size-2 rounded-[3px]" style={{ background: CHANNELS[id].color }} />
              {CHANNELS[id].name}
            </>
          ),
        })),
        { value: "none", label: "Без канала" },
      ]}
    />
  );
}

/** Окно «Новая задача»: одна строка или список, вставленный из чата. */
export function AddTaskModal({
  open,
  defaults,
  bulk,
  onClose,
}: {
  open: boolean;
  defaults?: Partial<TaskInput>;
  bulk?: boolean;
  onClose: () => void;
}) {
  const { db } = useApp();
  const [mode, setMode] = useState<"one" | "bulk">(bulk ? "bulk" : "one");
  const [text, setText] = useState("");
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const members = useMemo(() => Object.values(db.members), [db.members]);
  const parsed = useMemo(
    () => parseBulk(text, members).map((t) => ({ ...t, channelId: t.channelId ?? defaults?.channelId ?? null })),
    [text, members, defaults?.channelId],
  );
  const chosen = parsed.filter((_, i) => !skip.has(i));

  const close = () => {
    setText("");
    setSkip(new Set());
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title="Новая задача" wide>
      <div className="mb-3">
        <Pills
          label="Способ ввода"
          value={mode}
          onChange={setMode}
          options={[
            { value: "one", label: "Одна задача" },
            {
              value: "bulk",
              label: (
                <>
                  <ClipboardPaste size={14} />
                  Список из чата
                </>
              ),
            },
          ]}
        />
      </div>

      {mode === "one" ? (
        <QuickCapture autoFocus large defaults={defaults} placeholder="Что нужно сделать?" onAdded={close} />
      ) : (
        <div>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSkip(new Set());
            }}
            data-autofocus=""
            rows={6}
            placeholder={"Вставьте кусок переписки или список.\nКаждая строка станет отдельной задачей."}
            className={cx(fieldClass, "resize-y")}
          />
          {parsed.length > 0 && (
            <ul className="mt-3 max-h-[38vh] space-y-1 overflow-y-auto pr-1">
              {parsed.map((t, i) => (
                <li key={i} className="flex items-start gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/[0.05]">
                  <div className="pt-0.5">
                    <CheckCircle
                      size={18}
                      checked={!skip.has(i)}
                      label="Добавить эту строку"
                      onChange={(v) => {
                        const next = new Set(skip);
                        if (v) next.delete(i);
                        else next.add(i);
                        setSkip(next);
                      }}
                    />
                  </div>
                  <div className={cx("min-w-0 flex-1 text-[14px]", skip.has(i) && "text-muted line-through")}>
                    {t.title}
                    <div className="mt-1 empty:hidden">
                      <ParsedChips input={t} members={db.members} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Отмена
            </Button>
            <Button
              variant="primary"
              disabled={!chosen.length}
              onClick={() => {
                addTasks(chosen);
                close();
              }}
            >
              {chosen.length ? `Добавить ${chosen.length} ${plural(chosen.length, TASK_FORMS)}` : "Добавить"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow mb-2">{label}</div>
      {children}
    </div>
  );
}

/** Окно редактирования задачи. Изменения сохраняются сразу. */
export function TaskEditor({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const { db } = useApp();
  const task = taskId ? db.tasks[taskId] : undefined;
  const members = Object.values(db.members);
  if (!task) return null;
  const author = task.createdBy ? db.members[task.createdBy]?.name : null;

  return (
    <Modal open onClose={onClose} title="Задача" wide>
      <div className="space-y-4">
        <textarea
          key={task.id}
          defaultValue={task.title}
          rows={2}
          aria-label="Название"
          onBlur={(e) => {
            const title = e.target.value.trim();
            if (title && title !== task.title) updateTask(task.id, { title });
          }}
          className={cx(fieldClass, "font-display resize-none text-[18px] font-medium")}
        />
        <Field label="Заметка">
          <textarea
            key={task.id}
            defaultValue={task.note}
            rows={Math.min(22, Math.max(3, task.note.split("\n").length + Math.ceil(task.note.length / 90)))}
            placeholder="Детали, ссылки, договорённости"
            onBlur={(e) => {
              if (e.target.value !== task.note) updateTask(task.id, { note: e.target.value });
            }}
            className={cx(fieldClass, "resize-y text-[14px] leading-relaxed")}
          />
        </Field>
        {!task.daily && isPost(task) && <PostFields task={task} />}
        <Field label="Повтор">
          <Pills
            label="Повтор"
            value={task.daily ? "daily" : "once"}
            onChange={(v) => updateTask(task.id, { daily: v === "daily" })}
            options={[
              { value: "once", label: "Разовая" },
              { value: "daily", label: "Каждый день, в закреп" },
            ]}
          />
        </Field>
        {!task.daily && (
          <Field label="Статус">
            <Pills
              label="Статус"
              value={task.status}
              onChange={(s: TaskStatus) => moveTask(task.id, s)}
              options={(["todo", "doing", "done"] as TaskStatus[]).map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }))}
            />
          </Field>
        )}
        {(task.daily || !isPost(task)) && (
          <Field label="Канал">
            <ChannelPicker value={task.channelId} onChange={(channelId) => updateTask(task.id, { channelId })} />
          </Field>
        )}
        <Field label="Кто делает">
          <Pills
            label="Исполнитель"
            value={task.assigneeId && db.members[task.assigneeId] ? task.assigneeId : "none"}
            onChange={(v) => updateTask(task.id, { assigneeId: v === "none" ? null : v })}
            options={[
              ...members.map((m) => ({
                value: m.id,
                label: (
                  <>
                    <Avatar member={m} size={16} />
                    {m.name}
                  </>
                ),
              })),
              { value: "none", label: "Никто" },
            ]}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Приоритет">
            <Pills
              label="Приоритет"
              value={String(task.priority)}
              onChange={(v) => updateTask(task.id, { priority: Number(v) as Priority })}
              options={([2, 1, 0] as Priority[]).map((p) => ({ value: String(p), label: PRIORITY_LABEL[p] }))}
            />
          </Field>
          <Field label="Срок">
            <input
              type="date"
              value={task.due ?? ""}
              onChange={(e) => updateTask(task.id, { due: e.target.value || null })}
              className={cx(fieldClass, "max-w-[190px]")}
            />
          </Field>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="text-[12.5px] text-muted">
            Создана {shortDate(task.createdAt)}
            {author ? `, ${author}` : ""}
          </span>
          <Button
            variant="danger"
            onClick={() => {
              deleteTask(task.id);
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
