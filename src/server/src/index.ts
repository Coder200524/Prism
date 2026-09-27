import { createApp } from "./app.js";
import { config } from "./config.js";
import { startWebhookWorker } from "./modules/webhooks/worker.js";

const app = createApp();

startWebhookWorker();

app.listen(config.PORT, () => {
  console.log(`Server listening on http://localhost:${config.PORT}`);
});
