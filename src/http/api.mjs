import { createServer } from 'node:http';
import { assertBodyWithinLimit, createWholesaleRequestPipeline } from './pipeline.mjs';
import { apiResponseHeaders } from './transport-contract.mjs';

export { normalizeHttpError } from './error-status.mjs';

export function createWholesaleHttpHandler(options = {}) {
  const runRequest = createWholesaleRequestPipeline(options);
  return async (request, response) => {
    const result = await runRequest(nodeRequestView(request));
    send(response, result);
  };
}

export function createWholesaleHttpServer(options) { return createServer(createWholesaleHttpHandler(options)); }

function nodeRequestView(request) {
  return {
    method: request.method,
    url: new URL(request.url ?? '/', 'http://syntha.local'),
    header: (name) => header(request, name),
    // The limit is enforced while chunks arrive, so an oversized body is rejected without
    // ever being buffered in full.
    async readBody(limit) {
      let size = 0;
      const chunks = [];
      for await (const chunk of request) {
        size += chunk.length;
        assertBodyWithinLimit(size, limit);
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    },
  };
}

function header(request, name) { const value = request.headers[name]; return Array.isArray(value) ? value[0] : value; }

function send(response, { status, payload, requestId, headers }) {
  for (const [name, value] of Object.entries(apiResponseHeaders(requestId, headers ?? {}))) response.setHeader(name, value);
  const body = JSON.stringify(payload);
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('content-length', Buffer.byteLength(body));
  response.end(body);
}
