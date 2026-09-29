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
    <div className="border border-df-border bg-df-panel p-6">
      {title || actions ? (
        <div className="mb-6 flex items-start justify-between gap-3">
          {title ? <h2 className="text-lg uppercase tracking-widest text-df-pink font-mono">[ {title} ]</h2> : <span />}
          {actions}
        </div>
      ) : null}
      <div className="text-df-text">
        {children}
      </div>
    </div>
  );
}
