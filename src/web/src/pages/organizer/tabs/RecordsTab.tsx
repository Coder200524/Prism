import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useEventCertificates,
  useIssueCertificates,
  useRevokeRecord,
  RecordItem,
} from "../../../api/hooks/records";

interface Props {
  eventId: string;
}

export function RecordsTab({ eventId }: Props) {
  const certificatesQuery = useEventCertificates(eventId);
  const issueCertificatesMutation = useIssueCertificates(eventId);
  const revokeRecordMutation = useRevokeRecord();

  const [revokingRecordId, setRevokingRecordId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const handleIssueCertificates = () => {
    issueCertificatesMutation.mutate(undefined, {
      onSuccess: (data) => {
        alert(`Successfully issued ${data.issuedCount} certificate(s)!`);
      },
      onError: (err) => {
        alert(`Error issuing certificates: ${err.message}`);
      },
    });
  };

  const handleConfirmRevoke = (recordId: string) => {
    if (!revokeReason.trim()) {
      alert("Please provide a reason for revoking this certificate.");
      return;
    }
    revokeRecordMutation.mutate(
      { recordId, reason: revokeReason },
      {
        onSuccess: () => {
          setRevokingRecordId(null);
          setRevokeReason("");
        },
        onError: (err) => {
          alert(`Error revoking record: ${err.message}`);
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">
              Verifiable Certificates & Records
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Issue cryptographic HMAC-SHA256 signed certificates to winners, participants, and judges.
            </p>
          </div>
          <button
            type="button"
            onClick={handleIssueCertificates}
            disabled={issueCertificatesMutation.isPending}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {issueCertificatesMutation.isPending ? "Issuing..." : "Issue Certificates Now"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500 mb-4">
          Issued Certificates ({certificatesQuery.data?.certificates.length || 0})
        </h3>

        {certificatesQuery.isLoading ? (
          <p className="py-4 text-sm text-stone-500">Loading certificates...</p>
        ) : certificatesQuery.data?.certificates.length === 0 ? (
          <p className="py-4 text-sm text-stone-500">
            No certificates issued for this event yet. Click "Issue Certificates Now" above.
          </p>
        ) : (
          <div className="divide-y divide-stone-200 border-t border-stone-200">
            {certificatesQuery.data?.certificates.map((rec: RecordItem) => (
              <div key={rec.id} className="py-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-stone-900">
                        {rec.type.replace("_", " ").toUpperCase()}
                      </span>
                      {rec.revokedAt ? (
                        <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800 font-medium">
                          Revoked
                        </span>
                      ) : (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 font-medium">
                          Valid
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-stone-500 mt-1">ID: {rec.id}</p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Issued: {new Date(rec.issuedAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Link
                      to={`/certificates/${rec.id}`}
                      className="text-xs font-medium text-indigo-600 hover:underline"
                    >
                      View Certificate
                    </Link>
                    <Link
                      to={`/verify/${rec.id}`}
                      className="text-xs font-medium text-stone-600 hover:underline"
                    >
                      Verify
                    </Link>
                    {!rec.revokedAt && (
                      <button
                        type="button"
                        className="text-xs font-medium text-red-600 hover:underline"
                        onClick={() => {
                          setRevokingRecordId(rec.id);
                          setRevokeReason("");
                        }}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>

                {rec.revokedAt && (
                  <div className="rounded bg-stone-50 p-2 text-xs text-stone-600">
                    <strong>Revoked Reason:</strong> {rec.revokedReason} (at{" "}
                    {new Date(rec.revokedAt).toLocaleString()})
                  </div>
                )}

                {revokingRecordId === rec.id && (
                  <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 space-y-2">
                    <label className="block text-xs font-semibold text-red-900">
                      Reason for Revocation
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Disqualification, Administrative Correction"
                      className="w-full rounded border border-red-300 px-3 py-1.5 text-xs focus:outline-none"
                      value={revokeReason}
                      onChange={(e) => setRevokeReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                        onClick={() => handleConfirmRevoke(rec.id)}
                      >
                        Confirm Revocation
                      </button>
                      <button
                        type="button"
                        className="rounded border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
                        onClick={() => setRevokingRecordId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
