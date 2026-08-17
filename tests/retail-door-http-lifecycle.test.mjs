import test from 'node:test';
import assert from 'node:assert/strict';
import { createRetailDoorRoutes } from '../src/http/retail-door-routes.mjs';

function routeFor(routes, method, path) {
  return routes.find(route => route.method === method && route.pattern.test(path));
}

function contextFor(route, path, body) {
  const match = path.match(route.pattern);
  assert.ok(match, `Route does not match ${path}`);
  return {
    commandId: 'cmd_reactivate_1',
    actorId: 'user_1',
    params: match.slice(1),
    query: {},
    body,
  };
}

test('retail door reactivation route forwards optimistic version to the service', () => {
  const calls = [];
  const retailDoors = {
    reactivateRetailDoor(commandId, actorId, doorId, body) {
      calls.push({ commandId, actorId, doorId, body });
      return { id: doorId, status: 'active', version: body.expectedVersion + 1 };
    },
  };
  const routes = createRetailDoorRoutes({ retailDoors });
  const path = '/v2/retail-doors/door_1/reactivate';
  const route = routeFor(routes, 'POST', path);
  assert.ok(route);

  const result = route.execute(contextFor(route, path, { expectedVersion: 2 }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].commandId, 'cmd_reactivate_1');
  assert.equal(calls[0].actorId, 'user_1');
  assert.equal(calls[0].doorId, 'door_1');
  assert.equal(calls[0].body.expectedVersion, 2);
  assert.equal(result.status, 'active');
  assert.equal(result.version, 3);
});

test('retail door reactivation route rejects invalid optimistic version before service execution', () => {
  let calls = 0;
  const retailDoors = { reactivateRetailDoor() { calls += 1; } };
  const routes = createRetailDoorRoutes({ retailDoors });
  const path = '/v2/retail-doors/door_1/reactivate';
  const route = routeFor(routes, 'POST', path);
  assert.ok(route);

  assert.throws(() => route.execute(contextFor(route, path, { expectedVersion: 0 })), /expectedVersion/);
  assert.equal(calls, 0);
});
