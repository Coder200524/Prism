import { useState } from "react";
import { Button } from "./Button";

export function CopyLink({ value, label = "Copy link" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="max-w-full overflow-x-auto rounded bg-slate-100 px-2 py-1 text-xs text-slate-800">
        {value}
      </code>
      <Button type="button" variant="secondary" onClick={() => void copy()}>
        {copied ? "Copied" : label}
      </Button>
    </div>
  );
}
