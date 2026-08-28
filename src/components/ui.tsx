import React from 'react';

export const Page: React.FC<{ title?: string; toolbar?: React.ReactNode; children: React.ReactNode }> = ({
  title, toolbar, children
}) => (
  <div className="p-6 space-y-4">
    {(title || toolbar) && (
      <div className="flex items-center gap-3">
        {title && <h2 className="text-xl font-semibold">{title}</h2>}
        <div className="flex-1" />
        {toolbar}
      </div>
    )}
    <div>{children}</div>
  </div>
);

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-panel border border-line rounded-lg p-4 ${className}`}>{children}</div>
);

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }> = ({
  variant = 'primary', className = '', ...rest
}) => {
  const styles = {
    primary: 'bg-accent text-bg hover:opacity-90',
    ghost: 'bg-transparent border border-line text-fg hover:bg-bg2',
    danger: 'bg-rose-700 text-white hover:bg-rose-600'
  }[variant];
  return <button {...rest} className={`px-3 py-1.5 rounded-md text-sm font-medium transition disabled:opacity-50 ${styles} ${className}`} />;
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...rest }) => (
  <input {...rest} className={`bg-bg2 border border-line rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent ${className}`} />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', children, ...rest }) => (
  <select {...rest} className={`bg-bg2 border border-line rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-accent ${className}`}>{children}</select>
);

export const Label: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <label className={`block text-xs text-fg2 mb-1 ${className}`}>{children}</label>
);

interface Col<T> {
  key: keyof T | string;
  header: React.ReactNode;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

export function Table<T>({
  rows, cols, empty, onRowClick
}: {
  rows: T[];
  cols: Col<T>[];
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
}): JSX.Element {
  return (
    <div className="bg-panel border border-line rounded-lg overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-bg2 text-fg2 text-xs uppercase">
          <tr>
            {cols.map((c, i) => (
              <th key={i} className={`px-3 py-2 text-start font-medium ${c.className ?? ''}`}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-fg2">{empty ?? '—'}</td></tr>
          )}
          {rows.map((r, ri) => (
            <tr
              key={ri}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={`border-t border-line ${onRowClick ? 'cursor-pointer hover:bg-bg2' : ''}`}
            >
              {cols.map((c, ci) => (
                <td key={ci} className={`px-3 py-2 ${c.className ?? ''}`}>
                  {c.render ? c.render(r) : String(r[c.key as keyof T] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  wide?: boolean;
  /** Shows an unsaved-changes marker, so the close guard is not a surprise. */
  dirty?: boolean;
  dirtyLabel?: string;
}> = ({ open, onClose, title, children, wide, dirty, dirtyLabel }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`bg-panel border border-line rounded-lg shadow-xl ${wide ? 'w-[900px]' : 'w-[480px]'} max-h-[90vh] overflow-auto`}>
        {title && (
          <div className="px-4 py-3 border-b border-line font-semibold flex items-center gap-2">
            <span>{title}</span>
            {dirty && (
              <span data-unsaved="true" className="text-xs font-normal text-amber-400 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                {dirtyLabel}
              </span>
            )}
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};
