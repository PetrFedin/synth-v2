// Тянет официальный дневной курс ЦБ РФ и записывает его в currency_reference_rates.
//
// Источник — публичный XML ЦБ (https://www.cbr.ru/scripts/XML_daily.asp), без ключа и без
// зависимости: у проекта нет XML-библиотеки, а формат ЦБ простой и фиксированный, поэтому строки
// вытаскиваются регулярными выражениями, как и парсинг любого другого доверенного источника в
// проекте не тянет XML-парсер ради одного файла.
//
// Курс ЦБ публикуется как «столько рублей за Nominal единиц валюты» — для слабых валют (например,
// йены) Nominal может быть 100. Курс, который нужен модулям (`quotedUnitPriceFor`, ведомость,
// заявка), — рублей за одну единицу, поэтому делим на Nominal здесь, один раз, а не заставляем
// каждого потребителя переоткрывать этот нюанс.
import process from 'node:process';
import pg from 'pg';
import { createPostgresCurrencyReferenceStore } from '../src/infrastructure/postgres-currency-reference-store.mjs';
import { createCurrencyReferenceIngestService } from '../src/application/currency-reference-service.mjs';

const TRACKED_CURRENCIES = Object.freeze(['USD', 'EUR', 'CNY', 'TRY', 'JPY']);
const BASE_CURRENCY = 'RUB';

const databaseUrl = process.env.SYNTHA_V2_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('SYNTHA_V2_DATABASE_URL is required');

const requestedDate = process.argv.find((arg) => arg.startsWith('--date='))?.slice('--date='.length);
const effectiveOn = requestedDate ?? new Date().toISOString().slice(0, 10);
const [year, month, day] = effectiveOn.split('-');
const cbrDate = `${day}/${month}/${year}`;

const xml = await fetchCbrDaily(cbrDate);
const parsed = parseCbrDaily(xml);
const recorded = [];
const skipped = [];
for (const currency of TRACKED_CURRENCIES) {
  const entry = parsed.get(currency);
  if (!entry) { skipped.push(currency); continue; }
  recorded.push({ fromCurrency: currency, toCurrency: BASE_CURRENCY, rate: entry.value / entry.nominal });
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
try {
  const store = createPostgresCurrencyReferenceStore({ pool });
  const ingest = createCurrencyReferenceIngestService({ store });
  const written = [];
  for (const { fromCurrency, toCurrency, rate } of recorded) {
    await ingest.recordRate({ source: 'cbr', fromCurrency, toCurrency, rate, effectiveOn });
    written.push({ fromCurrency, toCurrency, rate });
  }
  console.log(JSON.stringify({ ok: true, effectiveOn, written, skipped }, null, 2));
} finally {
  await pool.end();
}

async function fetchCbrDaily(dateReq) {
  const response = await fetch(`https://www.cbr.ru/scripts/XML_daily.asp?date_req=${dateReq}`, {
    signal: AbortSignal.timeout(30_000),
    headers: { 'user-agent': 'Syntha-V2-Currency-Reference-Sync/1.0' },
  });
  if (!response.ok) throw new Error(`CBR daily feed returned ${response.status} ${response.statusText}`);
  const buffer = await response.arrayBuffer();
  return new TextDecoder('windows-1251').decode(buffer);
}

// <Valute ID="R01235"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal>
// <Name>Доллар США</Name><Value>92,1234</Value><VunitRate>92,1234</VunitRate></Valute>
function parseCbrDaily(xml) {
  const rates = new Map();
  const blocks = xml.match(/<Valute[^>]*>[\s\S]*?<\/Valute>/g) ?? [];
  for (const block of blocks) {
    const charCode = block.match(/<CharCode>([A-Z]{3})<\/CharCode>/)?.[1];
    const nominal = block.match(/<Nominal>(\d+)<\/Nominal>/)?.[1];
    const value = block.match(/<Value>([\d,.]+)<\/Value>/)?.[1];
    if (!charCode || !nominal || !value) continue;
    rates.set(charCode, { nominal: Number(nominal), value: Number(value.replace(',', '.')) });
  }
  return rates;
}
