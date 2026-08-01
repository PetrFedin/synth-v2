export function createHealthRegistry() {
  const probes = new Map();

  return Object.freeze({
    register(name, probe) {
      if (typeof name !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(name)) {
        throw new Error('Health probe name must contain 1 to 64 lowercase letters, numbers or dashes');
      }
      if (typeof probe !== 'function') throw new Error(`${name} health probe must be a function`);
      if (probes.has(name)) throw new Error(`Health probe is already registered: ${name}`);
      probes.set(name, probe);
      let registered = true;
      return () => {
        if (!registered) return false;
        registered = false;
        return probes.delete(name);
      };
    },

    async check() {
      const entries = await Promise.all([...probes.entries()].map(async ([name, probe]) => {
        try {
          const result = await probe();
          if (!result || !['ready', 'not-ready'].includes(result.status)) {
            return [name, Object.freeze({ status: 'not-ready', reason: 'invalid-probe-result' })];
          }
          return [name, freezeCopy(result)];
        } catch {
          return [name, Object.freeze({ status: 'not-ready', reason: 'probe-failed' })];
        }
      }));
      const checks = Object.freeze(Object.fromEntries(entries));
      const failed = entries.find(([, result]) => result.status !== 'ready');
      return Object.freeze({
        status: failed ? 'not-ready' : 'ready',
        ...(failed ? { reason: 'operational-dependency-unavailable', failedCheck: failed[0] } : {}),
        checks,
      });
    },

    get size() { return probes.size; },
  });
}

function freezeCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeCopy));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, freezeCopy(nested)])));
  }
  return value;
}
