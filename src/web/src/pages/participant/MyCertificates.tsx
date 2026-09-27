import { Link } from "react-router-dom";
import { useMyCertificates } from "../../api/hooks/records";

export function MyCertificatesPage() {
  const { data, isLoading, isError, error } = useMyCertificates();

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <p className="text-stone-500">Loading your certificates...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-xl py-8">
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
          {(error as Error)?.message || "Failed to load certificates"}
        </div>
      </div>
    );
  }

  const certificates = data?.certificates || [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">My Certificates</h1>
        <p className="mt-1 text-sm text-stone-600">
          View and print cryptographically signed certificates earned across hackathon events.
        </p>
      </div>

      {certificates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 p-8 text-center">
          <p className="text-stone-500">You do not have any certificates issued yet.</p>
          <p className="mt-1 text-xs text-stone-400">
            Certificates are automatically generated when hackathon results are published.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {certificates.map((cert) => {
            const payload = cert.payload || {};
            const isJudge = cert.type === "judge_certificate";
            const title = isJudge
              ? `Certificate of Judging — ${payload.eventName}`
              : `${payload.projectTitle || "Project"} — ${payload.eventName}`;

            return (
              <div
                key={cert.id}
                className="flex flex-col justify-between rounded-lg border border-stone-200 bg-white p-5 shadow-sm hover:border-stone-300"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                      {isJudge ? "Judge Certificate" : "Participant Certificate"}
                    </span>
                    {cert.revokedAt && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
                        Revoked
                      </span>
                    )}
                  </div>
                  <h2 className="mt-3 text-base font-bold text-stone-900">{title}</h2>
                  {payload.placement && (
                    <p className="mt-1 text-xs font-medium text-indigo-600">
                      {payload.placement}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-stone-500">
                    Issued: {new Date(cert.issuedAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-stone-100 pt-3">
                  <Link
                    to={`/certificates/${cert.id}`}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    View / Print Certificate &rarr;
                  </Link>
                  <Link
                    to={`/verify/${cert.id}`}
                    className="text-xs font-mono text-stone-400 hover:text-stone-600"
                  >
                    Verify
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
