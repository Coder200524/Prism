import type { ReactNode } from "react";

export function Card({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      {title || actions ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          {title ? <h2 className="text-lg font-semibold text-slate-900">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </div>
  );
}
