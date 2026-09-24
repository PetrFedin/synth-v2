export class DomainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function invariant(condition, code, message, details = {}) {
  if (!condition) throw new DomainError(code, message, details);
}

// Отсутствующая сущность называет себя.
//
// Тридцать девять служб держали по своей копии этого помощника, и тридцать одна писала
// «Entity not found» — одну и ту же фразу на все случаи, при том что код рядом знал правду.
// Найдено живым обходом: попытка собрать ассортимент до публикации каталога байера отвечала
// `422 BUYER_CATALOG_REQUIRED` с деталями (магазин, шоурум) — и сообщением «Entity not found».
// Человек читал «сущность не найдена» там, где система знала: сначала опубликуйте каталог.
//
// Фраза выводится из кода, как это уже делали семь служб из тридцати девяти: `BUYER_CATALOG_REQUIRED`
// → «Buyer catalog required». Это не перевод и не проза — это то же самое, что и код, но читаемое,
// и оно не расходится с ним, потому что из него и получено.
export function requireEntity(value, code, details = {}) {
  invariant(value, code, sentenceFromCode(code), details);
  return value;
}

function sentenceFromCode(code) {
  const words = String(code ?? 'ENTITY_NOT_FOUND').replace(/_/g, ' ').toLowerCase();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}
