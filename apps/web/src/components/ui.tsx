"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import Link from "next/link";

// === Button ===
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover disabled:bg-accent/50",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-raised disabled:text-ink-3",
  ghost: "text-ink-2 hover:bg-raised hover:text-ink disabled:text-ink-3",
  danger: "bg-danger text-white hover:bg-danger/90 disabled:bg-danger/50",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-secondary",
  md: "h-9 px-4 text-body",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, className = "", children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-ring disabled:cursor-not-allowed ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  )
);
Button.displayName = "Button";

// === Link button ===
export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
}) {
  const cls = `inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-ring ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`;
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

// === Card ===
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card-header flex items-start justify-between gap-4">
      <div>
        <h2 className="card-title">{title}</h2>
        {description && <p className="mt-0.5 text-caption text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// === Page header ===
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-header flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

// === Stat ===
export function Stat({
  label,
  value,
  hint,
  loading,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  loading?: boolean;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-label text-ink-3 uppercase">{label}</p>
      {loading ? (
        <div className="skeleton mt-2 h-7 w-16" />
      ) : (
        <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      )}
      {hint && !loading && <p className="mt-1 text-caption text-ink-3">{hint}</p>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="card card-pad block hover:bg-raised/50 focus-ring" data-stat={label}>
        {inner}
      </Link>
    );
  }
  return (
    <div className="card card-pad" data-stat={label}>
      {inner}
    </div>
  );
}

// === Empty state ===
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <p className="text-h3 text-ink">{title}</p>
      <p className="mt-1.5 max-w-sm text-secondary text-ink-2">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// === Error state ===
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="card card-pad my-6 border-danger/30 bg-danger-soft/50">
      <p className="text-h3 text-danger">Something went wrong</p>
      <p className="mt-1 text-secondary text-ink-2">
        {message || "We couldn't load this content. Your data is safe — try again."}
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

// === Skeletons ===
export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-5 space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="skeleton h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "h-40" }: { className?: string }) {
  return <div className={`card skeleton ${className}`} aria-hidden />;
}

// === Pagination ===
export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="flex items-center justify-between border-t border-line px-5 py-3" aria-label="Pagination">
      <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ← Previous
      </Button>
      <span className="text-caption text-ink-3">
        Page {page} of {totalPages}
      </span>
      <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next →
      </Button>
    </nav>
  );
}

// === Input ===
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-ink mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`input-field rounded-md border px-3 py-2 text-body transition-colors focus-ring ${
            error
              ? "border-danger focus:border-danger focus:ring-danger/20"
              : "border-line-strong focus:border-accent"
          } ${className}`}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="mt-1 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

// === Alert ===
type AlertVariant = "info" | "warning" | "danger" | "success";

const alertStyles: Record<AlertVariant, string> = {
  info: "border-line bg-raised text-ink-2",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
  success: "border-success/30 bg-success-soft text-success",
};

export function Alert({
  variant = "info",
  title,
  className = "",
  children,
}: {
  variant?: AlertVariant;
  title?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-md border px-4 py-3 text-secondary ${alertStyles[variant]} ${className}`}
      role={variant === "danger" ? "alert" : undefined}
    >
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={title ? "mt-1" : undefined}>{children}</div>}
    </div>
  );
}

// === Badge ===
type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

export function Badge({
  tone = "neutral",
  title,
  children,
}: {
  tone?: BadgeTone;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

// === Select ===
export function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  id?: string;
}) {
  const selectId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="min-w-0">
      <label htmlFor={selectId} className="label">
        {label}
      </label>
      <select
        id={selectId}
        className="input appearance-none bg-surface pr-8"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder ?? "Any"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// === Distribution bar list ===
export function BarList({
  items,
  total,
  emptyMessage,
  onSelect,
}: {
  items: { label: string; value: number; href?: string }[];
  total?: number;
  emptyMessage: string;
  onSelect?: (label: string) => void;
}) {
  if (items.length === 0) {
    return <p className="px-5 py-8 text-center text-secondary text-ink-3">{emptyMessage}</p>;
  }
  const max = total ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="divide-y divide-line/70">
      {items.map((item) => {
        const width = Math.max(2, Math.round((item.value / max) * 100));
        const content = (
          <div className="relative flex items-center justify-between gap-4 px-5 py-2.5">
            <span
              aria-hidden
              className="absolute inset-y-1 left-2 rounded bg-accent-soft"
              style={{ width: `${width}%` }}
            />
            <span className="relative truncate text-body text-ink">{item.label}</span>
            <span className="relative shrink-0 tabular-nums text-secondary text-ink-2">{item.value}</span>
          </div>
        );
        return (
          <li key={item.label}>
            {item.href ? (
              <LinkComponent href={item.href}>{content}</LinkComponent>
            ) : onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(item.label)}
                className="block w-full text-left hover:bg-raised/50 focus-ring"
              >
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}

function LinkComponent({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block hover:bg-raised/50 focus-ring">
      {children}
    </Link>
  );
}

// === Confirm dialog ===
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  confirmTone = "danger",
  requireText,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  confirmTone?: ButtonVariant;
  /** When set, the user must type this exact string to enable the confirm button. */
  requireText?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setTyped("");
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const canConfirm = !requireText || typed === requireText;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onCancel} aria-hidden />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card relative w-full max-w-md shadow-overlay focus:outline-none"
      >
        <div className="card-pad">
          <h2 className="text-h2 text-ink">{title}</h2>
          <div className="mt-2 text-secondary text-ink-2">{description}</div>
          {requireText && (
            <div className="mt-4">
              <label htmlFor="confirm-text" className="label">
                Type {requireText} to confirm
              </label>
              <input
                id="confirm-text"
                className="input"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={confirmTone} size="sm" onClick={onConfirm} disabled={!canConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// === Inline toast ===
export function Toast({
  tone = "success",
  message,
  onDismiss,
}: {
  tone?: AlertVariant;
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss, message]);

  return (
    <div
      className="fixed bottom-5 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      <Alert variant={tone} className="shadow-overlay">
        <div className="flex items-start justify-between gap-3">
          <span>{message}</span>
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="text-ink-3 hover:text-ink focus-ring rounded"
          >
            ×
          </button>
        </div>
      </Alert>
    </div>
  );
}

// === Definition list ===
export function DetailList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  const shown = items.filter((i) => i.value !== null && i.value !== undefined && i.value !== "");
  if (shown.length === 0) return null;
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {shown.map((item) => (
        <div key={item.label}>
          <dt className="text-label text-ink-3 uppercase">{item.label}</dt>
          <dd className="mt-0.5 text-body text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// === Section heading (inside a page, not a card) ===
export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-h2 text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-secondary text-ink-2">{description}</p>}
      </div>
      {action}
    </div>
  );
}
