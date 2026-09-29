import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  children: ReactNode;
};

const styles = {
  primary: "bg-df-pink text-df-bg hover:bg-df-bg hover:text-df-pink border border-df-pink transition-colors",
  secondary: "bg-transparent text-df-text border border-df-border hover:border-df-cyan hover:text-df-cyan transition-colors",
  danger: "bg-transparent text-df-pink border border-df-pink hover:bg-df-pink hover:text-df-bg transition-colors",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`px-4 py-2 text-[11px] font-bold font-mono disabled:opacity-50 uppercase tracking-[0.18em] ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
