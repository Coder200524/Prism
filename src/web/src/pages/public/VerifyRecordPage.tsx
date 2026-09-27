import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useRecord, useVerifyRecord } from "../../api/hooks/records";

export function VerifyRecordPage() {
  const { recordId } = useParams<{ recordId: string }>();
  const { data, isLoading, isError, error } = useRecord(recordId ?? "");
  const verifyMutation = useVerifyRecord();
  const [verificationResult, setVerificationResult] = useState<{
    status: "valid" | "revoked" | "invalid";
    reason?: string;
  } | null>(null);

  useEffect(() => {
    if (data?.record) {
      const record = data.record;
      if (record.revokedAt) {
        setVerificationResult({
          status: "revoked",
          reason: record.revokedReason || "Record has been revoked by an organizer.",
        });
        return;
      }

      // Perform server verification check
      verifyMutation.mutate(
        {
          payload: record.payload,
          signature: record.signature,
          kid: record.kid,
        },
        {
          onSuccess: (res) => {
            if (res.valid) {
              setVerificationResult({ status: "valid" });
            } else if (res.revoked) {
              setVerificationResult({ status: "revoked", reason: res.reason });
            } else {
              setVerificationResult({ status: "invalid", reason: res.reason || "Invalid signature" });
            }
          },
          onError: (err) => {
            setVerificationResult({ status: "invalid", reason: err.message });
          },
        },
      );
    }
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-stone-500">Verifying record signature...</p>
      </div>
    );
  }

  if (isError || !data?.record) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
          ✕
        </div>
        <h2 className="mt-4 text-xl font-bold text-stone-900">Record Not Found</h2>
        <p className="mt-2 text-stone-600">
          {(error as Error)?.message || "No record found with the provided identifier."}
        </p>
        <Link to="/" className="mt-6 inline-block text-sm font-medium text-indigo-600 hover:underline">
          Return to Portal Home
        </Link>
      </div>
    );
  }

  const record = data.record;
  const payload = record.payload || {};

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-stone-200 pb-4">
          <div>
            <h1 className="text-xl font-bold text-stone-900">Record Verification</h1>
            <p className="text-xs text-stone-500 font-mono mt-1">ID: {record.id}</p>
          </div>
          {verificationResult?.status === "valid" && (
            <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
              ✓ Valid Signature
            </span>
          )}
          {verificationResult?.status === "revoked" && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
              ⚠ Revoked Record
            </span>
          )}
          {verificationResult?.status === "invalid" && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">
              ✕ Invalid
            </span>
          )}
        </div>

        {verificationResult?.reason && (
          <div className="mt-4 rounded-md bg-stone-50 p-3 text-sm text-stone-700 border border-stone-200">
            <strong>Reason:</strong> {verificationResult.reason}
          </div>
        )}

        <div className="mt-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500">
            Signed Payload Details
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
            <div className="rounded-md bg-stone-50 p-3">
              <span className="block text-xs text-stone-400">Record Type</span>
              <span className="font-medium text-stone-800">{record.type}</span>
            </div>
            <div className="rounded-md bg-stone-50 p-3">
              <span className="block text-xs text-stone-400">Event</span>
              <span className="font-medium text-stone-800">{payload.eventName || record.eventId}</span>
            </div>
            {payload.participantName && (
              <div className="rounded-md bg-stone-50 p-3">
                <span className="block text-xs text-stone-400">Participant</span>
                <span className="font-medium text-stone-800">{payload.participantName}</span>
              </div>
            )}
            {payload.judgeName && (
              <div className="rounded-md bg-stone-50 p-3">
                <span className="block text-xs text-stone-400">Judge</span>
                <span className="font-medium text-stone-800">{payload.judgeName}</span>
              </div>
            )}
            {payload.projectTitle && (
              <div className="rounded-md bg-stone-50 p-3">
                <span className="block text-xs text-stone-400">Project</span>
                <span className="font-medium text-stone-800">{payload.projectTitle}</span>
              </div>
            )}
            {payload.placement && (
              <div className="rounded-md bg-stone-50 p-3">
                <span className="block text-xs text-stone-400">Placement</span>
                <span className="font-medium text-stone-800">{payload.placement}</span>
              </div>
            )}
            <div className="rounded-md bg-stone-50 p-3">
              <span className="block text-xs text-stone-400">Issued Date</span>
              <span className="font-medium text-stone-800">
                {new Date(record.issuedAt).toLocaleString()}
              </span>
            </div>
            <div className="rounded-md bg-stone-50 p-3">
              <span className="block text-xs text-stone-400">Signing Key ID (kid)</span>
              <span className="font-mono text-xs text-stone-800">{record.kid}</span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-stone-200 flex justify-between items-center">
            <Link
              to={`/certificates/${record.id}`}
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              View Certificate &rarr;
            </Link>
            <Link to="/" className="text-xs text-stone-500 hover:underline">
              Portal Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
