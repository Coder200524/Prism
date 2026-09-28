import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function Input({ label, error, id, className = "", ...props }: InputProps) {
  const inputId = id ?? props.name ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <label className="block">
      <span className="text-sm font-medium text-df-text">{label}</span>
      <input
        id={inputId}
        className={`mt-1 w-full rounded border border-white/20 bg-white/5 backdrop-blur-md text-df-text placeholder-white/50 px-3 py-2 text-sm shadow-[0_4px_30px_rgba(0,0,0,0.1)] focus:bg-white/10 focus:border-df-cyan focus:outline-none focus:ring-1 focus:ring-df-cyan disabled:opacity-50 ${className}`}
        {...props}
      />
      {error ? <span className="mt-1 block text-sm text-df-pink">{error}</span> : null}
    </label>
  );
}
