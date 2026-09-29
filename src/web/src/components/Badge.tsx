type BadgeProps = {
  children: string;
  tone?: "slate" | "indigo" | "green" | "amber" | "red";
};

const tones = {
  slate: "bg-df-border text-df-dim",
  indigo: "bg-df-border text-df-cyan",
  green: "bg-df-border text-df-cyan",
  amber: "bg-df-border text-df-pink",
  red: "bg-df-border text-df-pink",
};

export function Badge({ children, tone = "slate" }: BadgeProps) {
  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-mono uppercase tracking-widest ${tones[tone]}`}>
      {children}
    </span>
  );
}
