import { useEffect, useState, type FormEvent } from "react";
import { useCriteria, usePutCriteria } from "../../../api/hooks/judging";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorMessage } from "../../../components/ErrorMessage";
import { Input } from "../../../components/Input";
import { Textarea } from "../../../components/Textarea";

type CriterionDraft = {
  key: string;
  name: string;
  description: string;
  weight: number;
  minScore: number;
  maxScore: number;
};

const emptyRow = (): CriterionDraft => ({
  key: "",
  name: "",
  description: "",
  weight: 0,
  minScore: 1,
  maxScore: 5,
});

export function RubricTab({ eventId }: { eventId: string }) {
  const criteriaQuery = useCriteria(eventId);
  const putCriteria = usePutCriteria(eventId);
  const [rows, setRows] = useState<CriterionDraft[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const criteria = criteriaQuery.data?.criteria;
    if (!criteria) return;
    setRows(
      criteria.map((criterion) => ({
        key: criterion.key,
        name: criterion.name,
        description: criterion.description,
        weight: criterion.weight,
        minScore: criterion.minScore,
        maxScore: criterion.maxScore,
      })),
    );
  }, [criteriaQuery.data]);

  const weightSum = rows.reduce((sum, row) => sum + (Number.isFinite(row.weight) ? row.weight : 0), 0);
  const weightsOk = weightSum === 100 && rows.length > 0;

  function updateRow(index: number, patch: Partial<CriterionDraft>) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    await putCriteria.mutateAsync({
      criteria: rows.map((row) => ({
        key: row.key,
        name: row.name,
        description: row.description,
        weight: row.weight,
        minScore: row.minScore,
        maxScore: row.maxScore,
      })),
    });
    setMessage("Rubric saved.");
  }

  if (criteriaQuery.isLoading) return <p className="text-slate-600">Loading rubric…</p>;
  if (criteriaQuery.isError) return <ErrorMessage error={criteriaQuery.error} />;

  return (
    <Card title="Rubric">
      {rows.length === 0 ? (
        <EmptyState title="No criteria yet" description="Add at least one criterion." />
      ) : null}
      <form onSubmit={(e) => void onSave(e)} className="space-y-4">
        {rows.map((row, index) => (
          <div key={`row-${index}`} className="space-y-3 rounded border border-slate-200 p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Key"
                value={row.key}
                onChange={(e) => updateRow(index, { key: e.target.value })}
                required
              />
              <Input
                label="Name"
                value={row.name}
                onChange={(e) => updateRow(index, { name: e.target.value })}
                required
              />
              <Input
                label="Weight"
                type="number"
                value={String(row.weight)}
                onChange={(e) => updateRow(index, { weight: Number(e.target.value) })}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Min"
                  type="number"
                  value={String(row.minScore)}
                  onChange={(e) => updateRow(index, { minScore: Number(e.target.value) })}
                  required
                />
                <Input
                  label="Max"
                  type="number"
                  value={String(row.maxScore)}
                  onChange={(e) => updateRow(index, { maxScore: Number(e.target.value) })}
                  required
                />
              </div>
            </div>
            <Textarea
              label="Description"
              value={row.description}
              onChange={(e) => updateRow(index, { description: e.target.value })}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
        ))}

        <p className={`text-sm ${weightsOk ? "text-green-700" : "text-amber-700"}`}>
          Weight sum: {weightSum} / 100
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setRows((current) => [...current, emptyRow()])}>
            Add criterion
          </Button>
          <Button type="submit" disabled={!weightsOk || putCriteria.isPending}>
            {putCriteria.isPending ? "Saving…" : "Save rubric"}
          </Button>
        </div>
        {putCriteria.isError ? <ErrorMessage error={putCriteria.error} /> : null}
        {message ? <p className="text-sm text-green-700">{message}</p> : null}
      </form>
    </Card>
  );
}
