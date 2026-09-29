declare module "*.css";

declare module "react-dom/server.browser" {
  import type { ReactNode } from "react";

  export type ReadableReactStream = ReadableStream<Uint8Array> & {
    allReady: Promise<void>;
  };

  export function renderToReadableStream(
    children: ReactNode,
    options?: {
      signal?: AbortSignal;
      onError?: (error: unknown) => void;
    },
  ): Promise<ReadableReactStream>;
}
