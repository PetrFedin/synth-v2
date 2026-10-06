import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';
import { ENGINEERING_PURPOSES } from './public.mjs';

const QUALIFICATION_STATUSES = Object.freeze(['qualified', 'suspended', 'retired']);
const HASH = /^[0-9a-f]{64}$/;
const KEY_PART = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;

export function createModelQualification({
  id,
  provider,
  model,
  purpose,
  promptVersion,
  schemaVersion,
  benchmarkHash,
  metrics,
  qualifiedAt,
  qualifiedBy,
  expiresAt = null,
  status = 'qualified',
}) {
  required(id, 'AI_MODEL_QUALIFICATION_ID_REQUIRED');
  token(provider, 'AI_MODEL_PROVIDER_INVALID');
  token(model, 'AI_MODEL_NAME_INVALID');
  invariant(ENGINEERING_PURPOSES.includes(purpose), 'AI_MODEL_PURPOSE_INVALID', 'Model qualification purpose is invalid', { purpose });
  token(promptVersion, 'AI_MODEL_PROMPT_VERSION_INVALID');
  token(schemaVersion, 'AI_MODEL_SCHEMA_VERSION_INVALID');
  hash(benchmarkHash, 'AI_MODEL_BENCHMARK_HASH_INVALID');
  object(metrics, 'AI_MODEL_METRICS_INVALID', 'Qualification metrics must be an object');
  invariant(QUALIFICATION_STATUSES.includes(status), 'AI_MODEL_QUALIFICATION_STATUS_INVALID', 'Qualification status is invalid', { status });
  const qualified = time(qualifiedAt, 'AI_MODEL_QUALIFIED_AT_INVALID');
  const expires = expiresAt === null ? null : time(expiresAt, 'AI_MODEL_EXPIRES_AT_INVALID');
  invariant(expires === null || Date.parse(expires) > Date.parse(qualified), 'AI_MODEL_QUALIFICATION_TIME_INVALID', 'Qualification expiry must be after qualification time');
  return deepFreeze({
    id,
    provider,
    model,
    purpose,
    promptVersion,
    schemaVersion,
    benchmarkHash,
    metrics: structuredClone(metrics),
    qualifiedAt: qualified,
    qualifiedBy: actor(qualifiedBy),
    expiresAt: expires,
    status,
  });
}

export function createModelRoutePolicy({
  purpose,
  candidates,
  maxAttempts = 2,
  timeoutMs = 45_000,
  circuitFailureThreshold = 3,
  circuitCooldownMs = 60_000,
}) {
  invariant(ENGINEERING_PURPOSES.includes(purpose), 'AI_MODEL_PURPOSE_INVALID', 'Model route purpose is invalid', { purpose });
  invariant(Array.isArray(candidates) && candidates.length >= 1, 'AI_MODEL_ROUTE_CANDIDATES_REQUIRED', 'At least one route candidate is required');
  const normalized = candidates.map((candidate, index) => {
    object(candidate, 'AI_MODEL_ROUTE_CANDIDATE_INVALID', 'Route candidate must be an object');
    token(candidate.provider, 'AI_MODEL_PROVIDER_INVALID');
    token(candidate.model, 'AI_MODEL_NAME_INVALID');
    return Object.freeze({
      provider: candidate.provider,
      model: candidate.model,
      priority: Number.isInteger(candidate.priority) ? candidate.priority : index,
    });
  }).sort((a, b) => a.priority - b.priority || routeKey(a).localeCompare(routeKey(b)));
  invariant(new Set(normalized.map(routeKey)).size === normalized.length, 'AI_MODEL_ROUTE_DUPLICATE', 'Model route candidates must be unique');
  return deepFreeze({
    purpose,
    candidates: normalized,
    maxAttempts: positiveInteger(maxAttempts, 'AI_MODEL_MAX_ATTEMPTS_INVALID', 8),
    timeoutMs: positiveInteger(timeoutMs, 'AI_MODEL_TIMEOUT_INVALID', 300_000),
    circuitFailureThreshold: positiveInteger(circuitFailureThreshold, 'AI_MODEL_CIRCUIT_THRESHOLD_INVALID', 20),
    circuitCooldownMs: positiveInteger(circuitCooldownMs, 'AI_MODEL_CIRCUIT_COOLDOWN_INVALID', 3_600_000),
  });
}

/**
 * Provider-neutral bounded execution control.
 *
 * Provider adapters receive technical input and return a JSON-serializable output.
 * This router deliberately has no access to Product/BOM/Measurement/Tech Pack stores.
 *
 * @param {{
 *   providers: Record<string, { execute: (request: any, context: { signal: AbortSignal }) => Promise<any> }>,
 *   qualifications: readonly any[],
 *   policies: readonly any[],
 *   clock?: () => string
 * }} options
 */
export function createModelControlPlane({
  providers,
  qualifications,
  policies,
  clock = () => new Date().toISOString(),
}) {
  object(providers, 'AI_MODEL_PROVIDERS_INVALID', 'Provider registry must be an object');
  invariant(Array.isArray(qualifications), 'AI_MODEL_QUALIFICATIONS_INVALID', 'Qualifications must be an array');
  invariant(Array.isArray(policies), 'AI_MODEL_POLICIES_INVALID', 'Policies must be an array');

  const qualificationIndex = new Map();
  for (const qualification of qualifications) {
    const exact = createModelQualification(qualification);
    qualificationIndex.set(qualificationKey(exact), exact);
  }
  const policyIndex = new Map();
  for (const raw of policies) {
    const policy = createModelRoutePolicy(raw);
    invariant(!policyIndex.has(policy.purpose), 'AI_MODEL_POLICY_DUPLICATE', 'Only one route policy is allowed per purpose', { purpose: policy.purpose });
    policyIndex.set(policy.purpose, policy);
  }

  /** @type {Map<string, { failures: number, openUntil: string | null }>} */
  const circuit = new Map();

  return Object.freeze({
    describeRoute({ purpose, promptVersion, schemaVersion, at = now(clock) }) {
      const policy = requiredPolicy(policyIndex, purpose);
      return deepFreeze(selectCandidates({
        policy,
        qualificationIndex,
        providers,
        promptVersion,
        schemaVersion,
        at,
        circuit,
      }).map(({ qualification, candidate }) => ({
        provider: candidate.provider,
        model: candidate.model,
        qualificationId: qualification.id,
        benchmarkHash: qualification.benchmarkHash,
        metrics: qualification.metrics,
      })));
    },

    async execute({ purpose, promptVersion, schemaVersion, input, inputHash, requestId }) {
      invariant(ENGINEERING_PURPOSES.includes(purpose), 'AI_MODEL_PURPOSE_INVALID', 'Model purpose is invalid', { purpose });
      token(promptVersion, 'AI_MODEL_PROMPT_VERSION_INVALID');
      token(schemaVersion, 'AI_MODEL_SCHEMA_VERSION_INVALID');
      required(requestId, 'AI_MODEL_REQUEST_ID_REQUIRED');
      hash(inputHash, 'AI_MODEL_INPUT_HASH_INVALID');
      assertJson(input, 'AI_MODEL_INPUT_INVALID');
      const policy = requiredPolicy(policyIndex, purpose);
      const startedAt = now(clock);
      const selected = selectCandidates({ policy, qualificationIndex, providers, promptVersion, schemaVersion, at: startedAt, circuit });
      invariant(selected.length >= 1, 'AI_MODEL_NO_QUALIFIED_ROUTE', 'No active qualified model route is available', { purpose, promptVersion, schemaVersion });

      const attempts = [];
      let finalError = null;
      for (const route of selected.slice(0, policy.maxAttempts)) {
        const attemptStartedAt = now(clock);
        try {
          const raw = await executeWithTimeout(
            route.adapter,
            {
              requestId,
              purpose,
              model: route.candidate.model,
              promptVersion,
              schemaVersion,
              input,
              inputHash,
              qualificationId: route.qualification.id,
            },
            policy.timeoutMs,
          );
          object(raw, 'AI_MODEL_PROVIDER_OUTPUT_INVALID', 'Provider response must be an object');
          invariant(Object.hasOwn(raw, 'output'), 'AI_MODEL_PROVIDER_OUTPUT_INVALID', 'Provider response must contain output');
          assertJson(raw.output, 'AI_MODEL_PROVIDER_OUTPUT_INVALID');
          if (raw.usage !== undefined) object(raw.usage, 'AI_MODEL_USAGE_INVALID', 'Provider usage must be an object');
          const outputHash = digest(raw.output);
          resetCircuit(circuit, routeKey(route.candidate));
          attempts.push(deepFreeze({
            provider: route.candidate.provider,
            model: route.candidate.model,
            qualificationId: route.qualification.id,
            status: 'succeeded',
            startedAt: attemptStartedAt,
            completedAt: now(clock),
            errorCode: null,
          }));
          return deepFreeze({
            requestId,
            purpose,
            provider: route.candidate.provider,
            model: route.candidate.model,
            qualificationId: route.qualification.id,
            promptVersion,
            schemaVersion,
            inputHash,
            outputHash,
            output: structuredClone(raw.output),
            usage: structuredClone(raw.usage ?? {}),
            attempts,
          });
        } catch (error) {
          const code = modelErrorCode(error);
          finalError = error;
          registerFailure(circuit, routeKey(route.candidate), policy, now(clock));
          attempts.push(deepFreeze({
            provider: route.candidate.provider,
            model: route.candidate.model,
            qualificationId: route.qualification.id,
            status: code === 'AI_MODEL_TIMEOUT' ? 'timed_out' : 'failed',
            startedAt: attemptStartedAt,
            completedAt: now(clock),
            errorCode: code,
          }));
          if (!retryableModelError(error)) break;
        }
      }
      invariant(false, 'AI_MODEL_EXECUTION_FAILED', 'All eligible model routes failed', {
        purpose,
        promptVersion,
        schemaVersion,
        attempts,
        finalErrorCode: modelErrorCode(finalError),
      });
    },
  });
}

function selectCandidates({ policy, qualificationIndex, providers, promptVersion, schemaVersion, at, circuit }) {
  return policy.candidates.flatMap((candidate) => {
    const qualification = qualificationIndex.get(qualificationKey({
      provider: candidate.provider,
      model: candidate.model,
      purpose: policy.purpose,
      promptVersion,
      schemaVersion,
    }));
    if (!qualification || !qualificationActive(qualification, at)) return [];
    const adapter = providers[candidate.provider];
    if (!adapter || typeof adapter.execute !== 'function') return [];
    if (circuitOpen(circuit, routeKey(candidate), at)) return [];
    return [{ candidate, qualification, adapter }];
  });
}

function qualificationActive(qualification, at) {
  if (qualification.status !== 'qualified') return false;
  return qualification.expiresAt === null || Date.parse(at) < Date.parse(qualification.expiresAt);
}

async function executeWithTimeout(adapter, request, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(Object.assign(new Error('AI model execution timed out'), { code: 'AI_MODEL_TIMEOUT', retryable: true }));
      }, timeoutMs);
    });
    return await Promise.race([adapter.execute(request, { signal: controller.signal }), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function registerFailure(circuit, key, policy, at) {
  const current = circuit.get(key) ?? { failures: 0, openUntil: null };
  const failures = current.failures + 1;
  circuit.set(key, {
    failures,
    openUntil: failures >= policy.circuitFailureThreshold
      ? new Date(Date.parse(at) + policy.circuitCooldownMs).toISOString()
      : null,
  });
}
function resetCircuit(circuit, key) { circuit.delete(key); }
function circuitOpen(circuit, key, at) {
  const state = circuit.get(key);
  if (!state?.openUntil) return false;
  if (Date.parse(at) >= Date.parse(state.openUntil)) { circuit.delete(key); return false; }
  return true;
}
function retryableModelError(error) {
  const code = modelErrorCode(error);
  if (code === 'AI_MODEL_TIMEOUT') return true;
  if (error && typeof error === 'object' && 'retryable' in error) return error.retryable === true;
  return false;
}
function modelErrorCode(error) {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code;
  return 'AI_MODEL_PROVIDER_ERROR';
}
function requiredPolicy(index, purpose) {
  invariant(ENGINEERING_PURPOSES.includes(purpose), 'AI_MODEL_PURPOSE_INVALID', 'Model purpose is invalid', { purpose });
  const policy = index.get(purpose);
  invariant(policy, 'AI_MODEL_POLICY_NOT_FOUND', 'No model route policy exists for purpose', { purpose });
  return policy;
}
function qualificationKey(value) { return [value.provider, value.model, value.purpose, value.promptVersion, value.schemaVersion].join('|'); }
function routeKey(value) { return [value.provider, value.model].join('|'); }
function digest(value) { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
function hash(value, code) { invariant(typeof value === 'string' && HASH.test(value), code, 'SHA-256 hash is invalid'); return value; }
function token(value, code) { invariant(typeof value === 'string' && KEY_PART.test(value), code, 'Identifier token is invalid'); return value; }
function required(value, code) { invariant(typeof value === 'string' && value.trim() && value.length <= 160, code, 'Identifier is required'); return value; }
function actor(value) { return required(value, 'AI_MODEL_QUALIFIED_BY_INVALID'); }
function time(value, code) { invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), code, 'Timestamp is invalid'); return new Date(value).toISOString(); }
function now(clock) { return time(clock(), 'AI_MODEL_CLOCK_INVALID'); }
function positiveInteger(value, code, max) { invariant(Number.isInteger(value) && value >= 1 && value <= max, code, 'Positive integer is out of range'); return value; }
function object(value, code, message) { invariant(value && typeof value === 'object' && !Array.isArray(value), code, message); assertJson(value, code); return value; }
function assertJson(value, code) { try { canonicalJson(value); } catch { invariant(false, code, 'Value must be JSON-serializable'); } }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
