import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Final Quality runtime loads after Production Execution and inherits the ODS visual build', async () => {
  const html = await read('public/index.html');
  assert.match(html, /<meta name="syntha-build" content="visual-20260805-14">/);
  assert.match(html, /<meta name="syntha-design-system" content="omnidata-design-system-v1">/);
  assert.doesNotMatch(html, /\/final-quality\.css/);
  assert.match(html, /\/ui\/final-quality-core\.js\?v=industrial-20260805-1/);
  assert.match(html, /\/ui\/final-quality\.js\?v=industrial-20260805-1/);
  assert.ok(html.indexOf('/ui/production-execution-core.js') < html.indexOf('/ui/final-quality-core.js'));
  assert.ok(html.indexOf('/ui/production-executions.js') < html.indexOf('/ui/final-quality.js'));
  const styles = [...html.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((match) => new URL(match[1], 'http://syntha.local').pathname);
  assert.equal(styles.at(-1), '/omnidata-v14-role-system.css');
});

test('Final Quality core exposes lifecycle actions and risk summaries', async () => {
  const source = await read('public/modules/final-quality-core.js');
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const core = context.window.SynthaFinalQualityCore;
  assert.deepEqual([...core.allowedActions({ status: 'planned' }, { canManage: true, canApprove: true })], ['start','cancel']);
  assert.deepEqual([...core.allowedActions({ status: 'review-pending' }, { canManage: true, canApprove: false })], []);
  assert.deepEqual([...core.allowedActions({ status: 'review-pending' }, { canApprove: true })], ['review']);
  assert.deepEqual([...core.allowedActions({ status: 'rework-required' }, { canManage: true, canApprove: true })], ['reinspect','cancel']);
  const values = [
    { inspectionCode: 'QCI-1', status: 'rework-required', runs: [{ recommendation: 'rework' }] },
    { inspectionCode: 'QCI-2', status: 'released', shipmentRelease: { releaseCode: 'REL-2' }, runs: [{ recommendation: 'pass' }] },
  ];
  assert.equal(core.summarize(values).released, 1);
  assert.equal(core.summarize(values).rework, 1);
  assert.deepEqual(core.filter(values, { risk: 'risk' }).map((value) => value.inspectionCode), ['QCI-1']);
  assert.deepEqual(core.filter(values, { search: 'rel-2' }).map((value) => value.inspectionCode), ['QCI-2']);
});

test('Final Quality workspace is bilingual, covers every mutation path and maps to shared ODS semantics', async () => {
  const [workspace, capabilities, odsRuntime] = await Promise.all([
    read('public/modules/final-quality.js'), read('public/modules/ui-capabilities.js'), read('public/modules/omnidata-v14-role-system.js'),
  ]);
  assert.doesNotThrow(() => new Function(workspace));
  for (const capability of ['QUALITY_READ','QUALITY_MANAGE','QUALITY_APPROVE']) assert.match(capabilities, new RegExp(`${capability}: 'quality\\.`));
  for (const path of ['from-execution','/complete-run','/review','/cancel']) assert.match(workspace, new RegExp(path.replace('/', '\\/')));
  assert.match(workspace, /reinspection \? 'reinspect' : 'start'/);
  assert.match(workspace, /Финальный контроль качества/);
  assert.match(workspace, /Final Quality/);
  assert.match(workspace, /Разрешить отгрузку/);
  assert.match(workspace, /Release shipment/);
  for (const mapping of [
    "'final-quality-header':'page-header'",
    "'final-quality-kpis':'metrics'",
    "'final-quality-layout':'master-detail'",
    "'final-quality-filters':'filterbar'",
    "'final-quality-registry':'table-wrap'",
    "'final-quality-table':'table'",
    "'final-quality-inspector':'inspector'",
    "'final-quality-badge':'status'",
    "'final-quality-error':'alert'",
  ]) assert.ok(odsRuntime.includes(mapping), mapping);
  assert.match(odsRuntime, /dataset\.odsTone/);
  assert.match(odsRuntime, /released|rejected|rework|required/);
});
