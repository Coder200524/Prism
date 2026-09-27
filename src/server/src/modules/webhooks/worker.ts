import { processPendingDeliveries } from "./webhooks.service.js";

let workerInterval: NodeJS.Timeout | null = null;

export function startWebhookWorker(intervalMs = 5000): void {
  if (workerInterval) return;

  workerInterval = setInterval(async () => {
    try {
      await processPendingDeliveries();
    } catch (err) {
      console.error("Webhook outbox worker error:", err);
    }
  }, intervalMs);
}

export function stopWebhookWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}
