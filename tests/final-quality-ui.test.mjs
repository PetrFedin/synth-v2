import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Final Quality assets load after Production Execution without changing the visual build', async () => {
  const html = await read('public/index.html');
  assert.match(html, /<meta name="syntha-build" content="visual-20260805-14">/);
  assert.match(html, /\/final-quality\.css\?v=industrial-20260805-1/);
  assert.match(html, /\/ui\/final-quality-core\.js\?v=industrial-20260805-1/);
  assert.match(html, /\/ui\/final-quality\.js\?v=industrial-20260805-1/);
  assert.ok(html.indexOf('/ui/production-execution-core.js') < html.indexOf('/ui/final-quality-core.js'));
  assert.ok(html.indexOf('/ui/production-executions.js') < html.indexOf('/ui/final-quality.js'));
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

test('Final Quality workspace is bilingual and covers every mutation path', async () => {
  const [workspace, capabilities, css] = await Promise.all([
    read('public/modules/final-quality.js'), read('public/modules/ui-capabilities.js'), read('public/final-quality.css'),
  ]);
  assert.doesNotThrow(() => new Function(workspace));
  for (const capability of ['QUALITY_READ','QUALITY_MANAGE','QUALITY_APPROVE']) assert.match(capabilities, new RegExp(`${capability}: 'quality\\.`));
  for (const path of ['from-execution','/complete-run','/review','/reinspect','/cancel']) assert.match(workspace, new RegExp(path.replace('/', '\\/')));
  assert.match(workspace, /reinspection \? 'reinspect' : 'start'/);
  assert.match(workspace, /Финальный контроль качества/);
  assert.match(workspace, /Final Quality/);
  assert.match(workspace, /Разрешить отгрузку/);
  assert.match(workspace, /Release shipment/);
  assert.match(css, /\.final-quality-layout/);
  assert.match(css, /\.final-quality-badge\.released/);
});
