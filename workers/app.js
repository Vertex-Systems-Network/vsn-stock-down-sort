import { createRequestHandler } from "react-router";
import * as build from "../build/server/index.js";

const requestHandler = createRequestHandler(build, "production");

export default {
  async fetch(request, env, ctx) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },

  async queue(batch, env, ctx) {
    for (const message of batch.messages) {
      const request = new Request("https://queue.internal/internal/queue-sort", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message.body),
      });

      const response = await requestHandler(request, {
        cloudflare: {
          env,
          ctx,
          queueConsumer: true,
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Stock sort queue job failed with HTTP ${response.status}: ${body.slice(0, 500)}`,
        );
      }
    }
  },
};
