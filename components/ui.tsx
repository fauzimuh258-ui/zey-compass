// components/ui.tsx
// Small shared presentational primitives. None of these use client-only
// hooks, so they render fine from both Server and Client Components.
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  // type="button" is the default so buttons never accidentally submit a form;
  // rest is spread last so an explicit type (e.g. "submit") still wins.
  return <button type="button" className={`btn btn-${variant} ${className}`.trim()} {...rest} />;
}

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`.trim()} {...rest} />;
}

export function Skeleton({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`skeleton ${className}`.trim()} aria-hidden="true" {...rest} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {hint !== undefined ? <p className="empty-state-hint">{hint}</p> : null}
    </div>
  );
}

/** Horizontal progress bar used for the composite score on the dashboard. */
export function ScoreBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="score-bar-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="score-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

// [NEW, slice 4b] added for the login page's error note and reused by every
// form in Projects (validation errors, AI analyze failures).
type AlertVariant = 'error' | 'success' | 'info';

export function Alert({ variant = 'info', children }: { variant?: AlertVariant; children: ReactNode }) {
  return (
    <div className={`alert alert-${variant}`} role={variant === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
