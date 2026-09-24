import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createOrderEconomicsPositionService } from '../src/application/order-economics-position-service.mjs';

const root = process.cwd();

const ORDER = Object.freeze({ id: 'order-1', brandId: 'brand-1', orderCommitSnapshotId: 'commit-1' });
const COMMIT = Object.freeze({ id: 'commit-1', orderId: 'order-1', status: 'committed', currency: 'EUR' });
const MARGIN = Object.freeze({
  id: 'margin-1', landedCostSnapshotId: 'landed-1', landedCost: 1710, netRevenue: 1440,
  contributionMarginAmount: -270, contributionMarginPercent: -18.75,
  allocationStatus: 'current', costAllocationRunSnapshotId: 'run-1',
});
const LANDED = Object.freeze({ id: 'landed-1', totalCost: 1710 });

function serviceWith({ margin = null, landed = null } = {}) {
  return createOrderEconomicsPositionService({
    economicsStore: {
      transaction: (work) => work({
        getOrder: async () => ORDER,
        getMembership: async () => ({ organisationId: 'brand-1', userId: 'actor-1', role: 'owner', status: 'active' }),
        getOrderCommitSnapshot: async () => COMMIT,
        getCostCloseByOrderCommitSnapshotId: async () => undefined,
        getLatestCostCloseReadinessByOrderCommitSnapshotId: async () => undefined,
        getLatestMarginActualizationByOrderCommitSnapshotId: async () => margin ?? undefined,
        getLandedCostSnapshot: async () => landed ?? undefined,
      }),
    },
  });
}

test('an actualized margin is reported before anyone evaluates readiness', async () => {
  // Оценка готовности говорит, **можно ли закрывать**, а не **сколько заработано**. Пока эти два
  // вопроса были связаны, экран экономики показывал прочерки при полном реестре затрат: маржа
  // посчитана, а прочитать её было нельзя.
  const position = await serviceWith({ margin: MARGIN, landed: LANDED }).getOrderEconomicsPositionForActor('actor-1', 'order-1');
  assert.equal(position.status, 'OPEN');
  assert.equal(position.effectiveContributionMarginAmount, -270);
  assert.equal(position.effectiveContributionMarginPercent, -18.75);
  assert.equal(position.effectiveTotalLandedCost, 1710);
  assert.equal(position.effectiveMarginActualizationSnapshotId, 'margin-1');
  assert.equal(position.allocationStatus, 'current');
  // Причина остаётся названной: цифра есть, но окончательной её ещё никто не объявлял.
  assert.deepEqual(position.blockingReasons, ['readiness_not_evaluated']);
});

test('an order with no margin yet still answers honestly with nothing', async () => {
  const position = await serviceWith().getOrderEconomicsPositionForActor('actor-1', 'order-1');
  assert.equal(position.status, 'OPEN');
  assert.equal(position.effectiveContributionMarginAmount, null);
  assert.deepEqual(position.blockingReasons, ['readiness_not_evaluated']);
});

test('the registry that replaced the order card carries the button that opens the screen', async () => {
  // Экран экономики был написан целиком и недостижим: кнопка осталась на прежней карточке заказа.
  // Действия заказа переопределяются в `order-lifecycle-actions.js` — там и живёт настоящий список.
  const source = await readFile(path.join(root, 'public/modules/order-lifecycle-actions.js'), 'utf8');
  assert.match(source, /window\.odOrderActions = function odOrderActions/);
  assert.match(source, /CAPABILITIES\.MARGIN_READ/);
  assert.match(source, /window\.orderEconomicsDialog\(item\)/);
  // Диалог переиспользуется, а не переписывается: второй копии этого экрана быть не должно.
  const workspace = await readFile(path.join(root, 'public/modules/omnidata-workspace.js'), 'utf8');
  assert.doesNotMatch(workspace, /orderEconomicsDialog/);
});
