import { Input } from "./Input";

type DateTimeFieldsProps = {
  dateLabel: string;
  timeLabel: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  idPrefix: string;
};

/** Split datetime-local into separate date + time controls (same stored value). */
export function DateTimeFields({
  dateLabel,
  timeLabel,
  value,
  onChange,
  required,
  idPrefix,
}: DateTimeFieldsProps) {
  const datePart = value.includes("T") ? value.slice(0, 10) : value.slice(0, 10) || "";
  const timePart = value.includes("T") ? value.slice(11, 16) : "";

  function emit(date: string, time: string) {
    if (!date) {
      onChange("");
      return;
    }
    onChange(`${date}T${time || "00:00"}`);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input
        id={`${idPrefix}-date`}
        label={dateLabel}
        type="date"
        value={datePart}
        required={required}
        onChange={(e) => emit(e.target.value, timePart)}
      />
      <Input
        id={`${idPrefix}-time`}
        label={timeLabel}
        type="time"
        value={timePart}
        required={required}
        onChange={(e) => emit(datePart, e.target.value)}
      />
    </div>
  );
}
