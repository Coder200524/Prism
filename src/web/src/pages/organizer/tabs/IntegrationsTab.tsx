import { useState } from "react";
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
} from "../../../api/hooks/api-keys";
import {
  useWebhooks,
  useCreateWebhook,
  useDeleteWebhook,
  useWebhookDeliveries,
  useTestWebhook,
  useRedeliverWebhook,
  WebhookItem,
} from "../../../api/hooks/webhooks";

const AVAILABLE_EVENTS = [
  { id: "project.submitted", label: "Project Submitted" },
  { id: "project.updated", label: "Project Updated" },
  { id: "team.created", label: "Team Created" },
  { id: "judging.score_submitted", label: "Score Submitted" },
  { id: "record.issued", label: "Record Issued" },
  { id: "certificate.issued", label: "Certificate Issued" },
];

interface Props {
  eventId: string;
}

export function IntegrationsTab({ eventId }: Props) {
  // API Keys state
  const apiKeysQuery = useApiKeys(eventId);
  const createApiKeyMutation = useCreateApiKey(eventId);
  const revokeApiKeyMutation = useRevokeApiKey();
  const [newKeyName, setNewKeyName] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  // Webhooks state
  const webhooksQuery = useWebhooks(eventId);
  const createWebhookMutation = useCreateWebhook(eventId);
  const deleteWebhookMutation = useDeleteWebhook();
  const testWebhookMutation = useTestWebhook();
  const redeliverMutation = useRedeliverWebhook();

  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    "project.submitted",
  ]);
  const [createdWebhookSecret, setCreatedWebhookSecret] = useState<string | null>(
    null
  );
  const [activeWebhookId, setActiveWebhookId] = useState<string | null>(null);

  const deliveriesQuery = useWebhookDeliveries(activeWebhookId || "");

  const handleCreateApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    createApiKeyMutation.mutate(
      { name: newKeyName, scopes: ["read", "write"] },
      {
        onSuccess: (res) => {
          setCreatedSecret(res.key);
          setNewKeyName("");
        },
      }
    );
  };

  const handleToggleEvent = (eventId: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventId)
        ? prev.filter((id) => id !== eventId)
        : [...prev, eventId]
    );
  };

  const handleCreateWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl.trim() || selectedEvents.length === 0) return;
    createWebhookMutation.mutate(
      {
        url: webhookUrl,
        events: selectedEvents,
        secret: webhookSecret.trim() || undefined,
      },
      {
        onSuccess: (res) => {
          setCreatedWebhookSecret(res.secret);
          setWebhookUrl("");
          setWebhookSecret("");
        },
      }
    );
  };

  return (
    <div className="space-y-8">
      {/* OpenAPI Specs section */}
      <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-900">Developer & API Specs</h2>
        <p className="mt-1 text-sm text-stone-600">
          Access full OpenAPI 3.1 documentation and machine-readable specifications.
        </p>
        <div className="mt-4 flex flex-wrap gap-4">
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
          >
            Swagger Interactive UI &rarr;
          </a>
          <a
            href="/api/docs/openapi.json"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            OpenAPI Spec (JSON)
          </a>
        </div>
      </div>

      {/* API Keys section */}
      <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-900">API Keys</h2>
        <p className="mt-1 text-sm text-stone-600">
          Manage bearer tokens for programmatic backend integrations.
        </p>

        {createdSecret && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4">
            <h4 className="text-sm font-semibold text-green-800">
              API Key Created Successfully!
            </h4>
            <p className="mt-1 text-xs text-green-700">
              Please copy this key now. It will not be shown again:
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded bg-white px-3 py-1 font-mono text-sm text-stone-900 border border-green-300 select-all">
                {createdSecret}
              </code>
              <button
                type="button"
                className="text-xs text-green-800 underline hover:text-green-900"
                onClick={() => {
                  navigator.clipboard.writeText(createdSecret);
                }}
              >
                Copy
              </button>
            </div>
            <button
              type="button"
              className="mt-3 text-xs text-stone-500 hover:underline"
              onClick={() => setCreatedSecret(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        <form onSubmit={handleCreateApiKey} className="mt-4 flex gap-3">
          <input
            type="text"
            placeholder="Key name (e.g., CI Runner, Automation Script)"
            className="flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
          />
          <button
            type="submit"
            disabled={createApiKeyMutation.isPending}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {createApiKeyMutation.isPending ? "Creating..." : "Create Key"}
          </button>
        </form>

        <div className="mt-6 divide-y divide-stone-200 border-t border-stone-200">
          {apiKeysQuery.isLoading ? (
            <p className="py-4 text-sm text-stone-500">Loading API keys...</p>
          ) : apiKeysQuery.data?.apiKeys.length === 0 ? (
            <p className="py-4 text-sm text-stone-500">No active API keys created yet.</p>
          ) : (
            apiKeysQuery.data?.apiKeys.map((key) => (
              <div key={key.id} className="flex items-center justify-between py-3">
                <div>
                  <span className="font-medium text-stone-900">{key.name}</span>
                  <span className="ml-2 font-mono text-xs text-stone-500">
                    ({key.prefix}...)
                  </span>
                  {key.revokedAt ? (
                    <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">
                      Revoked
                    </span>
                  ) : (
                    <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">
                      Active
                    </span>
                  )}
                  <p className="text-xs text-stone-400 mt-0.5">
                    Created {new Date(key.createdAt).toLocaleDateString()}
                    {key.lastUsedAt && ` · Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`}
                  </p>
                </div>
                {!key.revokedAt && (
                  <button
                    type="button"
                    className="text-xs font-medium text-red-600 hover:underline"
                    onClick={() => revokeApiKeyMutation.mutate(key.id)}
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Webhooks section */}
      <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-900">Webhooks</h2>
        <p className="mt-1 text-sm text-stone-600">
          Subscribe external endpoints to real-time event notifications with HMAC signatures.
        </p>

        {createdWebhookSecret && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4">
            <h4 className="text-sm font-semibold text-green-800">
              Webhook Secret Generated
            </h4>
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded bg-white px-3 py-1 font-mono text-sm text-stone-900 border border-green-300 select-all">
                {createdWebhookSecret}
              </code>
              <button
                type="button"
                className="text-xs text-green-800 underline hover:text-green-900"
                onClick={() => {
                  navigator.clipboard.writeText(createdWebhookSecret);
                }}
              >
                Copy
              </button>
            </div>
            <button
              type="button"
              className="mt-3 text-xs text-stone-500 hover:underline"
              onClick={() => setCreatedWebhookSecret(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        <form onSubmit={handleCreateWebhook} className="mt-4 space-y-4 border-b border-stone-200 pb-6">
          <div>
            <label className="block text-xs font-medium text-stone-700">Target Endpoint URL</label>
            <input
              type="url"
              required
              placeholder="https://example.com/webhooks/dogfood"
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700">Custom Secret (Optional, auto-generated if blank)</label>
            <input
              type="text"
              placeholder="whsec_..."
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none font-mono"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700 mb-2">Subscribed Events</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {AVAILABLE_EVENTS.map((evt) => (
                <label key={evt.id} className="inline-flex items-center text-xs text-stone-700">
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(evt.id)}
                    onChange={() => handleToggleEvent(evt.id)}
                    className="mr-2 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {evt.label}
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={createWebhookMutation.isPending}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {createWebhookMutation.isPending ? "Registering..." : "Register Webhook"}
          </button>
        </form>

        <div className="mt-6 space-y-4">
          <h3 className="text-sm font-semibold text-stone-800">Active Webhooks</h3>
          {webhooksQuery.isLoading ? (
            <p className="text-sm text-stone-500">Loading webhooks...</p>
          ) : webhooksQuery.data?.webhooks.length === 0 ? (
            <p className="text-sm text-stone-500">No webhooks registered.</p>
          ) : (
            <div className="space-y-3">
              {webhooksQuery.data?.webhooks.map((wh: WebhookItem) => (
                <div
                  key={wh.id}
                  className={`rounded-md border p-4 ${
                    activeWebhookId === wh.id ? "border-indigo-500 bg-indigo-50/20" : "border-stone-200 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-sm font-medium text-stone-900">{wh.url}</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {wh.events.map((e) => (
                          <span key={e} className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                            {e}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
                        onClick={() => testWebhookMutation.mutate(wh.id)}
                        disabled={testWebhookMutation.isPending}
                      >
                        Send Test Payload
                      </button>
                      <button
                        type="button"
                        className="rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
                        onClick={() => setActiveWebhookId(activeWebhookId === wh.id ? null : wh.id)}
                      >
                        {activeWebhookId === wh.id ? "Hide Logs" : "View Logs"}
                      </button>
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => deleteWebhookMutation.mutate(wh.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {activeWebhookId === wh.id && (
                    <div className="mt-4 border-t border-stone-200 pt-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                        Recent Delivery History
                      </h4>
                      {deliveriesQuery.isLoading ? (
                        <p className="mt-2 text-xs text-stone-500">Loading deliveries...</p>
                      ) : deliveriesQuery.data?.deliveries.length === 0 ? (
                        <p className="mt-2 text-xs text-stone-500">No delivery attempts yet.</p>
                      ) : (
                        <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                          {deliveriesQuery.data?.deliveries.map((del) => (
                            <div
                              key={del.id}
                              className="flex items-center justify-between rounded bg-stone-50 p-2.5 text-xs border border-stone-200"
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-stone-800">{del.event}</span>
                                  {del.statusCode && del.statusCode >= 200 && del.statusCode < 300 ? (
                                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-800 font-mono">
                                      {del.statusCode} OK
                                    </span>
                                  ) : (
                                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-800 font-mono">
                                      {del.statusCode ?? "FAILED"}
                                    </span>
                                  )}
                                  <span className="text-stone-400">
                                    Attempts: {del.attempts}
                                  </span>
                                </div>
                                <div className="text-stone-500 font-mono text-[11px]">
                                  {del.deliveredAt
                                    ? `Delivered: ${new Date(del.deliveredAt).toLocaleString()}`
                                    : del.error || "Pending delivery"}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="rounded bg-white px-2 py-1 text-xs font-medium text-stone-700 border border-stone-300 hover:bg-stone-50"
                                onClick={() =>
                                  redeliverMutation.mutate({ webhookId: wh.id, deliveryId: del.id })
                                }
                                disabled={redeliverMutation.isPending}
                              >
                                Redeliver
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
