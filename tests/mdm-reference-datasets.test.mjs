import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const dataset = JSON.parse(await fs.readFile(new URL('../mdm/reference/russia-fashion-core.json', import.meta.url), 'utf8'));
const dictionary = (code) => dataset.dictionaries.find((item) => item.code === code);

function entry(code, entryCode) {
  return dictionary(code)?.entries.find((item) => item.code === entryCode);
}

test('Russia fashion operational MDM is bilingual and explicitly Russia-first', () => {
  assert.equal(dataset.profile, 'RU_FASHION_CORE');
  assert.deepEqual(dataset.markets, ['RU']);
  assert.ok(dataset.languages.includes('ru'));
  assert.ok(dataset.languages.includes('en'));
  for (const item of dataset.dictionaries) {
    assert.ok(item.name.ru);
    assert.ok(item.name.en);
    for (const record of item.entries) {
      assert.ok(record.name_ru);
      assert.ok(record.name_en);
    }
  }
});

test('core apparel sizes remain system-specific and never invent universal RU to INT conversion', () => {
  assert.equal(entry('size.size', 'RU_46').attributes.size_system_code, 'RU_APPAREL_NUMERIC');
  assert.equal(entry('size.size', 'INT_M').attributes.size_system_code, 'INT_ALPHA');
  for (const record of dictionary('size.size').entries) {
    const keys = Object.keys(record.attributes);
    assert.equal(keys.some((key) => /equivalent|conversion|mapped_size/i.test(key)), false, record.code);
  }
});

test('operational measurement units are metric-first for Russian product data', () => {
  const units = dictionary('measurement.unit').entries;
  assert.deepEqual(units.filter((item) => item.attributes.dimension === 'length').map((item) => item.code).sort(), ['CM', 'M', 'MM']);
  assert.deepEqual(units.filter((item) => item.attributes.dimension === 'mass').map((item) => item.code).sort(), ['G', 'KG']);
  assert.equal(units.some((item) => ['IN', 'FT', 'YD', 'OZ', 'LB'].includes(item.code)), false);
  assert.equal(entry('measurement.unit', 'CM').attributes.default_for, 'garment_measurement');
});

test('garment POM records resolve their default unit by stable MDM identity', () => {
  const unitIds = new Set(dictionary('measurement.unit').entries.map((item) => item.id));
  for (const point of dictionary('measurement.point').entries) {
    assert.ok(unitIds.has(point.attributes.default_unit_entry_id), point.code);
    assert.equal(point.attributes.default_unit_code, 'CM');
  }
});
