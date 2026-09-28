export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded border border-dashed border-df-border px-4 py-8 text-center">
      <p className="font-medium text-df-text">{title}</p>
      {description ? <p className="mt-1 text-sm text-df-dim">{description}</p> : null}
    </div>
  );
}
