import { DomainError } from '../core/errors.mjs';

const DOMAIN_CONFLICT_MESSAGES = Object.freeze({
  SUPPLY_COMMERCIAL_STAGE_CONFLICT: 'Physical supply execution requires a confirmed DealSpace',
  SUPPLY_ORDER_EXECUTION_CONFLICT: 'Order is no longer executable for this immutable commit',
  ORDER_CANCELLATION_EXECUTION_CONFLICT: 'Order cannot be cancelled after physical execution has started',
});

export function translatePostgresDomainInvariant(error) {
  const message = error?.code === 'P0001' ? DOMAIN_CONFLICT_MESSAGES[error.message] : null;
  if (!message) return error;
  const translated = new DomainError(error.message, message);
  try {
    Object.defineProperty(translated, 'cause', {
      value: error,
      enumerable: false,
      configurable: true,
      writable: false,
    });
  } catch {
    // Translation must not fail because an exotic PostgreSQL error cannot be attached.
  }
  return translated;
}
