import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { MATERIAL_COST_READ_ROLES, projectMaterialForRole, roleReadsMaterialCost } from '../src/infrastructure/material-cost-projection.mjs';
import { ALLOWED_ROLES, CAPABILITIES, capabilitiesForRole } from '../src/modules/access-control/public.mjs';

const root = process.cwd();
const material = Object.freeze({
  code: 'MAT-JERSEY', name: 'Джерси', type: 'fabric', unit: 'm',
  unitCost: 4.1, currency: 'EUR', availableToUse: 5000, composition: '100% cotton',
});

test('a role with no cost capability does not read the purchase price', () => {
  // Аудит писал «около 55 читающих маршрутов не проверяют роль» и «viewer читает то же, что
  // finance». Перемерено: семнадцать читателей фильтруют по роли прямо в SQL, ещё четыре
  // проверяют способность в службе, и наборы ролей там содержательно разные — деньги закрыты для
  // продаж и viewer, обмеры и образцы закрыты для финансов. Настоящая находка одна и объективна:
  // себестоимость материала охранялась как деньги в ведомости и была открыта в реестре материалов.
  const projected = projectMaterialForRole(material, 'viewer');
  assert.equal(projected.unitCost, undefined);
  // Цена без валюты — это не цена, а число: валюта уходит вместе с ней.
  assert.equal(projected.currency, undefined);
  // Всё, чем роль работает, остаётся: закрывать материал целиком не нужно и нельзя.
  assert.equal(projected.name, 'Джерси');
  assert.equal(projected.unit, 'm');
  assert.equal(projected.availableToUse, 5000);
  assert.equal(projected.composition, '100% cotton');
});

test('the cost stays for the roles that already read the registers where cost is the subject', () => {
  for (const role of MATERIAL_COST_READ_ROLES) {
    assert.equal(projectMaterialForRole(material, role).unitCost, 4.1, `${role} must keep the cost`);
  }
  for (const role of ['sales', 'production', 'quality', 'viewer']) {
    assert.equal(projectMaterialForRole(material, role).unitCost, undefined, `${role} must not read the cost`);
  }
});

test('the guarded set matches the capability model rather than a separate opinion', () => {
  // Права на себестоимость выражены в модели: COST_MANAGE есть у владельца, администратора и
  // финансов; у viewer денежных способностей нет ни одной. Набор ролей здесь обязан совпадать с
  // тем, кому эта способность дана, а не быть ещё одним мнением о том же.
  const holders = ALLOWED_ROLES.brand.filter((role) => capabilitiesForRole(role).includes(CAPABILITIES.COST_MANAGE));
  assert.deepEqual([...MATERIAL_COST_READ_ROLES].sort(), holders.sort());
  assert.equal(roleReadsMaterialCost('viewer'), false);
  assert.equal(roleReadsMaterialCost(undefined), false);
  assert.equal(roleReadsMaterialCost('owner'), true);
});

test('both read paths project, and the role is read by the same query as the material', async () => {
  // Прочитать права в один момент, а материал в другой — значит однажды показать цену тому, у кого
  // её только что отобрали. Поэтому роль берётся тем же запросом, внутри того же снимка.
  const reader = await readFile(path.join(root, 'src/infrastructure/postgres-material-reader.mjs'), 'utf8');
  assert.equal(reader.match(/AS actor_role/g).length, 2, 'both the page and the single read must resolve the role');
  assert.equal(reader.match(/projectMaterialForRole\(/g).length, 2, 'both read paths must project');
  assert.doesNotMatch(reader, /await pool\.query\([^)]*memberships[^)]*\)\s*;\s*\n\s*const/, 'the role must not be fetched in a separate round trip');
});

test('the projection follows the pattern the catalogue already uses', async () => {
  // Изъятие поля по правам в проекте уже есть: каталог убирает внутренние складские числа из
  // строки, которой читатель не владеет. Приём тот же, признак другой — не чужая организация, а
  // роль без права на себестоимость.
  const catalogue = await readFile(path.join(root, 'src/infrastructure/catalog-counterparty-projection.mjs'), 'utf8');
  assert.match(catalogue, /for \(const field of INTERNAL_STOCK_FIELDS\) delete projected\[field\]/);
  const material = await readFile(path.join(root, 'src/infrastructure/material-cost-projection.mjs'), 'utf8');
  assert.match(material, /for \(const field of COST_FIELDS\) delete projected\[field\]/);
});
