import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinalQualityService } from '../src/application/final-quality-service.mjs';

const readyExecution = Object.freeze({
  id: 'execution-1', executionCode: 'EXEC-PO-QUALITY-1', productionOrderNumber: 'PO-QUALITY-1',
  productionOrderVersion: 3, brandId: 'brand-1', supplierCode: 'FACTORY-1', sku: 'SKU-1', quantity: 100,
  version: 10, status: 'ready-for-qc', readyForQcAt: '2026-08-20T10:00:00.000Z',
  sourceSnapshot: Object.freeze({ techPackCode: 'TP-QUALITY-1-R01', techPackVersion: 3 }),
  milestones: Object.freeze(Array.from({ length: 6 }, (_, index) => Object.freeze({ code: `M${index + 1}`, status: 'completed' }))),
});

function fixture() {
  // `bom` и `lotIssues` — прослеживаемость до рулона: выпуск на отгрузку спрашивает, из каких партий
  // материала сшита партия товара. По умолчанию опубликованной ведомости нет, и судить не о чем, —
  // проверки, где она есть, задают её сами.
  const state = { inspection: null, commands: new Map(), outbox: [], releases: [], plans: demoPlans(), defectTypes: [], bom: null, lotIssues: [] };
  const memberships = new Map([
    ['brand-1:owner', { organisationId: 'brand-1', organisationType: 'brand', userId: 'owner', role: 'owner', status: 'active' }],
    ['brand-1:admin', { organisationId: 'brand-1', organisationType: 'brand', userId: 'admin', role: 'admin', status: 'active' }],
    ['brand-1:sales', { organisationId: 'brand-1', organisationType: 'brand', userId: 'sales', role: 'sales', status: 'active' }],
    // Контроль ведёт качество, а не продажи: тот, кто продаёт партию, не подписывает её годность.
    // Раньше эти тесты гоняли инспекцию от имени продаж и тем закрепляли отсутствие разделения
    // обязанностей — то самое, о котором аудитор спрашивает первым.
    ['brand-1:quality', { organisationId: 'brand-1', organisationType: 'brand', userId: 'quality', role: 'quality', status: 'active' }],
    ['brand-1:finance', { organisationId: 'brand-1', organisationType: 'brand', userId: 'finance', role: 'finance', status: 'active' }],
  ]);
  const tx = {
    getMembership: async (organisationId, userId) => memberships.get(`${organisationId}:${userId}`),
    getExecutionByCode: async (code) => code === readyExecution.executionCode ? readyExecution : null,
    getInspectionByCode: async (code) => state.inspection?.inspectionCode === code ? state.inspection : null,
    getInspectionByExecutionCode: async (code) => state.inspection?.executionCode === code ? state.inspection : null,
    insertInspection: async (value) => { state.inspection = value; },
    saveInspection: async (value, expectedVersion) => { assert.equal(value.version, expectedVersion + 1); state.inspection = value; },
    insertShipmentRelease: async (value) => { state.releases.push(value); },
    getCommand: async (id) => state.commands.get(id),
    insertCommand: async (value) => { state.commands.set(value.id, value); },
    appendOutbox: async (event) => { state.outbox.push(event); },
    listDefectTypes: async (brandId) => state.defectTypes.filter((type) => type.brandId === brandId),
    getPublishedBomForSku: async () => state.bom,
    listMaterialLotIssuesForExecution: async () => state.lotIssues,
    // The rows a brand holds. The lot in this fixture is 100 pieces, so the 91–150 range is the one
    // a run resolves to; the wider ranges are here so that resolving is a choice and not the only
    // row present.
    listSamplingPlans: async (brandId, standardCode, inspectionLevel) => state.plans
      .filter((plan) => plan.brandId === brandId && plan.standardCode === standardCode && plan.inspectionLevel === inspectionLevel),
  };
  let tick = 0; let id = 0;
  const clock = () => new Date(Date.parse('2026-08-20T10:01:00.000Z') + tick++ * 60_000).toISOString();
  const nextId = (prefix) => `${prefix}_${++id}`;
  return { state, service: createFinalQualityService({ store: { transaction: (work) => work(tx) }, clock, nextId }) };
}

// A plan set shaped like a real one: the sample follows the lot and the level, the looser limit
// tolerates more from that same sample, and rejection is acceptance plus one.
function demoPlans() {
  const rows = [[51, 90, 13, 0, 1], [91, 150, 20, 1, 2], [151, 280, 32, 2, 3]];
  return rows.flatMap(([lotFrom, lotTo, sampleSize, major, minor]) => [[2.5, major], [4, minor]]
    .map(([aql, acceptAt]) => ({ brandId: 'brand-1', standardCode: 'DEMO-AQL-2026', inspectionLevel: 'II', aql, lotFrom, lotTo, sampleSize, acceptAt, rejectAt: acceptAt + 1 })));
}

async function completePassingRun(service, actorId = 'quality') {
  let inspection = await service.createFromExecution(`quality-create-${actorId}`, actorId, readyExecution.executionCode);
  inspection = await service.start(`quality-start-${actorId}`, actorId, inspection.inspectionCode, {
    expectedVersion: inspection.version, inspectorName: 'Factory Quality Inspector', sampleSize: 20,
    allowedMajorDefects: 1, allowedMinorDefects: 2,
  });
  return service.completeRun(`quality-complete-${actorId}`, actorId, inspection.inspectionCode, {
    expectedVersion: inspection.version, inspectedQuantity: 20, defects: [], measurementFailures: [],
    checkpoints: [{ checkpointCode: 'WORKMANSHIP', name: 'Workmanship', result: 'pass', severity: null, notes: 'Accepted' }],
    evidenceReferences: ['evidence://quality/pass'], notes: 'Inspection sample accepted',
  });
}

test('Final Quality separates execution from approval and creates release atomically', async () => {
  const { state, service } = fixture();
  let inspection = await service.createFromExecution('quality-create', 'quality', readyExecution.executionCode);
  assert.equal(inspection.status, 'planned');
  const replay = await service.createFromExecution('quality-create', 'quality', readyExecution.executionCode);
  assert.deepEqual(replay, inspection);
  assert.equal(state.outbox.length, 1);

  inspection = await service.start('quality-start', 'quality', inspection.inspectionCode, {
    expectedVersion: inspection.version, inspectorName: 'Factory Quality Inspector', sampleSize: 20,
    allowedMajorDefects: 1, allowedMinorDefects: 2,
  });
  inspection = await service.completeRun('quality-complete', 'quality', inspection.inspectionCode, {
    expectedVersion: inspection.version, inspectedQuantity: 20, defects: [], measurementFailures: [],
    checkpoints: [{ checkpointCode: 'WORKMANSHIP', name: 'Workmanship', result: 'pass', severity: null, notes: 'Accepted' }],
    evidenceReferences: ['evidence://quality/pass'], notes: 'Inspection sample accepted',
  });
  // Выпускает тот, у кого есть право подписи. Продажи его не имеют — и именно поэтому стоят здесь:
  // проверяется отказ по правам, а не самоутверждение.
  await assert.rejects(() => service.review('quality-review-denied', 'sales', inspection.inspectionCode, {
    expectedVersion: inspection.version, decision: 'release', releaseCode: 'SHIP-REL-QUALITY-1', notes: 'Release requested by non-approver',
  }), { code: 'CAPABILITY_DENIED' });
  assert.equal(state.releases.length, 0);

  inspection = await service.review('quality-review-release', 'owner', inspection.inspectionCode, {
    expectedVersion: inspection.version, decision: 'release', releaseCode: 'SHIP-REL-QUALITY-1', notes: 'Final Quality approved shipment release',
  });
  assert.equal(inspection.status, 'released');
  assert.equal(state.releases.length, 1);
  assert.equal(state.releases[0].releaseCode, 'SHIP-REL-QUALITY-1');
  assert.equal(state.outbox.at(-1).type, 'final-quality.shipment-released');
  assert.equal(state.commands.size, 4);
});

test('Final Quality forbids an approver from reviewing a run they inspected or completed', async () => {
  const { state, service } = fixture();
  const inspection = await completePassingRun(service, 'owner');

  await assert.rejects(() => service.review('quality-self-review', 'owner', inspection.inspectionCode, {
    expectedVersion: inspection.version,
    decision: 'release',
    releaseCode: 'SHIP-REL-SELF-1',
    notes: 'This self approval must never be accepted',
  }), { code: 'QUALITY_SELF_APPROVAL_FORBIDDEN' });
  assert.equal(state.inspection.status, 'review-pending');
  assert.equal(state.releases.length, 0);

  const released = await service.review('quality-independent-review', 'admin', inspection.inspectionCode, {
    expectedVersion: inspection.version,
    decision: 'release',
    releaseCode: 'SHIP-REL-INDEPENDENT-1',
    notes: 'Independent quality approver accepted the lot',
  });
  assert.equal(released.status, 'released');
  assert.equal(released.shipmentRelease.releasedBy, 'admin');
});

test('Finance can read but cannot mutate Final Quality', async () => {
  const { service } = fixture();
  await assert.rejects(() => service.createFromExecution('finance-create', 'finance', readyExecution.executionCode), { code: 'CAPABILITY_DENIED' });
});
test('A run records which criterion judged the lot, not three numbers somebody typed', async () => {
  const { service } = fixture();
  let inspection = await service.createFromExecution('aql-create', 'quality', readyExecution.executionCode);
  inspection = await service.start('aql-start', 'quality', inspection.inspectionCode, {
    expectedVersion: inspection.version, inspectorName: 'Factory Quality Inspector',
    standardCode: 'DEMO-AQL-2026', inspectionLevel: 'II', aqlMajor: 2.5, aqlMinor: 4,
  });
  const plan = inspection.runs.at(-1).samplingPlan;
  // The lot is 100 pieces, so the 91–150 row applies: twenty inspected, accepted at one major and
  // at two minor. Nobody chose those numbers at the moment of inspecting.
  assert.equal(plan.source, 'standard');
  assert.equal(plan.standardCode, 'DEMO-AQL-2026');
  assert.equal(plan.inspectionLevel, 'II');
  assert.deepEqual([plan.lotSize, plan.sampleSize], [100, 20]);
  assert.deepEqual([plan.allowedMajorDefects, plan.allowedMinorDefects], [1, 2]);
  assert.deepEqual([plan.rejectMajorAt, plan.rejectMinorAt], [2, 3]);
  assert.deepEqual([plan.aqlMajor, plan.aqlMinor], [2.5, 4]);

  // And the decision follows that plan: two major defects is the rejection number, not a judgement
  // call made afterwards.
  const completed = await service.completeRun('aql-complete', 'quality', inspection.inspectionCode, {
    expectedVersion: inspection.version, inspectedQuantity: 20,
    defects: [{ defectCode: 'SEAM-OPEN', severity: 'major', category: 'Пошив', description: 'Разошёлся боковой шов', quantity: 2, evidenceReferences: ['evidence://quality/seam'] }],
    measurementFailures: [], checkpoints: [{ checkpointCode: 'WORKMANSHIP', name: 'Workmanship', result: 'pass', severity: null, notes: 'Остальное в норме' }],
    evidenceReferences: ['evidence://quality/run'], notes: 'Две значительные несоответствия на выборке',
  });
  assert.equal(completed.runs.at(-1).recommendation, 'rework');
});

test('A run that names a standard nobody loaded is refused rather than judged by something else', async () => {
  const { service } = fixture();
  const inspection = await service.createFromExecution('aql-missing-create', 'quality', readyExecution.executionCode);
  await assert.rejects(() => service.start('aql-missing-start', 'quality', inspection.inspectionCode, {
    expectedVersion: inspection.version, inspectorName: 'Factory Quality Inspector',
    standardCode: 'GOST-R-ISO-2859-1', inspectionLevel: 'II', aqlMajor: 2.5, aqlMinor: 4,
  }), { code: 'QUALITY_SAMPLING_PLAN_SET_MISSING' });

  // A level the brand holds no rows for is the same kind of refusal, and must not quietly fall back
  // to the level that does exist.
  await assert.rejects(() => service.start('aql-level-start', 'quality', inspection.inspectionCode, {
    expectedVersion: inspection.version, inspectorName: 'Factory Quality Inspector',
    standardCode: 'DEMO-AQL-2026', inspectionLevel: 'III', aqlMajor: 2.5, aqlMinor: 4,
  }), { code: 'QUALITY_SAMPLING_PLAN_SET_MISSING' });
});

test('A plan agreed with one factory is allowed, and says so', async () => {
  const { service } = fixture();
  let inspection = await service.createFromExecution('aql-agreed-create', 'quality', readyExecution.executionCode);
  inspection = await service.start('aql-agreed-start', 'quality', inspection.inspectionCode, {
    expectedVersion: inspection.version, inspectorName: 'Factory Quality Inspector',
    sampleSize: 25, allowedMajorDefects: 1, allowedMinorDefects: 3,
    samplingNote: 'Согласовано с фабрикой на сезон SS27',
  });
  const plan = inspection.runs.at(-1).samplingPlan;
  assert.equal(plan.source, 'agreed');
  assert.equal(plan.standardCode, null, 'a bespoke plan does not borrow the name of a standard');
  assert.equal(plan.note, 'Согласовано с фабрикой на сезон SS27');
  assert.deepEqual([plan.rejectMajorAt, plan.rejectMinorAt], [2, 4]);

  // Even agreed, it has to be a plan: tolerating major defects more readily than minor ones is not
  // a bespoke arrangement, it is upside down.
  const inverted = fixture();
  const second = await inverted.service.createFromExecution('aql-agreed-create-2', 'owner', readyExecution.executionCode);
  await assert.rejects(() => inverted.service.start('aql-inverted-start', 'owner', second.inspectionCode, {
    expectedVersion: second.version, inspectorName: 'Factory Quality Inspector',
    sampleSize: 25, allowedMajorDefects: 4, allowedMinorDefects: 1,
  }), { code: 'QUALITY_SAMPLING_PLAN_LIMITS_INVERTED' });
});

test('One defect code cannot mean two things', async () => {
  const { state, service } = fixture();
  // The brand has registered this fault as major. An inspection that calls the same code minor is
  // not a difference of opinion, it is a code that cannot be counted.
  state.defectTypes.push({ id: 'defect-type_SEAM-OPEN', brandId: 'brand-1', code: 'SEAM-OPEN', severity: 'major', status: 'active' });
  let inspection = await service.createFromExecution('cat-create', 'quality', readyExecution.executionCode);
  inspection = await service.start('cat-start', 'quality', inspection.inspectionCode, {
    expectedVersion: inspection.version, inspectorName: 'Factory Quality Inspector', sampleSize: 20, allowedMajorDefects: 1, allowedMinorDefects: 2,
  });
  const defect = (severity) => ([{ defectCode: 'SEAM-OPEN', severity, category: 'Пошив', description: 'Разошёлся шов', quantity: 1, evidenceReferences: ['evidence://q/1'] }]);
  await assert.rejects(() => service.completeRun('cat-bad', 'quality', inspection.inspectionCode, {
    expectedVersion: inspection.version, inspectedQuantity: 20, defects: defect('minor'), measurementFailures: [],
    checkpoints: [{ checkpointCode: 'WORKMANSHIP', name: 'Workmanship', result: 'pass', severity: null, notes: 'ok' }],
    evidenceReferences: ['evidence://q/run'], notes: 'Одно несоответствие',
  }), { code: 'QUALITY_DEFECT_SEVERITY_DISAGREES_WITH_CATALOGUE' });

  // Agreeing with the catalogue passes, and so does a code the brand has not registered: a brand
  // without a catalogue must still be able to inspect.
  const completed = await service.completeRun('cat-good', 'quality', inspection.inspectionCode, {
    expectedVersion: inspection.version, inspectedQuantity: 20,
    defects: [...defect('major'), { defectCode: 'NOT-IN-CATALOGUE', severity: 'minor', category: 'Прочее', description: 'Пока не в каталоге', quantity: 1, evidenceReferences: ['evidence://q/2'] }],
    measurementFailures: [], checkpoints: [{ checkpointCode: 'WORKMANSHIP', name: 'Workmanship', result: 'pass', severity: null, notes: 'ok' }],
    evidenceReferences: ['evidence://q/run'], notes: 'Два несоответствия',
  });
  assert.equal(completed.runs.at(-1).defectCounts.major, 1);
});

test('a shipment is not released while the rolls it was made from are unknown', async () => {
  // Прослеживаемость до рулона. Шесть отгрузок на 4800 штук были выпущены при нуле выдач материала:
  // учёт партий вёлся и ни на что не влиял. Ответ «из каких рулонов» собирается до отгрузки — после
  // неё собирать не из чего.
  const { state, service } = fixture();
  state.bom = { lines: [{ materialCode: 'MAT-SHELL-R5' }] };
  state.lotIssues = [];
  let inspection = await completePassingRun(service, 'quality');
  await assert.rejects(
    () => service.review('quality-review-trace', 'owner', inspection.inspectionCode, {
      expectedVersion: inspection.version, decision: 'release', releaseCode: 'REL-TRACE-1', notes: 'Годна',
    }),
    (error) => error.code === 'QUALITY_RELEASE_WITHOUT_MATERIAL_TRACE',
  );
  // Отказ не оставляет наполовину выпущенную отгрузку.
  assert.equal(state.releases.length, 0);
  assert.equal(state.inspection.status, 'review-pending');

  state.lotIssues = [{ lotReference: 'ROLL-R3-A-001' }];
  inspection = await service.review('quality-review-trace-2', 'owner', state.inspection.inspectionCode, {
    expectedVersion: state.inspection.version, decision: 'release', releaseCode: 'REL-TRACE-1', notes: 'Годна',
  });
  assert.equal(inspection.status, 'released');
  assert.equal(state.releases.length, 1);
});
