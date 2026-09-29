import { randomUUID } from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import { recordCurrencyReferenceRate } from '../modules/currency-reference/public.mjs';

// Загрузка справочника: у скрипта синхронизации нет actorId и нет организации — курс ЦБ не
// принадлежит никому. Тем же приёмом, что и `bootstrapMdmReference`, эта сторона вызывается
// инфраструктурным скриптом напрямую, в обход командного леджера и HTTP.
export function createCurrencyReferenceIngestService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.insertRate === 'function', 'CURRENCY_REFERENCE_STORE_REQUIRED', 'Currency reference store is required');
  return Object.freeze({
    async recordRate({ source, fromCurrency, toCurrency, rate, effectiveOn }) {
      const value = recordCurrencyReferenceRate({ id: nextId('currency-rate'), source, fromCurrency, toCurrency, rate, effectiveOn, recordedAt: clock() });
      await store.insertRate(value);
      return value;
    },
  });
}

// Чтение — обычный запрос актёра: справочник виден любому аутентифицированному участнику, без
// проверки способности, тем же приёмом, что и `libraries` (это данные платформы, а не бренда).
export function createCurrencyReferenceQueryService({ store } = {}) {
  invariant(store && typeof store.listRates === 'function', 'CURRENCY_REFERENCE_STORE_REQUIRED', 'Currency reference store is required');
  return Object.freeze({
    async ratesForActor(actorId, { fromCurrency, toCurrency, source, limit } = {}) {
      invariant(typeof actorId === 'string' && actorId, 'CURRENCY_REFERENCE_ACTOR_REQUIRED', 'Actor is required');
      const rows = await store.listRates({
        source: source || undefined,
        fromCurrency: fromCurrency || undefined,
        toCurrency: toCurrency || undefined,
        limit: limit === undefined ? undefined : Number(limit),
      });
      return Object.freeze(rows);
    },
  });
}

function defaultIdGenerator() { return (prefix) => `${prefix}_${randomUUID()}`; }
