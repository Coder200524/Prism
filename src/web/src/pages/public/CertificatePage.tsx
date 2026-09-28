import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import QRCode from "qrcode";
import { useRecord } from "../../api/hooks/records";

export function CertificatePage() {
  const { recordId } = useParams<{ recordId: string }>();
  const { data, isLoading, isError, error } = useRecord(recordId ?? "");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const verifyUrl = `${window.location.origin}/verify/${recordId}`;

  useEffect(() => {
    if (recordId) {
      QRCode.toDataURL(verifyUrl, { margin: 1, width: 120 })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error("QR Code error", err));
    }
  }, [recordId, verifyUrl]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-stone-500">Loading certificate...</p>
      </div>
    );
  }

  if (isError || !data?.record) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <h2 className="text-xl font-bold text-stone-900">Certificate Not Found</h2>
        <p className="mt-2 text-stone-600">
          {(error as Error)?.message || "The requested certificate record could not be found."}
        </p>
        <Link to="/" className="mt-4 inline-block text-df-pink hover:text-df-cyan transition-colors font-mono">
          Return Home
        </Link>
      </div>
    );
  }

  const record = data.record;
  const payload = record.payload || {};
  const isRevoked = Boolean(record.revokedAt);

  const title =
    record.type === "judge_certificate" || record.type === "judge_participation"
      ? "Certificate of Appreciation"
      : "Certificate of Achievement";

  const recipientName = String(
    payload.participantName || payload.judgeName || payload.judgeDisplayName || "Participant",
  );

  const eventName = String(payload.eventName || "the hackathon");
  const reviewsCount = String(payload.reviewsCount || payload.reviewsSubmitted || 1);
  const projectTitle = String(payload.projectTitle || "Project");
  const teamName = String(payload.teamName || "Team");
  const placement = payload.placement ? String(payload.placement) : "";

  const detailsText =
    record.type === "judge_certificate" || record.type === "judge_participation"
      ? `For serving as a judge at ${eventName} and completing ${reviewsCount} project review(s).`
      : `For successfully participating in ${eventName} with project "${projectTitle}" (Team ${teamName})${placement ? ` — ${placement}` : ""}.`;

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      {/* Print Controls (hidden during print) */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link to="/" className="text-sm font-medium text-stone-600 hover:text-stone-900">
          &larr; Back to Portal
        </Link>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => window.print()}
            className="rounded-md bg-df-pink px-4 py-2 text-sm font-medium text-df-text hover:bg-df-pink"
          >
            Download PDF / Print
          </button>
        </div>
      </div>

      <p className="mb-4 text-xs text-stone-500 print:hidden">
        Tip: To save as a PDF file, click "Download PDF / Print" and select "Save as PDF" as the destination printer.
      </p>

      {/* A4 Landscape Printable Certificate Frame */}
      <div className="relative overflow-hidden rounded-xl border-4 border-double border-stone-300 bg-stone-50 p-8 shadow-lg print:border-2 print:p-12 print:shadow-none"
           style={{ aspectRatio: "1.414/1" }}>
        
        {isRevoked && (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-900/10 backdrop-blur-[1px]">
            <div className="rotate-[-12deg] rounded-lg border-4 border-red-600 px-6 py-2 text-3xl font-extrabold tracking-widest text-df-pink uppercase">
              REVOKED
            </div>
          </div>
        )}

        <div className="flex h-full flex-col justify-between text-center">
          {/* Header */}
          <div>
            <div className="text-xs font-bold tracking-widest text-df-pink uppercase sm:text-sm">
              DOGFOOD HACKATHON PORTAL
            </div>
            <h1 className="mt-3 text-3xl font-serif font-bold text-stone-900 sm:text-4xl">
              {title}
            </h1>
            <div className="mx-auto mt-2 h-1 w-24 bg-df-pink"></div>
          </div>

          {/* Recipient */}
          <div className="my-6">
            <p className="text-sm font-medium text-stone-500 uppercase tracking-wide">
              THIS IS PROUDLY PRESENTED TO
            </p>
            <p className="mt-2 text-3xl font-serif font-semibold text-stone-900 sm:text-4xl">
              {recipientName}
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-base text-stone-700">
              {detailsText}
            </p>
          </div>

          {/* Footer with Verification QR & Signature details */}
          <div className="mt-4 flex items-end justify-between border-t border-stone-200 pt-6 text-left">
            <div>
              <p className="text-xs text-stone-500">Issued On</p>
              <p className="text-sm font-medium text-stone-800">
                {new Date(record.issuedAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <p className="mt-2 text-[10px] text-stone-400 font-mono">
                ID: {record.id}
              </p>
            </div>

            <div className="flex items-center space-x-4">
              {qrDataUrl && (
                <img
                  src={qrDataUrl}
                  alt="Verification QR Code"
                  className="h-20 w-20 rounded border border-stone-200 bg-df-bg p-1"
                />
              )}
              <div className="text-right">
                <p className="text-xs text-stone-500">Verify authenticity at</p>
                <a
                  href={verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono font-medium text-df-pink underline"
                >
                  /verify/{record.id}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
