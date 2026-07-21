import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LoadState } from '../types';

function controlName(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}) {
  return (
    <button className={`button button-${variant} button-${size}`} {...props}>
      {children}
    </button>
  );
}

export function Field({
  label,
  error,
  name,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name ?? controlName(label)} {...props} />
      {error ? <small className="field-error" role="alert">{error}</small> : null}
    </label>
  );
}

export function TextArea({
  label,
  name,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea name={name ?? controlName(label)} {...props} />
    </label>
  );
}

export function Metric({ label, value, tone = 'neutral' }: { label: string; value: ReactNode; tone?: 'neutral' | 'green' | 'blue' | 'amber' }) {
  return (
    <div className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function StatusBadge({ value }: { value: string }) {
  return <span className={`badge badge-${value.toLowerCase().replaceAll('_', '-')}`}>{value.replaceAll('_', ' ')}</span>;
}

export function AsyncPanel<T>({
  state,
  empty,
  children
}: {
  state: LoadState<T>;
  empty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') {
    return (
      <div className="state-box" role="status" aria-live="polite">
        <Loader2 className="spin" size={18} />
        <span>Loading</span>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="state-box state-error" role="alert">
        <AlertCircle size={18} />
        <span>{state.error}</span>
      </div>
    );
  }
  if (empty?.(state.data)) {
    return (
      <div className="state-box">
        <CheckCircle2 size={18} />
        <span>No records found</span>
      </div>
    );
  }
  return <>{children(state.data)}</>;
}

export function DataTable({
  columns,
  rows,
  getKey
}: {
  columns: string[];
  rows: any[];
  getKey: (row: any, index: number) => string;
}) {
  return (
    <div
      aria-label="Scrollable data table"
      className="table-wrap"
      role="region"
      tabIndex={0}
    >
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={getKey(row, index)}>{row.cells}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Toast({ message, tone = 'success' }: { message?: string; tone?: 'success' | 'error' }) {
  if (!message) return null;
  return <div className={`toast toast-${tone}`} role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'}>{message}</div>;
}
