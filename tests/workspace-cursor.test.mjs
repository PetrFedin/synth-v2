import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import {
  decodeWorkspaceCursor,
  encodeWorkspaceCursor,
  WORKSPACE_SECTION_NAMES,
} from '../src/core/workspace-cursor.mjs';

test('workspace cursor round-trips every section and freezes decoded state', () => {
  const positions = {
    memberships: ['brand-1', 'actor-1', 'membership-1'],
    organisations: ['brand', 'Brand One', 'brand-1'],
    relationships: ['2026-01-01T00:00:00.000Z', null, 'relationship-1'],
    invitations: ['2026-01-01T00:00:00.000Z', null, 'invitation-1'],
    campaigns: ['2026-01-01T00:00:00.000Z', 'AW26', 'campaign-1'],
    collections: ['Collection', 'collection-1'],
    productStyles: ['STYLE-001', 'style-1'],
    catalogSkus: ['SKU-1'],
    showrooms: ['2026-01-01T00:00:00.000Z', 'Showroom', 'showroom-1'],
    cycles: ['2026-01-01T00:00:00.000Z', null, 'cycle-1'],
    selections: ['2026-01-01T00:00:00.000Z', null, 'selection-1'],
    orders: ['2026-01-01T00:00:00.000Z', null, 'order-1'],
    deals: ['2026-01-01T00:00:00.000Z', null, 'deal-1'],
    calendar: ['2026-01-01T00:00:00.000Z', 'milestone-1'],
  };
  for (const section of WORKSPACE_SECTION_NAMES) {
    const cursor = encodeWorkspaceCursor({ section, position: positions[section] });
    const decoded = decodeWorkspaceCursor(cursor, { section });
    assert.deepEqual(decoded, { section, position: positions[section] });
    assert.equal(Object.isFrozen(decoded), true);
    assert.equal(Object.isFrozen(decoded.position), true);
  }
});

test('workspace cursor rejects cross-section, non-canonical, malformed and wrong-shape values', () => {
  const cursor = encodeWorkspaceCursor({ section: 'catalogSkus', position: ['SKU-1'] });
  assert.throws(() => decodeWorkspaceCursor(cursor, { section: 'orders' }), (error) => error.code === 'WORKSPACE_CURSOR_INVALID');
  for (const candidate of ['', 'not+base64url', `${cursor}=`, 'x'.repeat(2049)]) {
    assert.throws(() => decodeWorkspaceCursor(candidate, { section: 'catalogSkus' }), (error) => error.code === 'WORKSPACE_CURSOR_INVALID');
  }
  const wrongVersion = Buffer.from(JSON.stringify([2, 'catalogSkus', ['SKU-1']])).toString('base64url');
  assert.throws(() => decodeWorkspaceCursor(wrongVersion), (error) => error.code === 'WORKSPACE_CURSOR_INVALID');
  assert.throws(() => encodeWorkspaceCursor({ section: 'orders', position: ['only-one'] }), (error) => error.code === 'WORKSPACE_CURSOR_INVALID');
  assert.throws(() => encodeWorkspaceCursor({ section: 'catalogSkus', position: [null] }), (error) => error.code === 'WORKSPACE_CURSOR_INVALID');
});

test('workspace cursor enforces bounded scalar values', () => {
  assert.throws(() => encodeWorkspaceCursor({ section: 'catalogSkus', position: ['x'.repeat(513)] }), (error) => error.code === 'WORKSPACE_CURSOR_INVALID');
  assert.throws(() => encodeWorkspaceCursor({ section: 'collections', position: [{ unsafe: true }, 'collection-1'] }), (error) => error.code === 'WORKSPACE_CURSOR_INVALID');
});
