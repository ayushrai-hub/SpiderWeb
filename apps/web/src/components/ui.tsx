"use client";

import { forwardRef } from "react";
import Link from "next/link";

// === Button ===
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover disabled:bg-accent/50",
  secondary:
    "bg-surface text-ink border border-line-strong hover:bg-raised disabled:text-ink-3",
  ghost: "text-ink-2 hover:bg-raised hover:text-ink disabled:text-ink-3",
  danger: "bg-danger text-white hover:bg-danger/90 disabled:bg-danger/50",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-secondary",
  md: "h-9 px-4 text-body",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
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
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
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
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="card card-pad">
      <p className="text-label text-ink-3 uppercase">{label}</p>
      {loading ? (
        <div className="skeleton mt-2 h-7 w-16" />
      ) : (
        <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      )}
      {hint && !loading && <p className="mt-1 text-caption text-ink-3">{hint}</p>}
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
export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
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
      <Button
        variant="ghost"
        size="sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        ← Previous
      </Button>
      <span className="text-caption text-ink-3">
        Page {page} of {totalPages}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Next →
      </Button>
    </nav>
  );
}
