import type { SelectHTMLAttributes } from "react";

type Option = { value: string; label: string };

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: Option[];
  error?: string;
};

export function Select({ label, options, error, id, className = "", ...props }: SelectProps) {
  const selectId = id ?? props.name ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <label className="block">
      <span className="text-sm font-medium text-df-text">{label}</span>
      <select
        id={selectId}
        className={`mt-1 w-full rounded border border-df-cyan bg-white/5 backdrop-blur-md text-df-text px-3 py-2 text-sm shadow-[0_4px_30px_rgba(0,0,0,0.1)] focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-df-cyan disabled:opacity-50 appearance-none ${className}`}
        style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23E6ECFF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.7rem top 50%', backgroundSize: '0.65rem auto' }}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-df-bg text-white py-2">
            {option.label}
          </option>
        ))}
      </select>
      {error ? <span className="mt-1 block text-sm text-df-pink">{error}</span> : null}
    </label>
  );
}
