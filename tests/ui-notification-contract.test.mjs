import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = Object.fromEntries(await Promise.all([
  'app-core.js', 'dom-2.js', 'views-2.js', 'views-4.js', 'notification-pagination.js',
].map(async name => [name, await readFile(new URL(`../public/modules/${name}`, import.meta.url), 'utf8')])));

test('notification bootstrap uses the cursor endpoint and exact unread metadata', () => {
  assert.match(files['app-core.js'], /api\('\/v2\/notifications\/page\?limit=100'\)/);
  assert.doesNotMatch(files['app-core.js'], /api\('\/v2\/notifications'\)/);
  assert.match(files['app-core.js'], /notificationUnreadCount/);
  assert.match(files['app-core.js'], /const unread = state\.notificationUnreadCount/);
  assert.doesNotMatch(files['app-core.js'], /notifications\.filter\(item => item\.status !== 'read'\)/);
});

test('notification paging participates in refresh logout and rendering lifecycle', () => {
  assert.match(files['app-core.js'], /notificationPaging\.abort\(\)/);
  assert.match(files['app-core.js'], /notificationPaging\.reset\(notificationPage\)/);
  assert.match(files['app-core.js'], /window\.SynthaNotificationController = notificationPaging/);
  assert.match(files['dom-2.js'], /SynthaNotificationController\?\.reset/);
  assert.match(files['views-2.js'], /SynthaNotificationController/);
  assert.match(files['views-2.js'], /paging\.loadNext\(\)/);
});

test('mark-read applies the returned server entity locally and renders the notification body', () => {
  assert.match(files['views-4.js'], /const updated = await mutate\(`/);
  assert.match(files['views-4.js'], /SynthaNotificationController\.applyUpdated\(updated\)/);
  assert.match(files['views-4.js'], /item\.body \|\| item\.message/);
  assert.doesNotMatch(files['views-4.js'], /notifications\/.+\/read.+actionButton/s);
});

test('notification page controller rejects cursor and count corruption', () => {
  assert.match(files['notification-pagination.js'], /NOTIFICATION_CURSOR_LOOP/);
  assert.match(files['notification-pagination.js'], /NOTIFICATION_COUNT_INVALID/);
  assert.match(files['notification-pagination.js'], /cannot continue without records/);
  assert.match(files['notification-pagination.js'], /AbortController/);
});
