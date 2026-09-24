// Reading a season plan out of a spreadsheet.
//
// A buyer plans a season in Excel long before anyone opens this application, and until now the only
// way to get that plan in was to retype it one slot at a time. What makes this worth building is not
// the loop over rows: it is that the file is written by a person, in their words, so the import has to
// accept what a person writes — "Одежда" rather than an MDM entry id, "1 250,00" rather than 125000
// minor units, an empty cell rather than an explicit null — and refuse the rest by name and by line,
// so a file with four typos is fixed once instead of four times.
//
// Nothing here touches the database. Resolving a dictionary name to a governed entry and detecting a
// slot that already exists both need the store, and they are the caller's job; this module decides
// what a row *says*, which is the part worth testing without a server.

const COLUMNS = Object.freeze({
  placeholderCode: ['код', 'code', 'артикул', 'placeholdercode', 'кодслота'],
  nameRu: ['названиеru', 'наименованиеru', 'nameru', 'название', 'наименование'],
  nameEn: ['названиеen', 'nameen', 'nameenglish'],
  category: ['категория', 'category'],
  gender: ['пол', 'gender'],
  ageGroup: ['возрастнаягруппа', 'возраст', 'agegroup', 'age'],
  novelty: ['новизна', 'novelty'],
  seasonality: ['сезонность', 'seasonality'],
  fit: ['посадка', 'fit'],
  capsule: ['капсула', 'capsule'],
  drop: ['дроп', 'drop'],
  description: ['описание', 'description'],
  colourwayCount: ['цветомоделей', 'количествоцветов', 'colourwaycount', 'colorwaycount', 'colourways', 'colorways'],
  plannedQuantity: ['планколичество', 'количество', 'плановоеколичество', 'plannedquantity', 'quantity', 'plannedqty'],
  launchAt: ['датазапуска', 'запуск', 'launchat', 'launch', 'launchdate'],
  currency: ['валюта', 'currency'],
  recommendedRetailPrice: ['ррц', 'розничнаяцена', 'recommendedretailprice', 'retailprice', 'rrp', 'retail'],
  plannedUnitCost: ['плановаясебестоимость', 'себестоимость', 'plannedunitcost', 'unitcost', 'cost', 'plannedcost'],
});

// The columns a row cannot do without. Everything else a plan may legitimately not know yet.
const REQUIRED = Object.freeze(['placeholderCode', 'nameRu', 'nameEn', 'currency']);

// The lengths the domain enforces, repeated here on purpose. A check that passes a row the next step
// refuses is worse than no check: the author is told the file is fine, and then told it is not, with
// no line and no column. These bounds and the ones in public.mjs are the same rule, and the contract
// test holds them to each other.
const LENGTH = Object.freeze({
  nameRu: [2, 200], nameEn: [2, 200], capsule: [2, 120], drop: [2, 120], description: [0, 2000],
});

// Which governed dictionary each name column is looked up in. The caller resolves them; naming them
// here keeps the file format and the governance in one place.
export const DICTIONARY_COLUMNS = Object.freeze({
  category: 'assortment.category',
  gender: 'assortment.gender',
  ageGroup: 'assortment.age_group',
  novelty: 'assortment.novelty',
  seasonality: 'assortment.seasonality',
  fit: 'fit.class',
});

const REF_FIELD = Object.freeze({
  category: 'categoryRef', gender: 'genderRef', ageGroup: 'ageGroupRef',
  novelty: 'noveltyRef', seasonality: 'seasonalityRef', fit: 'fitRef',
});

function normalizeHeader(value) {
  return String(value ?? '').trim().toLowerCase().replace(/ё/g, 'е').replace(/[\s_\-./()]/g, '');
}

/**
 * Work out which spreadsheet column is which field. A header the import does not recognise is
 * reported rather than ignored: a column called "РРЦ, руб" that silently does nothing is how a plan
 * arrives with every price missing and nobody notices.
 */
export function mapHeaders(headers) {
  const mapped = {};
  const unknown = [];
  const duplicates = [];
  (headers ?? []).forEach((header, index) => {
    const key = normalizeHeader(header);
    if (!key) return;
    const field = Object.keys(COLUMNS).find((candidate) => COLUMNS[candidate].includes(key));
    if (!field) { unknown.push(String(header).trim()); return; }
    if (mapped[field] !== undefined) { duplicates.push(String(header).trim()); return; }
    mapped[field] = index;
  });
  const missing = REQUIRED.filter((field) => mapped[field] === undefined);
  return Object.freeze({ mapped, unknown, duplicates, missing });
}

// "1 250,00", "1250.5", "1 250" — all of them are what somebody's spreadsheet exports. Two decimal
// places, because money here is minor units and a third digit is a number nobody meant to write.
export function parseDecimalToMinor(value) {
  const raw = String(value ?? '').trim().replace(/[\s  ]/g, '').replace(/₽|€|\$|руб\.?/gi, '');
  if (!raw) return { ok: true, value: null };
  const normalized = raw.replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return { ok: false, reason: 'notAmount' };
  const [whole, fraction = ''] = normalized.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? { ok: true, value: minor } : { ok: false, reason: 'notAmount' };
}

function parseCount(value) {
  const raw = String(value ?? '').trim().replace(/[\s  ]/g, '');
  if (!raw) return { ok: true, value: null };
  if (!/^\d+$/.test(raw)) return { ok: false, reason: 'notWholeNumber' };
  const count = Number(raw);
  return count > 0 && Number.isSafeInteger(count) ? { ok: true, value: count } : { ok: false, reason: 'notWholeNumber' };
}

// A date in a plan is a day, and it arrives written the way the writer's locale writes it. The two
// unambiguous forms are accepted; anything else is refused rather than guessed, because reading
// 03.04 as the third of April or the fourth of March moves a launch by a month in silence.
function parseDay(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: true, value: null };
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const ru = /^(\d{2})[.](\d{2})[.](\d{4})$/.exec(raw);
  const parts = iso ? [iso[1], iso[2], iso[3]] : ru ? [ru[3], ru[2], ru[1]] : null;
  if (!parts) return { ok: false, reason: 'notDate' };
  const [year, month, day] = parts;
  const stamp = `${year}-${month}-${day}T00:00:00.000Z`;
  const parsed = new Date(stamp);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) {
    return { ok: false, reason: 'notDate' };
  }
  return { ok: true, value: stamp };
}

function cell(row, mapped, field) {
  const index = mapped[field];
  return index === undefined ? '' : String(row[index] ?? '').trim();
}

/**
 * Turn one spreadsheet row into the shape `createProductPlaceholder` expects, or into a list of
 * problems naming the column each one is in. Dictionary columns come back as the raw words the
 * author wrote, under `lookups`, for the caller to resolve against the governed dictionaries.
 */
export function readRow(row, mapped, { defaultCurrency = null } = {}) {
  const problems = [];
  const complain = (column, reason, value) => { problems.push({ column, reason, value: value ?? undefined }); };
  const checkLength = (column, value) => {
    const [min, max] = LENGTH[column];
    if (!value) return;
    if (value.length < min) complain(column, 'tooShort', String(min));
    else if (value.length > max) complain(column, 'tooLong', String(max));
  };

  const placeholderCode = cell(row, mapped, 'placeholderCode').toUpperCase();
  if (!placeholderCode) complain('placeholderCode', 'required');
  else if (!/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(placeholderCode)) complain('placeholderCode', 'notACode', placeholderCode);

  const nameRu = cell(row, mapped, 'nameRu');
  const nameEn = cell(row, mapped, 'nameEn');
  if (!nameRu) complain('nameRu', 'required');
  if (!nameEn) complain('nameEn', 'required');
  checkLength('nameRu', nameRu);
  checkLength('nameEn', nameEn);

  const currency = (cell(row, mapped, 'currency') || defaultCurrency || '').toUpperCase();
  if (!currency) complain('currency', 'required');
  else if (!/^[A-Z]{3}$/.test(currency)) complain('currency', 'notCurrency', currency);

  const retail = parseDecimalToMinor(cell(row, mapped, 'recommendedRetailPrice'));
  if (!retail.ok) complain('recommendedRetailPrice', retail.reason, cell(row, mapped, 'recommendedRetailPrice'));
  const cost = parseDecimalToMinor(cell(row, mapped, 'plannedUnitCost'));
  if (!cost.ok) complain('plannedUnitCost', cost.reason, cell(row, mapped, 'plannedUnitCost'));
  // A plan that costs more to make than it sells for is a mistake in the file, not a decision. It is
  // refused here as well as by the domain, so the author sees the line it is on.
  if (retail.ok && cost.ok && retail.value !== null && cost.value !== null && cost.value > retail.value) {
    complain('plannedUnitCost', 'costAboveRetail', cell(row, mapped, 'plannedUnitCost'));
  }

  const colourwayCount = parseCount(cell(row, mapped, 'colourwayCount'));
  if (!colourwayCount.ok) complain('colourwayCount', colourwayCount.reason, cell(row, mapped, 'colourwayCount'));
  const plannedQuantity = parseCount(cell(row, mapped, 'plannedQuantity'));
  if (!plannedQuantity.ok) complain('plannedQuantity', plannedQuantity.reason, cell(row, mapped, 'plannedQuantity'));
  const launchAt = parseDay(cell(row, mapped, 'launchAt'));
  if (!launchAt.ok) complain('launchAt', launchAt.reason, cell(row, mapped, 'launchAt'));

  const capsule = cell(row, mapped, 'capsule');
  const drop = cell(row, mapped, 'drop');
  const description = cell(row, mapped, 'description');
  checkLength('capsule', capsule);
  checkLength('drop', drop);
  checkLength('description', description);

  const lookups = {};
  for (const column of Object.keys(DICTIONARY_COLUMNS)) {
    const token = cell(row, mapped, column);
    if (token) lookups[column] = token;
  }

  return Object.freeze({
    placeholderCode,
    lookups: Object.freeze(lookups),
    problems: Object.freeze(problems),
    draft: Object.freeze({
      placeholderCode,
      nameRu: nameRu || null,
      nameEn: nameEn || null,
      capsule: capsule || null,
      drop: drop || null,
      description: description || null,
      colourwayCount: colourwayCount.ok ? colourwayCount.value : null,
      plannedQuantity: plannedQuantity.ok ? plannedQuantity.value : null,
      launchAt: launchAt.ok ? launchAt.value : null,
      currency: currency || null,
      recommendedRetailPriceMinor: retail.ok ? retail.value : null,
      plannedUnitCostMinor: cost.ok ? cost.value : null,
    }),
  });
}

// What a spreadsheet for this import looks like, published so the browser and the downloadable
// template are built from the same definition the server validates against. A format described in two
// places drifts, and the place it drifts is the file a customer already filled in.
export function importContract() {
  return Object.freeze({
    required: REQUIRED,
    columns: Object.freeze(Object.keys(COLUMNS).map((field) => Object.freeze({
      field,
      required: REQUIRED.includes(field),
      dictionary: DICTIONARY_COLUMNS[field] ?? null,
      length: LENGTH[field] ? Object.freeze([...LENGTH[field]]) : null,
      accepts: Object.freeze([...COLUMNS[field]]),
    }))),
  });
}

/** The payload field a resolved dictionary token belongs in. */
export function referenceField(column) { return REF_FIELD[column] ?? null; }

/**
 * A code appearing twice in one file is a mistake in the file. Reporting both lines is the point:
 * saying only "duplicate" leaves the author searching a thousand rows for the other one.
 */
export function findRepeatedCodes(entries) {
  const seen = new Map();
  const repeated = new Map();
  entries.forEach((entry, index) => {
    // The line reported is the line the author sees in their file, which is not the position in the
    // array once a header row and any blank lines are counted.
    const code = typeof entry === 'string' ? entry : entry?.code;
    const line = typeof entry === 'string' ? index + 1 : (entry?.line ?? index + 1);
    if (!code) return;
    if (seen.has(code)) {
      if (!repeated.has(code)) repeated.set(code, [seen.get(code)]);
      repeated.get(code).push(line);
    } else seen.set(code, line);
  });
  return repeated;
}
