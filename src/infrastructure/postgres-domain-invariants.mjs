import { DomainError } from '../core/errors.mjs';

const DOMAIN_CONFLICT_MESSAGES = Object.freeze({
  SUPPLY_ORDER_EXECUTION_CONFLICT: 'Order is no longer executable for this immutable commit',
  ORDER_CANCELLATION_EXECUTION_CONFLICT: 'Order cannot be cancelled after physical execution has started',
});

// A database-enforced invariant speaks by raising "CODE: a sentence". Recognising that convention
// here means every trigger reports itself as a domain error with its own code, instead of surfacing
// as an unexplained INTERNAL_ERROR to whoever tripped it, and without a hand-maintained list that
// each new invariant has to be added to.
const RAISED_INVARIANT = /^([A-Z][A-Z0-9_]{3,}):\s+(\S.*)$/s;
const RAISED_CODES = Object.freeze(['P0001', '23514']);

function raisedInvariant(error) {
  if (!RAISED_CODES.includes(error?.code)) return null;
  const match = String(error.message ?? '').match(RAISED_INVARIANT);
  return match ? { code: match[1], message: match[2].trim() } : null;
}

export function translatePostgresDomainInvariant(error) {
  const raised = raisedInvariant(error);
  const listed = error?.code === 'P0001' ? DOMAIN_CONFLICT_MESSAGES[error.message] : null;
  const code = listed ? error.message : raised?.code;
  const message = listed ?? raised?.message;
  if (!message) return error;
  const translated = new DomainError(code, message);
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
