"use client";

import { Cloud, Download, HardDrive, Menu, Plus, RotateCcw, Settings, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FUNNEL_LABEL, MEMBER_COLORS } from "@/lib/meta";
import type { TaskInput } from "@/lib/store";
import {
  dismissError,
  exportJSON,
  importJSON,
  initStore,
  removeMember,
  resetToSeed,
  saveMember,
  setMe,
  updateMeta,
  useApp,
} from "@/lib/store";
import { FUNNEL_STAGES } from "@/lib/types";
import { CycleWatch } from "./cycles";
import { ThemeToggle } from "./theme";
import { AddTaskModal, TaskEditor } from "./tasks";
import { Avatar, Button, IconButton, Logo, Modal, Toaster, cx, fieldClass } from "./ui";

interface Shell {
  openAdd: (defaults?: Partial<TaskInput>, bulk?: boolean) => void;
  openTask: (id: string) => void;
  openSettings: () => void;
}

const ShellCtx = createContext<Shell | null>(null);

export function useShell(): Shell {
  const ctx = useContext(ShellCtx);
  if (!ctx) throw new Error("useShell вызван вне AppShell");
  return ctx;
}

const NAV = [
  { href: "/", label: "Сегодня", match: (p: string) => p === "/" },
  { href: "/plan", label: "План", match: (p: string) => p.startsWith("/plan") },
  { href: "/pulse", label: "Пульс", match: (p: string) => p.startsWith("/pulse") },
  { href: "/analytics", label: "Результаты", match: (p: string) => p.startsWith("/analytics") },
  { href: "/channels/reddit", label: "Площадки", match: (p: string) => p.startsWith("/channels") },
  { href: "/tasks", label: "Задачи", match: (p: string) => p.startsWith("/tasks") },
  { href: "/docs", label: "Правила", match: (p: string) => p.startsWith("/docs") },
];

export function AppShell({ children }: { children: ReactNode }) {
  const app = useApp();
  const pathname = usePathname();
  const [add, setAdd] = useState<{ defaults: Partial<TaskInput>; bulk: boolean } | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    initStore();
  }, []);

  // Меню привязано к странице, на которой открыто: перешли по ссылке — закрылось само, без эффекта
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuOpen = menuFor === pathname;
  const current = NAV.find((n) => n.match(pathname));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAdd({ defaults: {}, bulk: false });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const shell = useMemo<Shell>(
    () => ({
      openAdd: (d, bulk) => setAdd({ defaults: d ?? {}, bulk: !!bulk }),
      openTask: setTaskId,
      openSettings: () => setSettings(true),
    }),
    [],
  );
  const closeAdd = useCallback(() => setAdd(null), []);
  const closeTask = useCallback(() => setTaskId(null), []);
  const closeSettings = useCallback(() => setSettings(false), []);
  const closeMenu = useCallback(() => setMenuFor(null), []);

  return (
    <ShellCtx.Provider value={shell}>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="font-display flex shrink-0 items-center gap-2.5 rounded-lg pr-1 text-[17px] font-medium">
            <Logo />
            <span className="hidden xl:inline">{app.db.meta.workspace}</span>
          </Link>
          {/* Узкий экран: вместо обрезанной ленты — название текущей вкладки, разделы в бургере */}
          <span className="font-display min-w-0 flex-1 truncate text-[15px] font-medium text-ink lg:hidden">{current?.label}</span>
          <nav className="relative hidden h-full min-w-0 flex-1 items-center gap-1 lg:flex" aria-label="Разделы">
            {NAV.map((n) => {
              const active = n.match(pathname);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "font-display relative flex h-full shrink-0 items-center px-3 text-[14.5px] font-medium transition-colors duration-200",
                    active ? "text-ink" : "text-ink/60 hover:text-ink",
                  )}
                >
                  {n.label}
                  <span
                    className={cx(
                      "absolute inset-x-3 bottom-0 h-0.5 origin-left rounded-full transition-transform duration-500 ease-out-quint",
                      active ? "scale-x-100" : "scale-x-0",
                    )}
                    style={{ background: "var(--grad)" }}
                  />
                </Link>
              );
            })}
          </nav>
          <SyncBadge sync={app.sync} ready={app.ready} />
          <Button variant="primary" onClick={() => setAdd({ defaults: {}, bulk: false })} title="Новая задача (⌘K)">
            <Plus size={16} />
            <span className="hidden sm:inline">Задача</span>
          </Button>
          <ThemeToggle />
          <MemberMenu onSettings={() => setSettings(true)} />
          <IconButton
            label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuFor(menuOpen ? null : pathname)}
            className="size-10 lg:hidden"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </IconButton>
        </div>
      </header>
      <MobileNav open={menuOpen} pathname={pathname} onClose={closeMenu} />
      <NamePicker onOther={() => setSettings(true)} />

      <main className="relative z-[1] mx-auto w-full max-w-[1200px] px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
        {app.error && (
          <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-crit/40 bg-crit/10 px-4 py-3 text-[14px]">
            <span>{app.error}</span>
            <IconButton label="Скрыть" onClick={dismissError}>
              <X size={16} />
            </IconButton>
          </div>
        )}
        {app.ready ? (
          <div key={pathname} className="fade-in">
            {children}
          </div>
        ) : (
          <div className="space-y-4" aria-busy="true" aria-label="Загрузка">
            <div className="h-12 w-80 max-w-full animate-pulse rounded-2xl bg-panel" />
            <div className="h-72 animate-pulse rounded-[20px] bg-panel" />
            <div className="h-40 animate-pulse rounded-[20px] bg-panel" />
          </div>
        )}
      </main>

      <AddTaskModal key={add ? (add.bulk ? "bulk" : "one") : "closed"} open={add !== null} defaults={add?.defaults} bulk={add?.bulk} onClose={closeAdd} />
      <TaskEditor taskId={taskId} onClose={closeTask} />
      <SettingsModal open={settings} onClose={closeSettings} />
      <Toaster />
      <CycleWatch />
    </ShellCtx.Provider>
  );
}

function SyncBadge({ sync, ready }: { sync: "local" | "supabase"; ready: boolean }) {
  if (!ready) return null;
  const cloud = sync === "supabase";
  return (
    <span
      className="font-mono hidden shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10.5px] uppercase tracking-[0.12em] text-muted lg:inline-flex"
      title={cloud ? "Данные в общей базе Supabase, изменения видны всем" : "Данные хранятся только в этом браузере"}
    >
      {cloud ? <Cloud size={13} /> : <HardDrive size={13} />}
      {cloud ? "Общая база" : "Локально"}
    </span>
  );
}

function MemberMenu({ onSettings }: { onSettings: () => void }) {
  const { db, me } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Кто я и настройки"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center rounded-full transition-opacity hover:opacity-85"
      >
        <Avatar member={me ? db.members[me] : null} size={32} />
      </button>
      {open && (
        <div role="menu" className="pop-in absolute right-0 top-12 z-50 w-60 rounded-2xl border border-white/12 bg-menu p-2 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
          <div className="eyebrow px-2 pb-2 pt-1.5">Кто работает здесь</div>
          {Object.values(db.members).map((m) => (
            <button
              key={m.id}
              type="button"
              role="menuitemradio"
              aria-checked={me === m.id}
              onClick={() => {
                setMe(m.id);
                setOpen(false);
              }}
              className={cx(
                "flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[14px] transition-colors hover:bg-white/[0.06]",
                me === m.id && "bg-white/[0.06]",
              )}
            >
              <Avatar member={m} size={20} />
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              {me === m.id && <span className="text-[12px] text-muted">это я</span>}
            </button>
          ))}
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSettings();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[14px] transition-colors hover:bg-white/[0.06]"
          >
            <Settings size={16} className="text-muted" />
            Настройки
          </button>
        </div>
      )}
    </div>
  );
}

const NAV_HINT: Record<string, string> = {
  "/": "Что сделать сегодня",
  "/plan": "Посты на неделю",
  "/analytics": "Что сработало",
  "/channels/reddit": "Куда разносим посты",
  "/tasks": "Работа, которая не пост",
  "/docs": "Рубрики, пороги, чеклист",
};

/** Меню разделов для экранов уже lg. Выпадает под шапкой, закрывается по ссылке, Esc и клику мимо. */
function MobileNav({ open, pathname, onClose }: { open: boolean; pathname: string; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // Ширину меряем на каждом ресайзе: развернули окно до lg — меню больше не нужно
    const mq = window.matchMedia("(min-width: 1024px)");
    const onWide = () => mq.matches && onClose();
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onWide);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onWide);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fade-in fixed inset-x-0 bottom-0 top-16 z-30 bg-black/50 backdrop-blur-sm lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <nav id="mobile-nav" aria-label="Разделы" className="pop-in mx-auto max-w-[1200px] border-b border-line bg-menu px-3 pb-4 pt-2 sm:px-5">
        <ul className="grid gap-1 sm:grid-cols-2">
          {NAV.map((n) => {
            const active = n.match(pathname);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  onClick={onClose}
                  className={cx(
                    "flex min-h-[52px] items-center gap-3 rounded-2xl px-4 py-2.5 transition-colors",
                    active ? "bg-accent/[0.12] text-ink" : "text-ink-2 hover:bg-white/[0.05] hover:text-ink",
                  )}
                >
                  <span className={cx("h-6 w-0.5 shrink-0 rounded-full", active ? "bg-accent" : "bg-transparent")} aria-hidden />
                  <span className="min-w-0">
                    <span className="font-display block text-[16px] font-medium leading-tight">{n.label}</span>
                    <span className="block truncate text-[12.5px] text-muted">{NAV_HINT[n.href]}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

const WHO_SKIP_KEY = "qcai:who-skip";

/**
 * Выбор имени один раз: показывается, пока имя не выбрано и окно не закрыли.
 * Закрыли — больше не спрашиваем; сменить имя можно в меню аватара.
 */
function NamePicker({ onOther }: { onOther: () => void }) {
  const { db, me, ready } = useApp();
  const [skipped, setSkipped] = useState(() => typeof window !== "undefined" && localStorage.getItem(WHO_SKIP_KEY) === "1");
  const [name, setName] = useState("");
  const members = Object.values(db.members);

  const skip = () => {
    localStorage.setItem(WHO_SKIP_KEY, "1");
    setSkipped(true);
  };
  const add = () => {
    const n = name.trim();
    if (!n) return;
    setMe(saveMember({ name: n, color: MEMBER_COLORS[members.length % MEMBER_COLORS.length] }));
  };

  return (
    <Modal open={ready && !me && !skipped} onClose={skip} title="Кто вы?">
      <p className="mb-4 text-[14px] text-ink-2">Выберите себя один раз. Задачи и отметки будут записываться на ваше имя.</p>
      {members.length > 0 && (
        <ul className="mb-4 grid gap-1.5 sm:grid-cols-2">
          {members.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                data-autofocus={i === 0 ? "" : undefined}
                onClick={() => setMe(m.id)}
                className="press flex w-full items-center gap-3 rounded-2xl border border-line bg-white/[0.03] px-3.5 py-3 text-left text-[15px] font-medium hover:border-accent/50 hover:bg-accent/[0.08]"
              >
                <Avatar member={m} size={28} />
                <span className="min-w-0 truncate">{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="eyebrow mb-2">Нет в списке</div>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Ваше имя"
          aria-label="Ваше имя"
          className={fieldClass}
        />
        <Button variant="primary" onClick={add} disabled={!name.trim()}>
          Это я
        </Button>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={onOther}>
          Управлять командой
        </Button>
        <Button variant="ghost" onClick={skip}>
          Пропустить
        </Button>
      </div>
    </Modal>
  );
}

function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, me, sync } = useApp();
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const members = Object.values(db.members);

  const add = () => {
    const n = name.trim();
    if (!n) return;
    const id = saveMember({ name: n, color: MEMBER_COLORS[members.length % MEMBER_COLORS.length] });
    if (!me) setMe(id);
    setName("");
  };

  const download = () => {
    const blob = new Blob([exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quadcode-dashboard-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        setNotice(null);
        setConfirmReset(false);
        onClose();
      }}
      title="Настройки"
      wide
    >
      <div className="space-y-6">
        <section>
          <h3 className="eyebrow mb-2.5">Название пространства</h3>
          <input
            key={db.meta.workspace}
            defaultValue={db.meta.workspace}
            onBlur={(e) => {
              const workspace = e.target.value.trim();
              if (workspace && workspace !== db.meta.workspace) updateMeta({ workspace });
            }}
            className={cx(fieldClass, "max-w-xs")}
          />
        </section>

        <section>
          <h3 className="eyebrow mb-2.5">Команда</h3>
          <ul className="space-y-1.5">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Сменить цвет"
                  title="Сменить цвет"
                  onClick={() =>
                    saveMember({ ...m, color: MEMBER_COLORS[(MEMBER_COLORS.indexOf(m.color) + 1) % MEMBER_COLORS.length] })
                  }
                >
                  <Avatar member={m} size={28} />
                </button>
                <input
                  key={m.id + m.name}
                  defaultValue={m.name}
                  aria-label="Имя"
                  onBlur={(e) => {
                    const n = e.target.value.trim();
                    if (n && n !== m.name) saveMember({ ...m, name: n });
                  }}
                  className={cx(fieldClass, "max-w-[220px]")}
                />
                <Button variant={me === m.id ? "soft" : "ghost"} onClick={() => setMe(m.id)} aria-pressed={me === m.id}>
                  {me === m.id ? "Это я" : "Я"}
                </Button>
                <IconButton label="Убрать из команды" onClick={() => removeMember(m.id)} disabled={members.length <= 1}>
                  <Trash2 size={15} />
                </IconButton>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Имя нового участника"
              className={cx(fieldClass, "max-w-[264px]")}
            />
            <Button onClick={add} disabled={!name.trim()}>
              <Plus size={15} />
              Добавить
            </Button>
          </div>
        </section>

        <section>
          <h3 className="eyebrow mb-2.5">Ориентир по воронке на неделю</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {FUNNEL_STAGES.map((s) => (
              <label key={s} className="block">
                <span className="mb-1 block text-[12.5px] text-ink-2">{FUNNEL_LABEL[s]}</span>
                <input
                  type="number"
                  min={0}
                  key={`${s}:${db.meta.funnelGoal[s]}`}
                  defaultValue={db.meta.funnelGoal[s]}
                  onBlur={(e) => {
                    const v = Math.max(0, Math.round(Number(e.target.value) || 0));
                    if (v !== db.meta.funnelGoal[s]) updateMeta({ funnelGoal: { ...db.meta.funnelGoal, [s]: v } });
                  }}
                  className={fieldClass}
                />
              </label>
            ))}
          </div>
        </section>

        <section>
          <h3 className="eyebrow mb-2.5">Данные</h3>
          <p className="mb-3 text-[13.5px] text-ink-2">
            {sync === "supabase"
              ? "Подключена общая база Supabase. Изменения сразу видны всем, у кого открыт дашборд."
              : "Сейчас данные хранятся только в этом браузере. Коллега увидит их после подключения Supabase или через файл экспорта."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={download}>
              <Download size={15} />
              Экспорт в файл
            </Button>
            <Button onClick={() => file.current?.click()}>
              <Upload size={15} />
              Импорт из файла
            </Button>
            {confirmReset ? (
              <>
                <Button
                  variant="danger"
                  onClick={() => {
                    resetToSeed();
                    setConfirmReset(false);
                    setNotice("Данные возвращены к исходным.");
                  }}
                >
                  Точно сбросить
                </Button>
                <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                  Отмена
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmReset(true)}>
                <RotateCcw size={15} />
                Сбросить к исходным
              </Button>
            )}
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  importJSON(await f.text());
                  setNotice("Импорт завершён.");
                } catch (err) {
                  setNotice(`Не получилось импортировать: ${err instanceof Error ? err.message : String(err)}`);
                }
              }}
            />
          </div>
          {confirmReset && (
            <p className="mt-2 text-[13px] text-muted">Все задачи, отметки и журнал действий заменятся исходными данными.</p>
          )}
          {notice && (
            <p role="status" className="mt-2 text-[13px] text-ink-2">
              {notice}
            </p>
          )}
        </section>
      </div>
    </Modal>
  );
}
