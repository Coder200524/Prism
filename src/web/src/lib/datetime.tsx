export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return date.toLocaleString();
}

export function DateTime({ value }: { value: string | null | undefined }) {
  if (!value) return <span>—</span>;
  return (
    <time dateTime={value} title={`UTC: ${new Date(value).toISOString()}`}>
      {formatDateTime(value)}
    </time>
  );
}
