import { invariant } from '../../core/errors.mjs';

// A versioned planning model, not an Actual Cost / governed KPI implementation.
export const DIGITAL_ECONOMICS_FORMULA = 'digital-batch-scenario-v1';
export const SCENARIO_FIELDS = Object.freeze([
  'name', 'currency', 'quantity', 'expectedSoldUnits', 'unitProductionCost',
  'netUnitPrice', 'unitSellingCost', 'fixedDevelopmentCost', 'minimumOrderQuantity', 'packSize',
]);
const MONEY_FIELDS = ['unitProductionCost', 'netUnitPrice', 'unitSellingCost', 'fixedDevelopmentCost'];
const SCALE = 10000n;
const MAX_MONEY = 9007199254740991n;
const CURRENCIES = new Set(['EUR', 'RUB', 'USD', 'GBP', 'CHF', 'CNY', 'JPY']);

export function parseScenarioMoney(value, field) {
  invariant(typeof value === 'string' && /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,4})?$/.test(value),
    'DIGITAL_SAMPLE_MONEY_INVALID', 'Money must be a non-negative decimal string with at most four decimal places', { field });
  const [whole, fraction = ''] = value.split('.');
  const result = BigInt(whole) * SCALE + BigInt(fraction.padEnd(4, '0'));
  invariant(result <= MAX_MONEY, 'DIGITAL_SAMPLE_MONEY_INVALID', 'Money exceeds the supported range', { field });
  return result;
}
export function formatScenarioMoney(value) {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / SCALE}.${String(absolute % SCALE).padStart(4, '0')}`;
}
export function normalizeScenarioInput(input) {
  invariant(input && Object.getPrototypeOf(input) === Object.prototype, 'DIGITAL_SAMPLE_INPUT_INVALID', 'Scenario must be a plain JSON object');
  invariant(Object.keys(input).every(key => SCENARIO_FIELDS.includes(key)), 'DIGITAL_SAMPLE_FIELD_UNKNOWN', 'Unsupported scenario field');
  invariant(typeof input.name === 'string' && input.name.trim().length >= 1 && input.name.trim().length <= 160
    && !/[\x00-\x1f\x7f]/.test(input.name), 'DIGITAL_SAMPLE_TEXT_INVALID', 'Scenario name is invalid');
  invariant(CURRENCIES.has(input.currency), 'DIGITAL_SAMPLE_CURRENCY_INVALID', 'Currency is not supported by this planning model');
  const value = { name: input.name.trim(), currency: input.currency,
    quantity: input.quantity, expectedSoldUnits: input.expectedSoldUnits,
    minimumOrderQuantity: input.minimumOrderQuantity, packSize: input.packSize,
    unitProductionCost: input.unitProductionCost, netUnitPrice: input.netUnitPrice,
    unitSellingCost: input.unitSellingCost, fixedDevelopmentCost: input.fixedDevelopmentCost };
  for (const field of ['quantity', 'expectedSoldUnits', 'minimumOrderQuantity', 'packSize']) {
    const min = field === 'expectedSoldUnits' ? 0 : 1;
    invariant(Number.isSafeInteger(input[field]) && input[field] >= min && input[field] <= 1_000_000,
      'DIGITAL_SAMPLE_QUANTITY_INVALID', 'Invalid unit count', { field });
    value[field] = input[field];
  }
  invariant(value.expectedSoldUnits <= value.quantity, 'DIGITAL_SAMPLE_QUANTITY_INVALID', 'Planned sales cannot exceed the batch', { field: 'expectedSoldUnits' });
  for (const field of MONEY_FIELDS) value[field] = formatScenarioMoney(parseScenarioMoney(input[field], field));
  return Object.freeze(value);
}
function ceilRatio(numerator, denominator) {
  if (numerator === 0n) return '0';
  if (denominator <= 0n) return null;
  return String((numerator + denominator - 1n) / denominator);
}

export function calculateDigitalSampleScenario(input) {
  const normalized = normalizeScenarioInput(input);
  const q = BigInt(normalized.quantity), sold = BigInt(normalized.expectedSoldUnits);
  const c = parseScenarioMoney(normalized.unitProductionCost, 'unitProductionCost');
  const p = parseScenarioMoney(normalized.netUnitPrice, 'netUnitPrice');
  const v = parseScenarioMoney(normalized.unitSellingCost, 'unitSellingCost');
  const f = parseScenarioMoney(normalized.fixedDevelopmentCost, 'fixedDevelopmentCost');
  const contribution = p - v - c;
  const unsoldStock = (q - sold) * c;
  const investment = q * c + f;
  const salesResult = sold * contribution - f;
  const cashResult = sold * (p - v) - investment;
  const profitBreakEven = ceilRatio(f, contribution);
  const cashBreakEven = ceilRatio(investment, p - v);
  const blockers = [];
  if (normalized.quantity < normalized.minimumOrderQuantity) blockers.push('MOQ_NOT_MET');
  if (normalized.quantity % normalized.packSize !== 0) blockers.push('PACK_MULTIPLE_NOT_MET');
  const warnings = [];
  if (contribution <= 0n) warnings.push('NON_POSITIVE_UNIT_CONTRIBUTION');
  if (cashBreakEven === null || BigInt(cashBreakEven) > q) warnings.push('BATCH_CASH_RECOVERY_UNREACHABLE');
  if (cashResult < 0n) warnings.push('BATCH_CASH_SHORTFALL');
  invariant(salesResult - cashResult === unsoldStock, 'DIGITAL_SAMPLE_RECONCILIATION_FAILED', 'Batch cash bridge does not reconcile');
  return Object.freeze({
    formulaVersion: DIGITAL_ECONOMICS_FORMULA,
    basis: 'manual_estimate', unitOfMeasure: 'piece', monetaryScale: 4,
    input: normalized,
    result: Object.freeze({
      plannedRevenue: formatScenarioMoney(sold * p),
      unitContribution: formatScenarioMoney(contribution),
      contributionSalesResult: formatScenarioMoney(salesResult),
      unsoldUnits: normalized.quantity - normalized.expectedSoldUnits,
      unsoldStockAtProductionCost: formatScenarioMoney(unsoldStock),
      batchInvestment: formatScenarioMoney(investment),
      batchCashResult: formatScenarioMoney(cashResult),
      salesBreakEvenUnits: profitBreakEven,
      batchCashBreakEvenUnits: cashBreakEven,
      batchCashBreakEvenReachable: cashBreakEven !== null && BigInt(cashBreakEven) <= q,
      fullSellThroughCashResult: formatScenarioMoney(q * contribution - f),
      breakEvenNetUnitPrice: sold > 0n ? formatScenarioMoney((investment + sold * v + sold - 1n) / sold) : null,
      reconciliationResidual: '0.0000',
    }),
    blockers: Object.freeze(blockers), warnings: Object.freeze(warnings),
    productionReady: false, demandVerified: false,
  });
}
