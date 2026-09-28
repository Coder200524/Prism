import type { TextareaHTMLAttributes } from "react";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
};

export function Textarea({ label, error, id, className = "", ...props }: TextareaProps) {
  const textareaId = id ?? props.name ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <label className="block">
      <span className="text-sm font-medium text-df-text">{label}</span>
      <textarea
        id={textareaId}
        className={`mt-1 w-full rounded border border-white/20 bg-white/5 backdrop-blur-md text-df-text placeholder-white/50 px-3 py-2 text-sm shadow-[0_4px_30px_rgba(0,0,0,0.1)] focus:bg-white/10 focus:border-df-cyan focus:outline-none focus:ring-1 focus:ring-df-cyan disabled:opacity-50 ${className}`}
        rows={4}
        {...props}
      />
      {error ? <span className="mt-1 block text-sm text-df-pink">{error}</span> : null}
    </label>
  );
}
