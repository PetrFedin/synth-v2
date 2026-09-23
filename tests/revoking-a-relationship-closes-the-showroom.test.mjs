import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { assertAcceptedShowroomAccess } from '../src/modules/showroom-invitations/public.mjs';

// Найдено живьём на копии демо: бренд отзывает торговую связь с магазином, приглашение при этом
// остаётся принятым — и отключённый партнёр продолжает читать образы бренда и каталог покупателя
// вместе с оптовыми ценами. Проверено обоими маршрутами: `GET /v2/showrooms/{id}/looks` отдавал
// образ с ценой 185, `GET /v2/showrooms/{id}/buyer-catalog` — строку с ценой 129.
//
// Каскада «отозвали связь → отозвали приглашения» быть не должно: это разные решения, и связь
// можно восстановить, не выписывая приглашения заново. Поэтому доступ спрашивает оба факта сразу.

const invitation = Object.freeze({
  id: 'invitation-1',
  showroomId: 'showroom-1',
  brandId: 'brand-1',
  shopId: 'shop-1',
  status: 'accepted',
  expiresAt: '2027-01-01T00:00:00.000Z',
});
const where = Object.freeze({ showroomId: 'showroom-1', brandId: 'brand-1', shopId: 'shop-1', now: '2026-09-23T12:00:00.000Z' });
const active = Object.freeze({ id: 'relationship-1', brandId: 'brand-1', shopId: 'shop-1', status: 'active' });

test('an accepted invitation on an active relationship opens the showroom', () => {
  assert.equal(assertAcceptedShowroomAccess(invitation, { ...where, relationship: active }), invitation);
});

test('an accepted invitation is not enough once the relationship is no longer active', () => {
  for (const status of ['revoked', 'rejected', 'pending']) {
    assert.throws(
      () => assertAcceptedShowroomAccess(invitation, { ...where, relationship: { ...active, status } }),
      error => error?.code === 'ACTIVE_RELATIONSHIP_REQUIRED',
      `a ${status} relationship must not open the showroom`,
    );
  }
});

// Место вызова, которое связь не подаёт, обязано упереться в отказ, а не тихо сохранить дыру.
test('access fails closed when the relationship was never asked for', () => {
  assert.throws(
    () => assertAcceptedShowroomAccess(invitation, where),
    error => error?.code === 'ACTIVE_RELATIONSHIP_REQUIRED',
  );
});

test('a relationship between other parties is not this trade', () => {
  assert.throws(
    () => assertAcceptedShowroomAccess(invitation, { ...where, relationship: { ...active, shopId: 'shop-2' } }),
    error => error?.code === 'RELATIONSHIP_TRADE_MISMATCH',
  );
});

// Оба маршрута, на которых утечка была измерена, и все остальные места, где доступ проверяется.
test('every place that trusts an invitation now also reads the relationship', async () => {
  const sources = await Promise.all([
    'src/application/showroom-selection-service.mjs',
    'src/application/commercial-publication-service.mjs',
    'src/application/order-builder-service.mjs',
  ].map(name => readFile(new URL(`../${name}`, import.meta.url), 'utf8')));

  for (const source of sources) {
    for (const call of source.match(/assertAcceptedShowroomAccess\([\s\S]*?\}\);/g) ?? []) {
      assert.match(call, /relationship(:|\s*\})/, `a showroom access check without a relationship: ${call.slice(0, 90)}`);
    }
  }

  // Образы охраняются собственной проверкой, не через общий помощник, — и она спрашивает то же.
  const [selection] = sources;
  assert.match(selection, /const relationship = await tx\.getRelationshipByTrade\(showroom\.brandId, membership\.organisationId\);/);
  assert.match(selection, /if \(relationship\?\.status === 'active'\) return;/);
});
