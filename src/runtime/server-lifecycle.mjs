export function readIntegerSetting(value, { name, defaultValue, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const source = value === undefined || value === null || value === '' ? defaultValue : value;
  const parsed = typeof source === 'number' ? source : Number(source);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name ?? 'setting'} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

export function readHostSetting(value, { defaultValue = '0.0.0.0' } = {}) {
  const fallback = typeof defaultValue === 'string' ? defaultValue.trim() : '';
  if (!fallback) throw new Error('Default HTTP host is required');
  const configured = typeof value === 'string' ? value.trim() : '';
  return configured || fallback;
}

export function configureHttpServer(server, {
  requestTimeoutMs,
  headersTimeoutMs,
  keepAliveTimeoutMs,
  maxRequestsPerSocket,
  maxHeadersCount,
} = {}) {
  if (!server || typeof server !== 'object') throw new Error('HTTP server is required');
  if (headersTimeoutMs > requestTimeoutMs) throw new Error('HTTP headers timeout cannot exceed request timeout');
  server.requestTimeout = requestTimeoutMs;
  server.headersTimeout = headersTimeoutMs;
  server.keepAliveTimeout = keepAliveTimeoutMs;
  server.maxRequestsPerSocket = maxRequestsPerSocket;
  server.maxHeadersCount = maxHeadersCount;
  return server;
}

export function createShutdownCoordinator({ server, pool, graceMs = 10_000, logger = console, stoppers = [] } = {}) {
  if (!server || typeof server.close !== 'function') throw new Error('HTTP server with close() is required');
  if (!pool || typeof pool.end !== 'function') throw new Error('Database pool with end() is required');
  if (!Array.isArray(stoppers) || stoppers.some((stop) => typeof stop !== 'function')) {
    throw new Error('Shutdown stoppers must be functions');
  }
  let shutdownPromise;

  return function shutdown(reason = 'shutdown') {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      logger.log?.(`Received ${reason}; shutting down`);
      const operations = [closeServer(server), ...stoppers.map((stop) => Promise.resolve().then(stop))];
      server.closeIdleConnections?.();

      let forced = false;
      const timer = setTimeout(() => {
        forced = true;
        logger.warn?.(`Graceful shutdown exceeded ${graceMs}ms; closing active HTTP connections`);
        server.closeAllConnections?.();
      }, graceMs);

      let failure;
      try {
        const results = await Promise.allSettled(operations);
        failure = results.find((result) => result.status === 'rejected');
      } finally {
        clearTimeout(timer);
        await pool.end();
      }
      if (failure) throw failure.reason;
      return Object.freeze({ forced });
    })();
    return shutdownPromise;
  };
}

export async function listen(server, { port, host } = {}) {
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      server.off('error', onError);
      server.off('listening', onListening);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    try { server.listen(port, host); }
    catch (error) { onError(error); }
  });
  return server.address();
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    try {
      server.close((error) => {
        if (!error || error.code === 'ERR_SERVER_NOT_RUNNING') resolve();
        else reject(error);
      });
    } catch (error) {
      if (error?.code === 'ERR_SERVER_NOT_RUNNING') resolve();
      else reject(error);
    }
  });
}
