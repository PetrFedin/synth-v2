import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { PLACEHOLDER_STATUSES, transitionProductPlaceholder } from '../src/modules/assortment-planning/public.mjs';

const planning = await readFile(new URL('../public/modules/planning.js', import.meta.url), 'utf8');

// Найдено живым обходом: из пяти маршрутов слотов ассортимента в интерфейсе достижимы были только
// два импортных. `POST /v2/assortment/placeholders/{id}/transition` не вызывался нигде, то есть
// статус слота человек изменить не мог вообще — слот навсегда оставался в том состоянии, в каком
// приехал из импорта. При этом в демо-данных есть слоты `in_development`, то есть в состоянии,
// которого пользователь достичь не может.

// Карта переходов, записанная на экране, читается из исходника: она обязана совпадать с доменной,
// а не быть её самостоятельной копией, разошедшейся со временем.
function offeredByTheScreen() {
  const block = planning.match(/const PLACEHOLDER_TRANSITIONS = \{([\s\S]*?)\n  \};/);
  assert.ok(block, 'the planning screen must declare which moves it offers');
  const offered = {};
  for (const [, from, body] of block[1].matchAll(/(\w+): \[([\s\S]*?)\]/g)) {
    offered[from] = [...body.matchAll(/status: '(\w+)'/g)].map(([, to]) => to);
  }
  return offered;
}

function slot(status) {
  return Object.freeze({ id: 'placeholder-1', brandId: 'brand-1', status, version: 7 });
}

function refusalFor(status, nextStatus) {
  try {
    transitionProductPlaceholder(slot(status), nextStatus, { updatedAt: '2026-09-23T10:00:00.000Z', updatedBy: 'someone', expectedVersion: 7 });
    return null;
  } catch (error) {
    return error.code;
  }
}

test('the screen offers a move for every status the domain can leave', () => {
  const offered = offeredByTheScreen();
  assert.deepEqual(Object.keys(offered).sort(), [...PLACEHOLDER_STATUSES].sort());
});

test('every move the screen offers is one the domain accepts', () => {
  for (const [from, moves] of Object.entries(offeredByTheScreen())) {
    for (const to of moves) {
      assert.equal(refusalFor(from, to), null, `the screen offers ${from} → ${to}, which the domain rejects`);
    }
  }
});

test('every move the domain accepts is one the screen offers', () => {
  // Обратная сторона: предложить меньше, чем можно, — это молча отнять у человека действие.
  const offered = offeredByTheScreen();
  for (const from of PLACEHOLDER_STATUSES) {
    for (const to of PLACEHOLDER_STATUSES) {
      if (from === to) continue;
      const allowed = refusalFor(from, to) === null;
      assert.equal(
        offered[from].includes(to), allowed,
        `${from} → ${to}: domain ${allowed ? 'accepts' : 'rejects'} it, the screen ${offered[from].includes(to) ? 'offers' : 'hides'} it`,
      );
    }
  }
});

test('the move is sent with the version the reader was shown', () => {
  // Без `expectedVersion` перевод затирал бы чужую правку молча; версия берётся из той же строки,
  // которую человек видит.
  assert.match(planning, /\/v2\/assortment\/placeholders\/\$\{encodeURIComponent\(item\.id\)\}\/transition/);
  assert.match(planning, /expectedVersion: item\.version/);
  assert.match(planning, /nextStatus: move\.status/);
});

test('a dropped slot says it is the end of the road instead of showing nothing', () => {
  assert.deepEqual(offeredByTheScreen().dropped, []);
  assert.match(planning, /Слот снят с плана — это конечное состояние/);
  assert.match(planning, /a final state it cannot return from/);
});

test('dropping asks first, and only dropping does', () => {
  // Снятие необратимо — домен не знает пути назад из `dropped`.
  assert.equal(refusalFor('dropped', 'planned'), 'PLACEHOLDER_STATUS_TRANSITION_INVALID');
  assert.match(planning, /move\.status === 'dropped'\s*\n\s*\? text\('Снятый слот вернуть в план нельзя\. Снять\?'/);
});

test('only the role that may manage the campaign sees the moves', () => {
  assert.match(planning, /caps\?\.hasForOrganisation\(state\.workspace, item\.brandId, caps\.CAPABILITIES\.CAMPAIGN_MANAGE\)/);
});
