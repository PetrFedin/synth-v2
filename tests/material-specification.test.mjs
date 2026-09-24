import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertSpreadFitsCloth,
  costPerConsumptionUnit,
  ddpPricePerConsumptionUnit,
  materialComposition,
  materialSpecification,
  widthInMillimetres,
} from '../src/modules/materials/specification.mjs';

const fibre = (code, percentage, version = 1) => ({
  fibreCode: code,
  percentage,
  fibreRef: { entryId: `mdm-entry:fibre:${code.toLowerCase()}`, version },
});

test('ширина приводится к миллиметрам, поэтому сантиметры и метры сравнимы', () => {
  assert.equal(widthInMillimetres(150, 'cm'), 1500);
  assert.equal(widthInMillimetres(1.5, 'm'), 1500);
  assert.equal(widthInMillimetres(1500, 'mm'), 1500);
});

test('ширина раскроя и её единица называются вместе или не называются вовсе', () => {
  assert.throws(() => materialSpecification({ consumptionUnit: 'm', cuttableWidth: 150 }),
    (error) => error.code === 'MATERIAL_CUTTABLE_WIDTH_UNIT_REQUIRED');
  const bare = materialSpecification({ consumptionUnit: 'm' });
  assert.equal(bare.cuttableWidth, null);
  assert.equal(bare.cuttableWidthMillimetres, null);
});

test('единица закупки и коэффициент пересчёта тоже называются парой', () => {
  assert.throws(() => materialSpecification({ consumptionUnit: 'm', conversionFactor: 3.2 }),
    (error) => error.code === 'MATERIAL_CONVERSION_PAIR_REQUIRED');
});

test('единица, пересчитанная в себя с коэффициентом не единица, — опечатка, а не пересчёт', () => {
  assert.throws(() => materialSpecification({ consumptionUnit: 'm', purchaseUnit: 'm', conversionFactor: 1.4 }),
    (error) => error.code === 'MATERIAL_CONVERSION_SELF_SCALED');
  const same = materialSpecification({ consumptionUnit: 'm', purchaseUnit: 'm', conversionFactor: 1 });
  assert.equal(same.conversionFactor, 1);
});

test('полная спецификация полотна складывается и пересчитывается', () => {
  const spec = materialSpecification({
    consumptionUnit: 'm', weightGsm: 220, cuttableWidth: 148, cuttableWidthUnit: 'cm',
    countryOfOrigin: 'TR', purchaseUnit: 'kg', conversionFactor: 3.2, materialSubtype: 'Рибана',
  });
  assert.equal(spec.cuttableWidthMillimetres, 1480);
  assert.equal(spec.conversionFactor, 3.2);
  assert.equal(spec.countryOfOrigin, 'TR');
});

test('страна происхождения — код ISO, а не название', () => {
  assert.throws(() => materialSpecification({ consumptionUnit: 'm', countryOfOrigin: 'Turkey' }),
    (error) => error.code === 'MATERIAL_COUNTRY_INVALID');
});

test('состав сходится ровно в сто процентов', () => {
  const rows = materialComposition([fibre('COTTON', 60), fibre('POLYESTER', 40)]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].position, 1);
  assert.equal(rows[1].position, 2);
  assert.throws(() => materialComposition([fibre('COTTON', 60), fibre('POLYESTER', 30)]),
    (error) => error.code === 'MATERIAL_COMPOSITION_NOT_WHOLE');
});

test('три равные доли по 33,333 дают 99,999 и отвергаются — остаток несёт одно из волокон', () => {
  assert.throws(
    () => materialComposition([fibre('COTTON', 33.333), fibre('VISCOSE', 33.333), fibre('ELASTANE', 33.333)]),
    (error) => error.code === 'MATERIAL_COMPOSITION_NOT_WHOLE',
  );
  const carried = materialComposition([fibre('COTTON', 33.334), fibre('VISCOSE', 33.333), fibre('ELASTANE', 33.333)]);
  assert.equal(carried.length, 3);
});

test('одно волокно названо в составе один раз', () => {
  assert.throws(() => materialComposition([fibre('COTTON', 60), fibre('COTTON', 40)]),
    (error) => error.code === 'MATERIAL_FIBRE_REPEATED');
});

test('строка состава ссылается на governed-запись справочника с версией', () => {
  assert.throws(() => materialComposition([{ fibreCode: 'COTTON', percentage: 100 }]),
    (error) => error.code === 'MATERIAL_FIBRE_REF_INVALID');
});

test('себестоимость пересчитывается из единицы закупки в единицу расхода', () => {
  // Покупаем по 12,80 за килограмм, из килограмма выходит 3,2 метра — метр стоит 4,00.
  assert.equal(costPerConsumptionUnit({ unitCost: 12.8, conversionFactor: 3.2 }), 4);
  // Без коэффициента цена остаётся ценой за ту же единицу, а не превращается в ноль.
  assert.equal(costPerConsumptionUnit({ unitCost: 6.4 }), 6.4);
});

test('цена DDP доводит цену у ворот поставщика до склада и не может быть ниже её', () => {
  assert.equal(ddpPricePerConsumptionUnit({ unitCost: 12.8, conversionFactor: 3.2, logisticsCoefficient: 1.18 }), 4.72);
  assert.throws(
    () => ddpPricePerConsumptionUnit({ unitCost: 6.4, logisticsCoefficient: 0.3 }),
    (error) => error.code === 'MATERIAL_LOGISTICS_COEFFICIENT_BELOW_ONE',
  );
});

test('настил шире полотна не кладётся', () => {
  assert.throws(
    () => assertSpreadFitsCloth({ fabricWidth: 1600, fabricWidthUnit: 'mm', cuttableWidth: 150, cuttableWidthUnit: 'cm' }),
    (error) => error.code === 'CUTTING_SPREAD_WIDER_THAN_CLOTH',
  );
  const fits = assertSpreadFitsCloth({ fabricWidth: 140, fabricWidthUnit: 'cm', cuttableWidth: 1.5, cuttableWidthUnit: 'm' });
  assert.equal(fits.slackMillimetres, 100, 'десять сантиметров запаса по ширине');
});

test('полотно без заявленной ширины раскроя не останавливает укладку', () => {
  const unknown = assertSpreadFitsCloth({ fabricWidth: 140, fabricWidthUnit: 'cm' });
  assert.equal(unknown.clothMillimetres, null);
  assert.equal(unknown.slackMillimetres, null);
});
