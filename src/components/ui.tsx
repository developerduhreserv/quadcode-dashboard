"use client";

import { Check as CheckIcon, CircleDashed, Clock3, Pause, X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { siDiscord, siReddit, siThreads, siX } from "simple-icons";
import { CHANNELS, STATUS_LABEL } from "@/lib/meta";
import type { ChannelId, ChannelStatus, Member } from "@/lib/types";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export const fieldClass =
  "w-full rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted border border-line outline-none transition-[border-color,background-color,box-shadow] duration-200 hover:border-line-2 focus:border-accent/60 focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgb(var(--glow)/0.12)]";

/** Число, которое плавно докручивается до нового значения. format задаёт вид, например «4 750» или «19,99». */
export function Num({ value, format }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    const start = current.current;
    if (start === value) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce ? 0 : 900;
    // Целые крутим целыми, дробные (19,99 $) по сотым и в конце ставим точное значение
    const step = Number.isInteger(value) && Number.isInteger(start) ? 1 : 100;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = duration ? Math.min(1, (t - t0) / duration) : 1;
      const eased = 1 - Math.pow(1 - p, 5);
      current.current = p === 1 ? value : Math.round((start + (value - start) * eased) * step) / step;
      setShown(current.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format ? format(shown) : shown}</>;
}

/** Текст, выезжающий по словам. start сдвигает очередь, если строк несколько. */
export function Words({ text, start = 0, className }: { text: string; start?: number; className?: string }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span key={`${w}-${i}`} className={cx("word", className)} style={{ "--i": start + i } as CSSProperties}>
          {w}
          {" "}
        </span>
      ))}
    </>
  );
}

export function Panel({
  eyebrow,
  title,
  hint,
  right,
  children,
  className,
}: {
  eyebrow?: string;
  title?: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("card rounded-[20px] p-4 sm:p-6", className)}>
      {(title || right || eyebrow) && (
        <header className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
            {title && <h2 className="font-display text-[19px] font-medium leading-tight text-ink">{title}</h2>}
            {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Tile({
  label,
  value,
  sub,
  highlight,
  title,
}: {
  label: string;
  value: number | string;
  sub?: ReactNode;
  highlight?: boolean;
  /** Подсказка при наведении */
  title?: string;
}) {
  return (
    <div title={title} className="min-w-0 rounded-2xl border border-line bg-white/[0.03] px-4 py-3.5 transition-colors duration-300 hover:border-line-2 hover:bg-white/[0.05]">
      <div
        className={cx(
          "font-display truncate text-[30px] font-medium leading-none",
          highlight ? "grad-text" : "text-ink",
        )}
      >
        {typeof value === "number" ? <Num value={value} /> : value}
      </div>
      <div className="mt-2 truncate text-[13px] text-muted">{label}</div>
      {sub && <div className="mt-0.5 truncate text-[12.5px] text-muted/80">{sub}</div>}
    </div>
  );
}

export function Pills<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap items-center gap-1.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "press inline-flex h-8 items-center gap-1.5 rounded-[10px] border px-3 text-[13.5px] font-medium",
              active
                ? "border-accent/50 bg-accent/[0.12] text-ink"
                : "border-white/10 bg-white/[0.035] text-muted hover:border-white/20 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Переключатель-сегменты во всю ширину: одна плашка, внутри варианты. Не влезают: листаются вбок. */
export function Segments<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full gap-1 overflow-x-auto rounded-[14px] border border-line bg-white/[0.03] p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "press inline-flex h-9 min-w-fit flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] px-2 text-[13px] font-medium sm:px-3 sm:text-[13.5px]",
              active
                ? "bg-accent/[0.12] text-ink shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.5)]"
                : "text-muted hover:bg-white/[0.05] hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

type ButtonVariant = "primary" | "soft" | "ghost" | "danger";

export function Button({
  variant = "soft",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const styles: Record<ButtonVariant, string> = {
    primary:
      "sheen bg-accent text-accent-ink font-semibold shadow-[0_8px_24px_-12px_rgb(var(--glow)/0.75)] hover:bg-accent-hover hover:shadow-[0_10px_30px_-10px_rgb(var(--glow)/0.85)]",
    soft: "border border-white/12 bg-white/[0.04] text-ink font-medium hover:border-white/25 hover:bg-white/[0.08]",
    ghost: "text-muted font-medium hover:bg-white/[0.06] hover:text-ink",
    danger: "text-crit font-medium hover:bg-crit/10",
  };
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "press inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-[14px] tracking-[-0.01em] disabled:pointer-events-none disabled:opacity-40",
        styles[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cx(
        "press inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/[0.08] hover:text-ink disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // onClose часто новая функция на каждый рендер. Эффект от неё не зависит, иначе фокус прыгает при каждом сохранении поля
  const close = useEffectEvent(() => onClose());

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const auto = ref.current?.querySelector<HTMLElement>("[data-autofocus]");
    (auto ?? ref.current)?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 pt-[8vh] backdrop-blur-md sm:p-6 sm:pt-[10vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cx(
          "pop-in w-full rounded-[22px] border border-white/12 bg-menu p-5 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] outline-none sm:p-6",
          wide ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="font-display text-[20px] font-medium">{title}</h2>
          <IconButton label="Закрыть" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** top: сверху, под шапкой. wait: отказ «рано», вместо галочки жёлтые часы. */
export interface ToastOpts {
  top?: boolean;
  wait?: boolean;
}
type ToastMsg = ToastOpts & { text: string; ms: number };
const toastSubs = new Set<(m: ToastMsg) => void>();

/** Короткое уведомление, по умолчанию внизу экрана. Рисует его Toaster из AppShell. */
export function toast(text: string, ms = 1500, opts: ToastOpts = {}) {
  toastSubs.forEach((f) => f({ ...opts, text, ms }));
}

/** Пилюля по центру снизу или сверху: проявляется и растворяется, новое сообщение заменяет старое. */
export function Toaster() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    let timer = 0;
    const show = (m: ToastMsg) => {
      window.clearTimeout(timer);
      setMsg(m);
      setOn(true);
      timer = window.setTimeout(() => setOn(false), m.ms);
    };
    toastSubs.add(show);
    return () => {
      toastSubs.delete(show);
      window.clearTimeout(timer);
    };
  }, []);
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4 transition-opacity duration-300 ease-out-quint",
        msg?.top ? "top-[76px]" : "bottom-6",
        on ? "opacity-100" : "opacity-0",
      )}
    >
      {msg && (
        // Длинный текст переносится, а не обрезается: на телефоне важная часть часто в конце
        <span className="inline-flex max-w-full items-center gap-2 rounded-[22px] border border-white/12 bg-menu/95 px-4 py-2.5 text-[14px] font-medium leading-snug text-ink shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-md">
          {msg.wait ? (
            <Clock3 size={15} strokeWidth={2.4} className="shrink-0 text-warn" />
          ) : (
            <CheckIcon size={15} strokeWidth={2.6} className="shrink-0 text-accent" />
          )}
          <span className="min-w-0 text-balance">{msg.text}</span>
        </span>
      )}
    </div>
  );
}

export function Avatar({ member, size = 24 }: { member?: Member | null; size?: number }) {
  if (!member) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-line-2 text-muted"
        style={{ width: size, height: size, fontSize: size * 0.45 }}
        title="Не назначено"
      >
        ?
      </span>
    );
  }
  const initials = member.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="font-display inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[#121217]"
      style={{ width: size, height: size, fontSize: size * 0.42, background: member.color, letterSpacing: 0 }}
      title={member.name}
    >
      {initials}
    </span>
  );
}

const ICON_PATH: Record<ChannelId, string> = {
  x: siX.path,
  threads: siThreads.path,
  discord: siDiscord.path,
  reddit: siReddit.path,
};

/** Значок канала в цветной плашке. */
export function ChannelIcon({ id, size = 28 }: { id: ChannelId; size?: number }) {
  const color = CHANNELS[id].color;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[10px]"
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 18%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 35%, transparent)`,
        color,
      }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.54} height={size * 0.54} fill="currentColor">
        <path d={ICON_PATH[id]} />
      </svg>
    </span>
  );
}

/** Голый логотип соцсети в цвет текста: для строк и чипов. */
export function ChannelGlyph({ id, size = 14, className }: { id: ChannelId; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden className={cx("shrink-0", className)}>
      <path d={ICON_PATH[id]} />
    </svg>
  );
}

export function ChannelChip({ id }: { id: ChannelId | null }) {
  if (!id) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/8 bg-white/[0.04] py-0.5 pl-1.5 pr-2 text-[12.5px] text-ink-2">
      <span className="size-2 rounded-[3px]" style={{ background: CHANNELS[id].color }} />
      {CHANNELS[id].name}
    </span>
  );
}

export function StatusBadge({ status }: { status: ChannelStatus }) {
  const icon =
    status === "active" ? (
      <span className="relative flex size-2">
        <span className="ping-soft absolute inline-flex size-full rounded-full bg-good" />
        <span className="relative inline-flex size-2 rounded-full bg-good" />
      </span>
    ) : status === "paused" ? (
      <Pause size={11} className="text-warn" fill="currentColor" />
    ) : (
      <CircleDashed size={12} className="text-muted" />
    );
  return (
    <span className="font-mono inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10.5px] uppercase tracking-[0.1em] text-ink-2">
      {icon}
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Круглая галочка. Заливка проявляется и гаснет плавно (300 мс), так кружки тают при новом круге.
 * locked: отмечено, но действие пока недоступно, вместо галочки часы.
 */
export function CheckCircle({
  checked,
  onChange,
  label,
  size = 20,
  locked,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  size?: number;
  locked?: boolean;
}) {
  const filled = checked && !locked;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center rounded-full border transition-[border-color,background-color,color,box-shadow] duration-300",
        filled && "check-pop border-transparent text-accent-ink shadow-[0_4px_14px_-6px_rgb(var(--glow)/0.8)]",
        locked && "border-accent/35 bg-accent/[0.08] text-accent-soft hover:border-accent/60",
        !checked && "border-white/25 text-transparent hover:border-accent hover:text-accent/80",
      )}
      style={{ width: size, height: size }}
    >
      <span
        aria-hidden
        className={cx("absolute -inset-px rounded-full transition-opacity duration-300", filled ? "opacity-100" : "opacity-0")}
        style={{ background: "var(--grad-diag)" }}
      />
      {locked ? (
        <Clock3 size={size * 0.62} strokeWidth={2.4} className="relative" />
      ) : (
        <CheckIcon size={size * 0.6} strokeWidth={3.2} className="relative" />
      )}
    </button>
  );
}

/** Полоса прогресса: дорожка того же оттенка, что и заливка. Заливка вырастает при появлении. */
export function Meter({ value, max, color = "var(--accent)" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: `color-mix(in srgb, ${color} 20%, transparent)` }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
    >
      <div
        className="grow-x h-full rounded-full transition-[width] duration-700 ease-out-quint"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/12 px-4 py-7 text-center">
      <div className="font-display text-[15px] text-ink-2">{title}</div>
      {children && <div className="mt-1 text-[13px] text-muted">{children}</div>}
    </div>
  );
}

/** Оригинальный знак Quadcode AI (тот же файл, что в фавиконе quadcode.ai). */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/qcai.png" alt="" aria-hidden width={size} height={size} className="shrink-0 rounded-[8px]" style={{ width: size, height: size }} />
  );
}

/** Шапка вкладки: заголовок и кнопки. Без пояснений: экран должен читаться сам. */
export function PageHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <header className="mb-6 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display min-w-0 text-[34px] font-medium leading-none sm:text-[42px]">{title}</h1>
        {right && <div className="flex shrink-0 gap-2">{right}</div>}
      </div>
    </header>
  );
}
