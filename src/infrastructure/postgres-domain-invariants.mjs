import { invariant } from '../core/errors.mjs';

export function rethrowPostgresDomainInvariant(error, mappings = {}) {
  const mapping = error?.code === 'P0001' ? mappings[error.message] : null;
  if (mapping) {
    invariant(false, mapping.code ?? error.message, mapping.message ?? 'PostgreSQL domain invariant rejected the mutation', mapping.details ?? {});
  }
  throw error;
}
