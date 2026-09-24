import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  PRODUCTION_ACCEPTANCE_REFERENCES,
  bootstrapProductionAcceptanceReferences,
} from '../src/acceptance/production-reference-bootstrap.mjs';

const root = process.cwd();

test('an identifier that already holds roles cannot be given a sign-in identity', async () => {
  const sql = await readFile(path.join(root, 'db', 'migrations', '125_membership_names_an_identity.sql'), 'utf8');
  // Правило в базе, а не только в домене: `auth` о членствах не знает, а писатель мимо модуля
  // всё равно упрётся в триггер.
  assert.match(sql, /CREATE OR REPLACE FUNCTION refuse_identity_for_a_taken_actor\(\)/);
  assert.match(sql, /FROM memberships\s+WHERE user_id = NEW\.id/s);
  assert.match(sql, /AUTH_ACTOR_IDENTIFIER_TAKEN/);
  assert.match(sql, /BEFORE INSERT ON auth_users/);
  // Внешнего ключа здесь намеренно нет: `memberships.user_id` — это актёр, и актёром может быть
  // не только тот, кто входит. Отказ сформулирован ровно по опасности, а не шире неё.
  assert.doesNotMatch(sql, /FOREIGN KEY \(user_id\) REFERENCES auth_users/);
});

function fakePlatform() {
  const granted = [];
  return {
    granted,
    async registerOrganisation(_commandId, _actorId, organisation) { return organisation; },
    async grantMembership(_commandId, _actorId, membership) { granted.push(membership); return membership; },
  };
}

test('the acceptance bootstrap gives every actor an identity before it gives them a role', async () => {
  const created = [];
  const known = new Set();
  const platform = fakePlatform();
  await bootstrapProductionAcceptanceReferences({
    platform,
    pool: { async query(_sql, [id]) { return { rowCount: known.has(id) ? 1 : 0, rows: [] }; } },
    auth: {
      async bootstrapUser(input) {
        // Личность обязана появиться раньше членства, иначе внешний ключ её не найдёт.
        assert.equal(platform.granted.length, 0, 'identities are created before any role is granted');
        created.push(input);
        known.add(input.id);
        return { id: input.id };
      },
    },
  });

  assert.deepEqual(created.map((user) => user.id).sort(), Object.values(PRODUCTION_ACCEPTANCE_REFERENCES.actors).slice().sort());
  // Эти актёры никогда не входят в систему, поэтому личность заводится отключённой: идентификатор
  // занят, а действовать под ним нельзя — ни вход, ни проверка сессии не пропускают ничего, кроме
  // `active`. Именно это закрывает находку аудита: занять освободившийся идентификатор нельзя.
  for (const user of created) {
    assert.equal(user.status, 'disabled');
    assert.match(user.email, /@acceptance\.invalid$/);
    assert.ok(user.password.length >= 32, 'a placeholder gets a password nobody knows');
  }
  assert.equal(platform.granted.length, 5);
});

test('an actor who already has an identity is left exactly as they are', async () => {
  const created = [];
  const platform = fakePlatform();
  await bootstrapProductionAcceptanceReferences({
    platform,
    // Владельцы входят в систему своими данными и заводятся приёмочным прогоном до бутстрапа.
    pool: { async query(_sql, [id]) { return { rowCount: id.endsWith('-owner') ? 1 : 0, rows: [] }; } },
    auth: { async bootstrapUser(input) { created.push(input.id); return { id: input.id }; } },
  });
  assert.deepEqual(created.slice().sort(), [
    PRODUCTION_ACCEPTANCE_REFERENCES.actors.brandFinance,
    PRODUCTION_ACCEPTANCE_REFERENCES.actors.brandProduction,
    PRODUCTION_ACCEPTANCE_REFERENCES.actors.shopBuyer,
  ].slice().sort());
});

test('without an authentication service the bootstrap grants roles as before', async () => {
  const platform = fakePlatform();
  const result = await bootstrapProductionAcceptanceReferences({ platform });
  assert.equal(platform.granted.length, 5);
  assert.equal(result.actors.brandOwner, PRODUCTION_ACCEPTANCE_REFERENCES.actors.brandOwner);
});
