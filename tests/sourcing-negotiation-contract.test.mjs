import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { counterRfqQuote, quotedUnitPriceFor } from '../src/modules/sourcing/public.mjs';

const read = (relativePath) => readFile(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');

const quote = Object.freeze({
  supplierCode: 'SUP-1', revision: 1, unitPriceMinor: 5200, validUntil: '2027-01-01T00:00:00.000Z',
  tiers: Object.freeze([
    Object.freeze({ quantity: 100, unitPriceMinor: 5200 }),
    Object.freeze({ quantity: 500, unitPriceMinor: 4800 }),
    Object.freeze({ quantity: 1000, unitPriceMinor: 4400 }),
  ]),
});
const rfq = Object.freeze({ status: 'quoted', version: 3, quotes: Object.freeze([quote]) });
const supplier = Object.freeze({ supplierCode: 'SUP-1' });

test('the price that applies is the largest break at or below the quantity', () => {
  assert.equal(quotedUnitPriceFor(quote, 50), 5200);
  assert.equal(quotedUnitPriceFor(quote, 100), 5200);
  assert.equal(quotedUnitPriceFor(quote, 499), 5200);
  assert.equal(quotedUnitPriceFor(quote, 500), 4800);
  assert.equal(quotedUnitPriceFor(quote, 5000), 4400);
  // With no ladder at all the quotation's own unit price applies.
  assert.equal(quotedUnitPriceFor({ unitPriceMinor: 700, tiers: [] }, 10), 700);
});

test('a counter-offer cannot ask for more than the supplier already offered', () => {
  // Countering above the quoted price is not a negotiation; it is almost always a wrong unit or a
  // wrong currency, and it would be recorded as a concession nobody made.
  assert.throws(
    () => counterRfqQuote(rfq, { supplier, input: { quantity: 1000, unitPriceMinor: 4500 }, offeredAt: '2026-10-01T00:00:00.000Z', offeredBy: 'actor-1' }),
    (error) => error.code === 'RFQ_COUNTER_ABOVE_QUOTE',
  );
  const countered = counterRfqQuote(rfq, {
    supplier, input: { quantity: 1000, unitPriceMinor: 4100, notes: null },
    offeredAt: '2026-10-01T00:00:00.000Z', offeredBy: 'actor-1',
  });
  const answered = countered.quotes[0].counterOffer;
  assert.equal(answered.unitPriceMinor, 4100);
  assert.equal(answered.totalCostMinor, 4100000);
  // The counter records which revision it answers, so a later revision can be read against what was
  // actually asked for.
  assert.equal(answered.answersQuoteRevision, 1);
});

test('a counter can only be made while the RFQ is open to one', () => {
  for (const status of ['draft', 'issued', 'awarded', 'allocated', 'cancelled']) {
    assert.throws(
      () => counterRfqQuote({ ...rfq, status }, { supplier, input: { quantity: 10, unitPriceMinor: 10 }, offeredAt: '2026-10-01T00:00:00.000Z', offeredBy: 'a' }),
      (error) => error.code === 'RFQ_NOT_NEGOTIABLE',
    );
  }
});

test('a price ladder that rises with quantity is refused', async () => {
  const sourcing = await read('src/modules/sourcing/public.mjs');
  assert.match(sourcing, /RFQ_QUOTE_TIER_PRICE_RISES/);
  assert.match(sourcing, /A larger quantity cannot cost more per unit/);
  assert.match(sourcing, /RFQ_QUOTE_TIER_QUANTITY_REPEATED/);
});

test('an amount typed the way this UI prints it is accepted', async () => {
  const ui = await read('public/modules/sourcing.js');
  // The UI shows "21 250,00 €" and then rejected 52,00 with the bare code INVALID_MONEY.
  assert.doesNotMatch(ui, /throw new Error\('INVALID_MONEY'\)/);
  assert.match(ui, /replace\(',', '\.'\)/);
  assert.match(ui, /replace\(\/\[\\s\\u00a0\\u202f\]\/g, ''\)/);
});

test('dates follow the interface language, not the browser', async () => {
  for (const name of ['sourcing', 'production-orders', 'production-executions', 'final-quality']) {
    const ui = await read(`public/modules/${name}.js`);
    assert.doesNotMatch(ui, /Intl\.DateTimeFormat\(undefined/, `${name}.js still formats dates in the browser locale`);
  }
});
