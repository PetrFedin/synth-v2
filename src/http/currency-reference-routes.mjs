import { invariant } from '../core/errors.mjs';
import { assertQueryContract } from './request-contract.mjs';

const QUERY_FIELDS = ['source', 'fromCurrency', 'toCurrency', 'limit'];

// Справочник курсов ЦБ — общие данные платформы, не бренда: читать может любой аутентифицированный
// участник, без проверки способности, тем же приёмом, что и `library-routes.mjs`. Записи сюда нет —
// справочник наполняется скриптом синхронизации (`scripts/sync-cbr-rates.mjs`), а не экраном.
export function createCurrencyReferenceRoutes({ currencyReference } = {}) {
  const service = currencyReference ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/currency-reference-rates$/, QUERY_FIELDS, ({ actorId, query }) => service.ratesForActor(actorId, query)),
  ]);
}

function read(method, pattern, fields, execute) {
  return Object.freeze({
    method,
    pattern,
    mutation: false,
    execute(context) {
      assertQueryContract(context.query ?? {}, fields);
      return execute(context);
    },
  });
}

function unavailable() {
  const fail = () => invariant(false, 'CURRENCY_REFERENCE_SERVICE_REQUIRED', 'Currency reference service is required');
  return Object.freeze({ ratesForActor: fail });
}
