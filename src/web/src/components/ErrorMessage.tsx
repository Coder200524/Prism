import { ApiError } from "../api/client";

export function ErrorMessage({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Something went wrong";
  return <p className="rounded border border-red-200 bg-df-panel px-3 py-2 text-sm text-red-700">{message}</p>;
}
