(function installMeasurementRevisionActions(root) {
  'use strict';

  const caps = root.SynthaUiCapabilities;
  const ui = root.SynthaMeasurementWorkspace;
  if (!caps || !ui) throw new Error('Measurement revision actions require capabilities and Measurement workspace');

  const operation = { busySku: null };
  function text(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }
  function selectedChart() { return ui.items.find((item) => item.sku === ui.selectedSku) || null; }
  function canRevise(chart) {
    return chart?.status === 'published' && caps.hasForOrganisation(state.workspace, chart.brandId, caps.CAPABILITIES.MEASUREMENT_MANAGE);
  }
  function buildEditablePayload(chart) {
    return Object.freeze({
      expectedVersion: chart.version,
      unit: chart.unit,
      baseSizeCode: chart.baseSizeCode,
      sizes: chart.sizes.map((size) => Object.freeze({ code: size.code, label: size.label })),
      points: chart.points.map((point) => Object.freeze({
        pointCode: point.pointCode,
        name: point.name,
        description: point.description,
        toleranceMinus: point.toleranceMinus,
        tolerancePlus: point.tolerancePlus,
        measurements: point.measurements.map((measurement) => Object.freeze({ sizeCode: measurement.sizeCode, value: measurement.value })),
      })),
      notes: chart.notes,
    });
  }
  function replaceChart(chart) {
    const bySku = new Map(ui.items.map((item) => [item.sku, item]));
    bySku.set(chart.sku, chart);
    ui.items = [...bySku.values()].sort((left, right) => String(left.sku).localeCompare(String(right.sku)));
    ui.selectedSku = chart.sku;
  }
  function invalidateRegistry() {
    ui.items = [];
    ui.nextCursor = null;
    ui.loaded = false;
    ui.loading = false;
    ui.error = '';
    ui.generation += 1;
  }
  async function startRevision(chart) {
    if (!canRevise(chart) || operation.busySku) return;
    if (!confirm(text(`Создать новую ревизию таблицы ${chart.sku}? Опубликованная версия будет сохранена в архиве.`, `Start a new revision for ${chart.sku}? The published version will be preserved in the archive.`))) return;
    operation.busySku = chart.sku;
    renderApp();
    try {
      const revised = await mutate(`/v2/measurements/${encodeURIComponent(chart.sku)}`, buildEditablePayload(chart), 'PATCH');
      replaceChart(revised);
      toast(text('Новая draft-ревизия создана. Опубликованный snapshot сохранён.', 'A new draft revision was created and the published snapshot was preserved.'));
    } catch (error) {
      if (error?.code === 'MEASUREMENT_CONCURRENCY_CONFLICT') invalidateRegistry();
      toast(error?.message || 'MEASUREMENT_REVISION_FAILED', 'error');
    } finally {
      operation.busySku = null;
      renderApp();
    }
  }
  function injectAction() {
    if (state.view !== 'measurements') return;
    const chart = selectedChart();
    if (!canRevise(chart)) return;
    const actions = document.querySelector('.measurement-inspector-actions');
    if (!actions || actions.querySelector('[data-measurement-revise]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.dataset.measurementRevise = chart.sku;
    button.disabled = operation.busySku === chart.sku;
    button.textContent = operation.busySku === chart.sku ? text('Создание ревизии…', 'Starting revision…') : text('Создать ревизию', 'Start revision');
    button.addEventListener('click', () => { void startRevision(chart); });
    actions.append(button);
  }

  const previousRenderApp = renderApp;
  renderApp = (...args) => {
    const result = previousRenderApp(...args);
    queueMicrotask(injectAction);
    return result;
  };

  root.SynthaMeasurementRevisionActions = Object.freeze({ buildEditablePayload });
})(window);
