"use client";

import { ClipboardPaste, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useShell } from "@/components/AppShell";
import { TaskMeta, byDue } from "@/components/tasks";
import { Avatar, Button, CheckCircle, Empty, IconButton, PageHead, Pills, cx } from "@/components/ui";
import { isPost } from "@/lib/content";
import { TASK_STATUS_LABEL } from "@/lib/meta";
import { moveTask, useApp } from "@/lib/store";
import type { Task, TaskStatus } from "@/lib/types";

const COLUMNS: TaskStatus[] = ["todo", "doing", "done"];
const DONE_LIMIT = 12;

export default function TasksPage() {
  const { db } = useApp();
  const shell = useShell();
  const [who, setWho] = useState<string>("all");
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ col: TaskStatus; before: string | null } | null>(null);
  const [allDone, setAllDone] = useState(false);

  const members = Object.values(db.members);
  const columns = useMemo(() => {
    const visible = Object.values(db.tasks).filter((t) => {
      if (t.daily || isPost(t)) return false;
      if (who === "none") return !t.assigneeId || !db.members[t.assigneeId];
      if (who !== "all") return t.assigneeId === who;
      return true;
    });
    const by: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] };
    for (const t of visible) by[t.status].push(t);
    by.todo.sort(byDue);
    by.doing.sort(byDue);
    by.done.sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
    return by;
  }, [db.tasks, db.members, who]);

  const drop = (col: TaskStatus) => {
    if (drag) moveTask(drag, col, over?.col === col ? over.before : null);
    setDrag(null);
    setOver(null);
  };

  return (
    <div className="stagger">
      <PageHead
        title="Задачи"
        right={
          <>
            <Button onClick={() => shell.openAdd({}, true)} title="Вставить список строк из переписки">
              <ClipboardPaste size={15} />
              Из чата
            </Button>
            <Button variant="primary" onClick={() => shell.openAdd()}>
              <Plus size={16} />
              Задача
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2.5">
        <Pills
          label="Исполнитель"
          value={who}
          onChange={setWho}
          options={[
            { value: "all", label: "Все" },
            ...members.map((m) => ({
              value: m.id,
              label: (
                <>
                  <Avatar member={m} size={16} />
                  {m.name}
                </>
              ),
            })),
            { value: "none", label: "Не назначено" },
          ]}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = columns[col];
          const shown = col === "done" && !allDone ? list.slice(0, DONE_LIMIT) : list;
          const active = drag !== null && over?.col === col;
          return (
            <section
              key={col}
              aria-label={TASK_STATUS_LABEL[col]}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                if (e.target === e.currentTarget || over?.col !== col) setOver({ col, before: null });
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(col);
              }}
              className={cx(
                "flex min-h-[220px] flex-col rounded-[20px] border bg-panel p-3 transition-[border-color,box-shadow] duration-300",
                active ? "border-accent/70 shadow-[0_0_0_4px_rgb(var(--glow)/0.1)]" : "border-line",
              )}
            >
              <header className="mb-2.5 flex h-9 items-center justify-between px-2">
                <h2 className="font-display flex items-center gap-2 text-[16px] font-medium">
                  {TASK_STATUS_LABEL[col]}
                  <span className="font-mono rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-normal tracking-normal text-muted">
                    {list.length}
                  </span>
                </h2>
                {col === "todo" && (
                  <IconButton label="Новая задача" onClick={() => shell.openAdd()}>
                    <Plus size={16} />
                  </IconButton>
                )}
              </header>

              <div className="flex flex-1 flex-col gap-2">
                {shown.map((t) => (
                  <div key={t.id}>
                    {active && over?.before === t.id && (
                      <div className="mb-2 h-0.5 rounded-full" style={{ background: "var(--grad)" }} />
                    )}
                    <article
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", t.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDrag(t.id);
                      }}
                      onDragEnd={() => {
                        setDrag(null);
                        setOver(null);
                      }}
                      onDragOver={(e) => {
                        if (!drag || drag === t.id) return;
                        e.preventDefault();
                        e.stopPropagation();
                        if (over?.col !== col || over.before !== t.id) setOver({ col, before: t.id });
                      }}
                      onClick={() => shell.openTask(t.id)}
                      className={cx(
                        "cursor-grab rounded-2xl border border-line bg-white/[0.035] p-3.5 transition-[transform,border-color,background-color,box-shadow,opacity] duration-300 ease-out-quint hover:-translate-y-0.5 hover:border-line-2 hover:bg-white/[0.06] hover:shadow-[0_14px_30px_-20px_rgba(0,0,0,0.9)] active:cursor-grabbing",
                        drag === t.id && "opacity-40",
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="pt-0.5">
                          <CheckCircle
                            size={18}
                            checked={t.status === "done"}
                            label={t.status === "done" ? "Вернуть в работу" : "Отметить выполненной"}
                            onChange={(v) => moveTask(t.id, v ? "done" : "todo")}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className={cx(
                              "text-[14.5px] leading-snug",
                              t.status === "done" ? "text-muted line-through" : "text-ink",
                            )}
                          >
                            {t.title}
                          </div>
                          <TaskMeta task={t} />
                        </div>
                        {t.assigneeId && db.members[t.assigneeId] && <Avatar member={db.members[t.assigneeId]} size={22} />}
                      </div>
                    </article>
                  </div>
                ))}
                {active && over?.before === null && list.length > 0 && (
                  <div className="h-0.5 rounded-full" style={{ background: "var(--grad)" }} />
                )}
                {list.length === 0 && (
                  <Empty title={col === "done" ? "Пока ничего не закрыто" : col === "doing" ? "Перетащите сюда задачу" : "Очередь пуста"} />
                )}
                {col === "done" && list.length > DONE_LIMIT && (
                  <Button variant="ghost" onClick={() => setAllDone((v) => !v)}>
                    {allDone ? "Свернуть" : `Показать ещё ${list.length - DONE_LIMIT}`}
                  </Button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
