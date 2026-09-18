import { assertBodyWithinLimit, createWholesaleRequestPipeline } from './pipeline.mjs';
import { apiResponseHeaders } from './transport-contract.mjs';

export function createWholesaleFetchHandler(options = {}) {
  const runRequest = createWholesaleRequestPipeline(options);
  return async function handleWholesaleFetchRequest(request) {
    const { status, payload, requestId, headers } = await runRequest(fetchRequestView(request));
    return Response.json(payload, { status, headers: apiResponseHeaders(requestId, headers ?? {}) });
  };
}

function fetchRequestView(request) {
  return {
    method: request.method,
    url: new URL(request.url),
    header: (name) => request.headers.get(name) ?? undefined,
    // Streamed for the same reason as the node adapter: reading the whole body first and checking
    // its size afterwards would let a request without content-length buffer past the limit.
    async readBody(limit) {
      if (!request.body) {
        const buffered = new Uint8Array(await request.arrayBuffer());
        assertBodyWithinLimit(buffered.byteLength, limit);
        return buffered;
      }
      const reader = request.body.getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        try {
          assertBodyWithinLimit(size, limit);
        } catch (error) {
          await reader.cancel().catch(() => undefined);
          throw error;
        }
        chunks.push(value);
      }
      const body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      return body;
    },
  };
}
