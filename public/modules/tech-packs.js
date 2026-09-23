(function installTechPacksWorkspace(global) {
  'use strict';

  const core = global.SynthaTechPackCore;
  const caps = global.SynthaUiCapabilities;
  if (!core) throw new Error('SynthaTechPackCore must load before tech-packs.js');
  if (!caps) throw new Error('SynthaUiCapabilities must load before tech-packs.js');

  const ui = global.SynthaTechPacksWorkspace || (global.SynthaTechPacksWorkspace = {
    items: [], loaded: false, loading: false, error: '', selectedCode: null, status: 'all', readiness: 'all', search: '', busyCode: null, generation: 0, document: null, documentLoading: false,
    // Технологическая последовательность описывает изделие, а техпак её печатает — поэтому она
    // читается по SKU выбранного пакета, а не хранится в нём второй раз.
    sequenceBySku: {}, sequenceLoading: '',
  });
  const STATUSES = ['draft', 'issued', 'acknowledged', 'superseded', 'withdrawn'];

  function text(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }
  function h(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'disabled') node.disabled = Boolean(value);
      else if (key === 'checked') node.checked = Boolean(value);
      else if (key === 'value') node.value = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, String(value));
    }
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child === undefined || child === null) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }
  function labelStatus(status) {
    const labels = { draft: ['Черновик', 'Draft'], issued: ['Выпущен', 'Issued'], acknowledged: ['Подтверждён фабрикой', 'Supplier acknowledged'], superseded: ['Заменён редакцией', 'Superseded'], withdrawn: ['Отозван', 'Withdrawn'] };
    return text(...(labels[status] || [status, status]));
  }
  function date(value) { if (!value) return '—'; const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(I18N.localeTag(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsed) : '—'; }
  function badge(value, tone = 'neutral') { return h('span', { className: `tech-pack-badge tech-pack-${tone}`, text: value }); }
  function can(brandId, capability) { return caps.hasForOrganisation(state.workspace, brandId, capability); }
  function canManageAny() { return caps.hasAny(state.workspace, caps.CAPABILITIES.TECH_PACK_MANAGE, 'brand'); }
  function catalog() { return Array.isArray(state.workspace?.catalogSkus) ? state.workspace.catalogSkus : []; }
  function manageableCatalog() { return catalog().filter((sku) => can(sku.brandId, caps.CAPABILITIES.TECH_PACK_MANAGE)); }

  function reset() { ui.items = []; ui.loaded = false; ui.error = ''; ui.selectedCode = null; ui.generation += 1; }
  async function fetchAll(request = api) {
    const byCode = new Map();
    const seen = new Set();
    let cursor = null;
    for (let page = 1; page <= 500; page += 1) {
      const query = new URLSearchParams({ limit: '200' });
      if (cursor) query.set('cursor', cursor);
      const result = await request(`/v2/tech-packs?${query.toString()}`);
      if (!result || !Array.isArray(result.items)) throw new Error('TECH_PACK_PAGE_INVALID');
      for (const value of result.items) {
        if (!value || typeof value.techPackCode !== 'string') throw new Error('TECH_PACK_ITEM_INVALID');
        byCode.set(value.techPackCode, value);
      }
      const next = result.nextCursor || null;
      if (!next) return Object.freeze([...byCode.values()]);
      if (seen.has(next)) throw new Error('TECH_PACK_CURSOR_CYCLE');
      seen.add(next); cursor = next;
    }
    throw new Error('TECH_PACK_PAGE_LIMIT_EXCEEDED');
  }
  async function load({ reset: shouldReset = false } = {}) {
    if (ui.loading) return;
    if (shouldReset) reset();
    ui.loading = true; ui.error = '';
    const generation = ui.generation;
    try {
      const items = await fetchAll();
      if (generation !== ui.generation) return;
      ui.items = [...items].sort((a, b) => String(a.techPackCode).localeCompare(String(b.techPackCode)));
      ui.loaded = true;
      if (!ui.selectedCode && ui.items.length) ui.selectedCode = ui.items[0].techPackCode;
    } catch (error) {
      if (generation === ui.generation) ui.error = error?.message || I18N.t('common.requestError');
    } finally {
      if (generation === ui.generation) ui.loading = false;
      if (state.view === 'tech-packs') renderApp();
    }
  }
  // See materials.js: retrying a failed load from render starves the event loop.
  function ensureLoaded() { if (!ui.loaded && !ui.loading && !ui.error) queueMicrotask(() => { void load({ reset: true }); }); }
  function upsert(value) {
    const map = new Map(ui.items.map((item) => [item.techPackCode, item]));
    map.set(value.techPackCode, value);
    ui.items = [...map.values()].sort((a, b) => String(a.techPackCode).localeCompare(String(b.techPackCode)));
    ui.selectedCode = value.techPackCode;
  }
  function selected() { return ui.items.find((value) => value.techPackCode === ui.selectedCode) || ui.items[0] || null; }
  async function command(value, path, body, method = 'POST') {
    if (ui.busyCode) return null;
    ui.busyCode = value?.techPackCode || 'new'; renderApp();
    try {
      const result = await mutate(path, body, method);
      upsert(result); toast(text('Изменения сохранены.', 'Changes saved.')); return result;
    } catch (error) {
      if (error?.code === 'TECH_PACK_CONCURRENCY_CONFLICT') queueMicrotask(() => { void load({ reset: true }); });
      toast(error?.message || I18N.t('common.requestError'), 'error'); return null;
    } finally { ui.busyCode = null; renderApp(); }
  }

  function metric(label, value, detail) { return h('article', { className: 'tech-pack-kpi' }, [h('span', { text: label }), h('strong', { text: value }), h('small', { text: detail })]); }
  function header(summary) {
    return h('header', { className: 'tech-pack-header' }, [
      h('div', {}, [h('p', { className: 'eyebrow', text: 'PLM / TECH PACK CONTROL' }), h('h1', { text: text('Технические пакеты', 'Tech Packs') }), h('p', { className: 'muted', text: text('Версионный производственный контракт: выпуск, подтверждение фабрики и допуск к размещению производства.', 'Versioned production contract: issue, supplier acknowledgement and production-allocation readiness.') })]),
      h('div', { className: 'tech-pack-header-actions' }, [canManageAny() ? h('button', { type: 'button', className: 'primary', text: text('Создать техпак', 'Create Tech Pack'), onclick: () => openDraft(null) }) : null, h('button', { type: 'button', className: 'secondary', disabled: ui.loading, text: text('Обновить', 'Refresh'), onclick: () => { load({ reset: true }).then(() => toast(text('\u0414\u0430\u043d\u043d\u044b\u0435 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u044b.', 'Data refreshed.'))).catch((error) => toast(error?.message || text('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435.', 'The data could not be refreshed.'), 'error')); } })]),
      h('section', { className: 'tech-pack-kpis' }, [
        metric(text('Всего', 'Total'), summary.total, text('Все редакции', 'All revisions')),
        metric(text('Выпущено', 'Issued'), summary.issued, text('Ждут фабрику', 'Awaiting supplier')),
        metric(text('Готово', 'Ready'), summary.ready, text('Допуск к размещению производства', 'Allocation allowed')),
        metric(text('Заблокировано', 'Blocked'), summary.blocked, text('Нет подтверждения', 'Not acknowledged')),
      ]),
    ]);
  }
  function filters() {
    const status = h('select', { onchange: (event) => { ui.status = event.target.value; renderApp(); } }, [h('option', { value: 'all', text: text('Все статусы', 'All statuses') }), ...STATUSES.map((value) => h('option', { value, text: labelStatus(value) }))]); status.value = ui.status;
    const readiness = h('select', { onchange: (event) => { ui.readiness = event.target.value; renderApp(); } }, [h('option', { value: 'all', text: text('Любой допуск', 'All readiness') }), h('option', { value: 'ready', text: text('Готово к производству', 'Production ready') }), h('option', { value: 'blocked', text: text('Заблокировано', 'Blocked') })]); readiness.value = ui.readiness;
    return h('div', { className: 'tech-pack-filters' }, [h('input', { type: 'search', value: ui.search, placeholder: text('Код, SKU, фабрика…', 'Code, SKU, supplier…'), oninput: (event) => { ui.search = event.target.value; renderApp(); } }), status, readiness]);
  }
  function registry(items) {
    const rows = items.map((value) => {
      const ready = core.isProductionReady(value);
      const row = h('tr', { className: ui.selectedCode === value.techPackCode ? 'selected' : '', tabindex: '0' }, [
        h('td', {}, [h('strong', { text: value.techPackCode }), h('small', { text: value.title })]), h('td', { text: value.sku }), h('td', { text: `R${value.revision}` }),
        h('td', {}, [badge(labelStatus(value.status), ready ? 'ok' : value.status === 'withdrawn' ? 'neutral' : 'medium')]), h('td', { text: value.supplierName || '—' }),
        h('td', {}, [ready ? badge(text('Допущен', 'Ready'), 'ok') : badge(text('Стоп', 'Blocked'), 'high')]), h('td', { text: date(value.updatedAt) }),
      ]);
      const choose = () => { ui.selectedCode = value.techPackCode; renderApp(); };
      row.addEventListener('click', choose); row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
      return row;
    });
    if (!rows.length) rows.push(h('tr', {}, [h('td', { colspan: '7', className: 'tech-pack-empty', text: ui.loading ? text('Загрузка…', 'Loading…') : text('Нет техпаков для выбранных фильтров.', 'No Tech Packs match the filters.') })]));
    return h('div', { className: 'tech-pack-table-wrap' }, [h('table', { className: 'tech-pack-table' }, [h('thead', {}, [h('tr', {}, [text('Техпак', 'Tech Pack'), 'SKU', text('Редакция', 'Revision'), text('Статус', 'Status'), text('Фабрика', 'Supplier'), text('Допуск', 'Readiness'), text('Обновлён', 'Updated')].map((item) => h('th', { text: item })))]), h('tbody', {}, rows)])]);
  }
  function pair(label, value) { return h('div', {}, [h('dt', { text: label }), h('dd', { text: value ?? '—' })]); }
  // The document a factory receives. It is assembled by the read model in one go, so the pack, the
  // bill of materials, the measurement chart and the operation sequence are read at the same instant
  // and cannot contradict each other. The page is laid out for print; saving it as PDF is the
  // browser's job, because writing a PDF with Cyrillic by hand means embedding a font.
  async function openDocument(techPackCode) {
    ui.documentLoading = true;
    renderApp();
    try {
      ui.document = await api(`/v2/tech-packs/${encodeURIComponent(techPackCode)}/document`);
    } catch (error) {
      toast(error?.message || text('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0431\u0440\u0430\u0442\u044c \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442.', 'The document could not be built.'), 'error');
    } finally {
      ui.documentLoading = false;
      renderApp();
    }
  }
  // Headings carry both languages at once, the way the packs a factory actually receives do —
  // «Bill of Materials / Список материалов». A Russian technologist and a factory abroad read the
  // same printed sheet, and a document that picks one of them makes the other guess. The reader's
  // own language comes first; the other follows it.
  function bilingual(ru, en) {
    return I18N.getLocale?.() === 'en' ? `${en} / ${ru}` : `${ru} / ${en}`;
  }
  function documentSection(id, titleRu, titleEn, body) {
    return h('section', { className: 'tp-doc-section', id }, [
      h('h2', { className: 'tp-doc-h2', text: bilingual(titleRu, titleEn) }),
      body,
    ]);
  }
  // A document table that will not fit the page scrolls inside its own frame. The page itself must
  // not: a printed sheet that slides sideways under the reader is how the list of operations was
  // permanently cut off before, and a wide materials table would have brought that back.
  function documentTable(headers, rows) {
    return h('div', { className: 'tp-doc-table-wrap' }, [documentTableElement(headers, rows)]);
  }
  function documentTableElement(headers, rows) {
    return h('table', { className: 'tp-doc-table' }, [
      h('thead', {}, [h('tr', {}, headers.map((label) => h('th', { text: label })))]),
      h('tbody', {}, rows.length
        ? rows.map((row) => h('tr', {}, row.map((cell) => h('td', { text: String(cell ?? '\u2014') }))))
        : [h('tr', {}, [h('td', { colspan: String(headers.length), className: 'tp-doc-empty', text: text('\u0412 \u044d\u0442\u043e\u043c \u0440\u0430\u0437\u0434\u0435\u043b\u0435 \u043f\u043e\u043a\u0430 \u043f\u0443\u0441\u0442\u043e.', 'Nothing in this section yet.') })])]),
    ]);
  }
  // What the measurement section shows, and what it says when it shows nothing. An empty table under
  // a heading reads as "this garment has no measurements"; the three reasons it can be empty are
  // different enough that a factory has to be told which one it is.
  // «Межразмерная разница» as the chart states it: one step per interval. A rule that is the same
  // everywhere is written once; one that changes across the range is written out, because that is
  // exactly the thing a reader would otherwise have to work out from the row.
  function gradeRule(point) {
    const steps = Array.isArray(point.gradeSteps) ? point.gradeSteps : null;
    if (!steps || !steps.length) return text('вручную', 'by hand');
    const unique = [...new Set(steps.map((step) => Number(step)))];
    if (unique.length === 1) return `${unique[0] >= 0 ? '+' : ''}${unique[0]}`;
    return steps.map((step) => `${Number(step) >= 0 ? '+' : ''}${Number(step)}`).join(' / ');
  }
  function measurementCell(point, size) {
    const value = point.values?.[size.sizeCode];
    if (value === undefined || value === null) return '\u2014';
    const overrides = Array.isArray(point.overrides) ? point.overrides : [];
    return overrides.includes(size.sizeCode) ? `${value} *` : String(value);
  }
  function hasOverrides(points) {
    return points.some((point) => Array.isArray(point.overrides) && point.overrides.length > 0);
  }

  function measurementBlock(doc) {
    const points = doc.measurementPoints || [];
    if (points.length) {
      // The grade rule travels with the numbers, because a factory grading a pattern works from the
      // rule; and a cell typed over the rule is marked, because an exception nobody can see is a
      // rule nobody can trust.
      const table = documentTable(
        [text('Точка', 'Point'), text('Наименование', 'Name'), '\u2212', '+', text('Градация', 'Grade'),
          ...(doc.measurementSizes || []).map((size) => size.label)],
        points.map((point) => [point.pointCode, point.name, point.toleranceMinus, point.tolerancePlus,
          gradeRule(point),
          ...(doc.measurementSizes || []).map((size) => measurementCell(point, size))]),
      );
      const legend = hasOverrides(points)
        ? h('p', { className: 'tp-doc-note', text: text(
          '* — значение задано вручную и отличается от межразмерной разницы для этой точки.',
          '* — this value was set by hand and departs from the grade rule for its point.',
        ) })
        : null;
      if (doc.measurementSource !== 'archived') return legend ? h('div', {}, [table, legend]) : table;
      // The chart has moved on since the pack was acknowledged. The document deliberately keeps the
      // version the factory agreed to, and says so rather than letting a reader assume it is current.
      const note = h('p', { className: 'tp-doc-note', text: text(
        `Показана редакция ${doc.measurementChartVersion} — та, против которой пакет подтверждён. Таблица мер с тех пор изменилась.`,
        `Showing revision ${doc.measurementChartVersion} — the one this pack was acknowledged against. The chart has changed since.`,
      ) });
      return h('div', {}, legend ? [note, table, legend] : [note, table]);
    }
    if (!doc.measurementChartId) {
      return h('p', { className: 'tp-doc-note', text: text(
        'Таблица мер будет зафиксирована при выпуске пакета.',
        'The measurement chart is frozen when the pack is issued.',
      ) });
    }
    return h('p', { className: 'tp-doc-note tp-doc-warning', text: text(
      `Зафиксированная редакция ${doc.measurementChartVersion} таблицы мер не найдена — по этому документу шить нельзя.`,
      `The frozen measurement chart revision ${doc.measurementChartVersion} cannot be found — do not build from this document.`,
    ) });
  }

  // The materials section, and what it says when it has nothing. A document carries a bill only once
  // that bill is published — an unpublished one is still being argued about, and a factory must not
  // build from it — but an empty table under a heading says none of that.
  function materialsBlock(doc, money) {
    const lines = doc.materials || [];
    if (lines.length) {
      // The two columns a cutting room asks for and a shopping list cannot answer: which material
      // is the principal of its kind, and where on the garment each one goes.
      return documentTable(
        [text('№', 'No.'), text('Компонент', 'Component'), text('Материал', 'Material'), text('Тип', 'Type'),
          text('Осн.', 'Main'), text('Где применён', 'Placement'),
          text('Нетто', 'Net'), text('Отходы, %', 'Waste, %'), text('Брутто', 'Gross'), text('Цена за ед.', 'Unit cost')],
        lines.map((line) => [line.position, line.component, line.materialCode, line.materialType,
          line.isMain ? text('да', 'yes') : '', line.placement || '—',
          `${unitAmount(line.quantity, line.unit)}`, line.wastePercent, `${unitAmount(line.grossQuantity, line.unit)}`, money(line.unitCost)]),
      );
    }
    if (doc.bomStatus && doc.bomStatus !== 'published') {
      return h('p', { className: 'tp-doc-note', text: text(
        'Спецификация ещё в черновике. В документ она попадёт после публикации.',
        'The bill of materials is still a draft. It reaches the document once it is published.',
      ) });
    }
    return h('p', { className: 'tp-doc-note tp-doc-warning', text: text(
      'У артикула нет спецификации — по этому документу шить нельзя.',
      'This SKU has no bill of materials — do not build from this document.',
    ) });
  }

  function renderDocument(doc) {
    const en = I18N.getLocale?.() === 'en';
    const money = (value) => (value === null || value === undefined
      ? '\u2014'
      : I18N.formatMoney(value, doc.currency || 'EUR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const contents = [
      ['tp-sketch', '\u0418\u0437\u0434\u0435\u043b\u0438\u0435 \u0438 \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a', 'Product and supplier'],
      ['tp-materials', '\u0421\u043f\u0435\u0446\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u044f \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u043e\u0432', 'Bill of materials'],
      ['tp-measurements', '\u0422\u0430\u0431\u043b\u0438\u0446\u0430 \u043c\u0435\u0440', 'Measurement chart'],
      ['tp-construction', '\u041a\u043e\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u044f, \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u043e \u0438 \u0443\u043f\u0430\u043a\u043e\u0432\u043a\u0430', 'Construction, quality and packing'],
      ['tp-operations', '\u0422\u0435\u0445\u043d\u043e\u043b\u043e\u0433\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u043f\u043e\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c', 'List of operations'],
    ];
    return h('section', { className: 'tp-doc' }, [
      h('div', { className: 'tp-doc-toolbar' }, [
        h('button', { type: 'button', className: 'primary', text: text('\u041f\u0435\u0447\u0430\u0442\u044c \u0438\u043b\u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435 \u0432 PDF', 'Print or save as PDF'), onclick: () => window.print() }),
        h('button', { type: 'button', className: 'secondary', text: text('\u0417\u0430\u043a\u0440\u044b\u0442\u044c', 'Close'), onclick: () => { ui.document = null; renderApp(); } }),
      ]),
      h('article', { className: 'tp-doc-page' }, [
        h('header', { className: 'tp-doc-head' }, [
          h('p', { className: 'tp-doc-kicker', text: `${doc.techPackCode} \u00b7 ${text('\u0440\u0435\u0432\u0438\u0437\u0438\u044f', 'revision')} ${doc.revision}` }),
          h('h1', { className: 'tp-doc-h1', text: doc.title || doc.skuName || doc.sku }),
          h('p', { className: 'tp-doc-sub', text: doc.description || '' }),
        ]),
        documentTable(
          [text('\u041f\u043e\u043b\u0435', 'Field'), text('\u0417\u043d\u0430\u0447\u0435\u043d\u0438\u0435', 'Value')],
          [
            [text('\u0410\u0440\u0442\u0438\u043a\u0443\u043b', 'Article'), doc.sku],
            [text('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), statusLabel(doc.status)],
            [text('\u041f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a', 'Supplier'), `${doc.supplierName || '\u2014'} (${doc.supplierCode || '\u2014'})`],
            [text('\u041a\u043e\u043d\u0442\u0430\u043a\u0442 \u043f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\u0430', 'Supplier contact'), doc.supplierEmail],
            [text('\u0412\u044b\u043f\u0443\u0449\u0435\u043d', 'Issued'), doc.issuedAt ? formatDate(doc.issuedAt) : text('\u043d\u0435 \u0432\u044b\u043f\u0443\u0449\u0435\u043d', 'not issued')],
            [text('\u0418\u0442\u043e\u0433\u043e \u043f\u043e \u0441\u043f\u0435\u0446\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u0438', 'BOM total'), money(doc.bomTotalCost)],
            [text('\u041d\u043e\u0440\u043c\u043e\u0432\u0440\u0435\u043c\u044f, \u043c\u0438\u043d', 'Standard time, minutes'), doc.standardMinutes],
          ],
        ),
        documentSection('tp-contents', '\u041e\u0433\u043b\u0430\u0432\u043b\u0435\u043d\u0438\u0435', 'Table of contents',
          h('ol', { className: 'tp-doc-contents' }, contents.map(([, ru, enTitle]) => h('li', { text: bilingual(ru, enTitle) })))),
        documentSection('tp-materials', '\u0421\u043f\u0435\u0446\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u044f \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u043e\u0432', 'Bill of materials', materialsBlock(doc, money)),
        documentSection('tp-measurements', '\u0422\u0430\u0431\u043b\u0438\u0446\u0430 \u043c\u0435\u0440', 'Measurement chart', measurementBlock(doc)),
        documentSection('tp-construction', '\u041a\u043e\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u044f, \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u043e \u0438 \u0443\u043f\u0430\u043a\u043e\u0432\u043a\u0430', 'Construction, quality and packing',
          h('div', { className: 'tp-doc-notes' }, [
            h('h3', { text: text('\u041a\u043e\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u044f', 'Construction') }), h('p', { text: doc.constructionNotes || '\u2014' }),
            h('h3', { text: text('\u041a\u0430\u0447\u0435\u0441\u0442\u0432\u043e', 'Quality') }), h('p', { text: doc.qualityNotes || '\u2014' }),
            h('h3', { text: text('\u0423\u043f\u0430\u043a\u043e\u0432\u043a\u0430', 'Packing') }), h('p', { text: doc.packingNotes || '\u2014' }),
          ])),
        documentSection('tp-operations', '\u0422\u0435\u0445\u043d\u043e\u043b\u043e\u0433\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u043f\u043e\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c', 'List of operations', h('div', {}, [
          documentTable(
            [text('\u2116', 'No.'), text('\u041a\u043e\u0434', 'Code'), text('\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u044f', 'Operation'), text('\u041e\u0431\u043e\u0440\u0443\u0434\u043e\u0432\u0430\u043d\u0438\u0435', 'Equipment'), text('\u041a\u043b\u0430\u0441\u0441 \u043c\u0430\u0448\u0438\u043d\u044b', 'Machine class'), text('\u041c\u0438\u043d', 'Minutes')],
            (doc.operations || []).map((operation) => [operation.sequence, operation.operationCode,
              en ? operation.nameEn : operation.nameRu, operation.equipment, operation.machineClass, operation.standardMinutes])),
          h('p', { className: 'tp-doc-total', text: `${text('\u0418\u0442\u043e\u0433\u043e \u043d\u043e\u0440\u043c\u043e\u0432\u0440\u0435\u043c\u044f', 'Total standard time')}: ${doc.standardMinutes} ${text('\u043c\u0438\u043d', 'min')}` }),
        ])),
      ]),
    ]);
  }

  function inspector(value) {
    if (!value) return h('aside', { className: 'tech-pack-inspector' }, [h('p', { className: 'muted', text: text('Выберите техпак.', 'Select a Tech Pack.') })]);
    const ready = core.isProductionReady(value);
    const actions = core.allowedActions(value, { canManage: can(value.brandId, caps.CAPABILITIES.TECH_PACK_MANAGE), canAcknowledge: can(value.brandId, caps.CAPABILITIES.TECH_PACK_ACKNOWLEDGE) });
    const buttons = actions.map((action) => actionButton(action, value));
    buttons.unshift(h('button', {
      type: 'button', className: 'secondary', disabled: ui.documentLoading,
      text: ui.documentLoading ? text('\u0421\u0431\u043e\u0440\u043a\u0430\u2026', 'Building\u2026') : text('\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442', 'Document'),
      onclick: () => { void openDocument(value.techPackCode); },
    }));
    const snapshot = value.dependencySnapshot || {};
    return h('aside', { className: 'tech-pack-inspector' }, [
      h('div', { className: `tech-pack-readiness ${ready ? 'ready' : 'blocked'}` }, [h('strong', { text: ready ? text('Готов к размещению производства', 'Ready for production allocation') : text('Размещение производства заблокировано', 'Production allocation blocked') }), h('span', { text: ready ? text('Фабрика подтвердила текущую выпущенную версию.', 'Supplier acknowledged the current issued version.') : text('Нужен выпущенный и подтверждённый фабрикой техпак.', 'An issued and supplier-acknowledged Tech Pack is required.') })]),
      h('div', { className: 'tech-pack-inspector-head' }, [h('div', {}, [h('p', { className: 'eyebrow', text: value.techPackCode }), h('h2', { text: value.title })]), h('div', { className: 'tech-pack-actions' }, buttons)]),
      h('dl', { className: 'tech-pack-facts' }, [pair('SKU', value.sku), pair(text('Редакция', 'Revision'), value.revision), pair(text('Фабрика', 'Supplier'), `${value.supplierCode || '—'} · ${value.supplierName || '—'}`), pair(text('Выпущен', 'Issued'), date(value.issuedAt)), pair(text('Подтверждён', 'Acknowledged'), date(value.acknowledgedAt)), pair(text('Ссылка подтверждения', 'Acknowledgement reference'), value.acknowledgement?.acknowledgementReference)]),
      h('section', { className: 'tech-pack-card' }, [h('h3', { text: text('Зафиксированные зависимости', 'Immutable dependencies') }), h('dl', { className: 'tech-pack-facts' }, [pair(text('Версия SKU', 'SKU version'), snapshot.skuVersion), pair(text('Версия BOM', 'BOM version'), snapshot.bomVersion), pair(text('Версия таблицы мер', 'Measurement chart version'), snapshot.measurementChartVersion), pair(text('Одобренный PPS', 'Approved PPS'), snapshot.sampleCode)])]),
      operationSequencePanel(value),
      h('section', { className: 'tech-pack-card' }, [h('h3', { text: text('Производственные указания', 'Production instructions') }), h('p', { text: value.constructionNotes || '—' }), h('p', { text: value.qualityNotes || '—' }), h('p', { text: value.packingNotes || '—' })]),
    ]);
  }
  async function loadSequence(sku, request = api) {
    if (!sku || ui.sequenceLoading === sku) return;
    ui.sequenceLoading = sku;
    try { ui.sequenceBySku[sku] = await request(`/v2/catalog-skus/${encodeURIComponent(sku)}/operation-sequence`); }
    catch (error) { ui.sequenceBySku[sku] = null; }
    finally { ui.sequenceLoading = ''; if (state.view === 'tech-packs') renderApp(); }
  }
  function stageName(code) {
    const labels = {
      'materials-ready': ['Материалы', 'Materials'], 'cutting-complete': ['Раскрой', 'Cutting'],
      'assembly-complete': ['Пошив', 'Assembly'], 'finishing-complete': ['Отделка', 'Finishing'],
      'packing-complete': ['Упаковка', 'Packing'], 'ready-for-qc': ['Передача на контроль', 'Handover to QC'],
    };
    return text(...(labels[code] || [code, code]));
  }
  function minutes(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return `${I18N.formatNumber(number, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${text('мин', 'min')}`;
  }

  // Технологическая последовательность — тот самый раздел, который печатный техпак обещает и
  // которому до сих пор нечего было показать.
  //
  // Трудоёмкость считается при чтении: это сумма норм по операциям. Стоимости труда здесь нет
  // намеренно — для неё нужна ставка, а ставка это отдельный договор с фабрикой.
  function operationSequencePanel(value) {
    if (ui.sequenceBySku[value.sku] === undefined) queueMicrotask(() => { void loadSequence(value.sku); });
    const sequence = ui.sequenceBySku[value.sku];
    const children = [h('h3', { text: text('Технологическая последовательность', 'List of operations') })];
    if (sequence === undefined) { children.push(h('p', { className: 'muted', text: text('Загрузка…', 'Loading…') })); return h('section', { className: 'tech-pack-card' }, children); }
    if (!sequence) {
      children.push(h('p', { className: 'muted', text: text('Последовательность для этого изделия не составлена.', 'No operation sequence has been drawn for this product.') }));
      return h('section', { className: 'tech-pack-card' }, children);
    }
    const workload = sequence.workload || { operationCount: 0, totalStandardMinutes: 0, byStage: [] };
    children.push(h('p', { className: 'muted', text: text(
      `${workload.operationCount} операций, трудоёмкость ${minutes(workload.totalStandardMinutes)} на изделие.`,
      `${workload.operationCount} operations, ${minutes(workload.totalStandardMinutes)} per garment.`) }));
    for (const stage of workload.byStage) {
      // «2 × 10,5 мин» прочиталось бы как «дважды по десять с половиной», хотя это две операции и
      // десять с половиной в сумме.
      children.push(h('p', { className: 'muted', text: text(
        `${stageName(stage.stage)}: ${stage.operations} оп., всего ${minutes(stage.standardMinutes)}`,
        `${stageName(stage.stage)}: ${stage.operations} ops, ${minutes(stage.standardMinutes)} in total`) }));
    }
    for (const operation of sequence.operations) {
      children.push(h('p', { text: `${operation.position}. ${text(operation.nameRu, operation.nameEn)} — ${stageName(operation.stage)} · ${minutes(operation.standardMinutes)}${operation.constructionNode ? ` · ${operation.constructionNode}` : ''}${operation.equipment ? ` · ${operation.equipment}` : ''}` }));
    }
    return h('section', { className: 'tech-pack-card' }, children);
  }

  function actionButton(action, value) {
    const labels = { edit: [text('Редактировать', 'Edit'), 'secondary'], issue: [text('Выпустить', 'Issue'), 'primary'], acknowledge: [text('Зафиксировать подтверждение', 'Record acknowledgement'), 'primary'], revision: [text('Новая редакция', 'New revision'), 'secondary'], withdraw: [text('Отозвать', 'Withdraw'), 'danger'] };
    const handlers = { edit: () => openDraft(value), issue: () => confirmIssue(value), acknowledge: () => openAcknowledgement(value), revision: () => openRevision(value), withdraw: () => openWithdraw(value) };
    return h('button', { type: 'button', className: labels[action][1], disabled: Boolean(ui.busyCode), text: labels[action][0], onclick: handlers[action] });
  }

  function field(label, control) { return h('label', { className: 'tech-pack-field' }, [h('span', { text: label }), control]); }
  function input(name, value = '', attrs = {}) { return h('input', { name, type: 'text', value: value ?? '', ...attrs }); }
  function textarea(name, value = '', attrs = {}) { return h('textarea', { name, text: value ?? '', ...attrs }); }
  function select(name, options, value) { const control = h('select', { name }, options.map(([id, label]) => h('option', { value: id, text: label }))); control.value = value; return control; }
  function dialog(title, fields, submit, label = text('Сохранить', 'Save')) {
    const modal = h('dialog', { className: 'tech-pack-dialog' });
    const form = h('form', { method: 'dialog', className: 'tech-pack-form' }, [h('div', { className: 'tech-pack-dialog-head' }, [h('h2', { text: title }), h('button', { type: 'button', className: 'icon-button', text: '×', onclick: () => modal.close() })]), ...fields, h('div', { className: 'tech-pack-dialog-actions' }, [h('button', { type: 'button', className: 'secondary', text: text('Отмена', 'Cancel'), onclick: () => modal.close() }), h('button', { type: 'submit', className: 'primary', text: label })])]);
    form.addEventListener('submit', async (event) => { event.preventDefault(); const result = await submit(Object.fromEntries(new FormData(form).entries())); if (result !== false) modal.close(); });
    modal.addEventListener('close', () => modal.remove()); modal.append(form); document.body.append(modal); modal.showModal();
  }
  // openDraft(null) reaches here with null, and a default parameter only fires on undefined, so
  // every read of value.* threw and the create button did nothing at all.
  function editableFields(value) {
    value = value || {}; return [field(text('Код фабрики', 'Supplier code'), input('supplierCode', value.supplierCode, { required: true, maxlength: '64' })), field(text('Фабрика', 'Supplier name'), input('supplierName', value.supplierName, { required: true, maxlength: '160' })), field('Email', input('supplierEmail', value.supplierEmail, { required: true, maxlength: '254' })), field(text('Название', 'Title'), input('title', value.title, { required: true, minlength: '3', maxlength: '200' })), field(text('Описание', 'Description'), textarea('description', value.description, { rows: '3', maxlength: '4000' })), field(text('Конструкция', 'Construction notes'), textarea('constructionNotes', value.constructionNotes, { rows: '4', required: true, maxlength: '8000' })), field(text('Контроль качества', 'Quality notes'), textarea('qualityNotes', value.qualityNotes, { rows: '4', required: true, maxlength: '4000' })), field(text('Упаковка', 'Packing notes'), textarea('packingNotes', value.packingNotes, { rows: '4', required: true, maxlength: '4000' }))]; }
  function payload(values) { return { supplierCode: values.supplierCode, supplierName: values.supplierName, supplierEmail: values.supplierEmail, title: values.title, description: values.description || null, constructionNotes: values.constructionNotes, qualityNotes: values.qualityNotes, packingNotes: values.packingNotes }; }
  function openDraft(value) {
    const options = manageableCatalog().map((sku) => [sku.sku, `${sku.sku} · ${sku.name || ''}`]);
    if (!value && !options.length) { toast(text('Нет доступных SKU.', 'No manageable SKU is available.'), 'error'); return; }
    const sku = value ? h('input', { name: 'sku', value: value.sku, disabled: true }) : select('sku', options, options[0][0]);
    const code = input('techPackCode', value?.techPackCode || `TP-${options[0]?.[0] || value?.sku}-R01`, { required: true, maxlength: '64', disabled: Boolean(value) });
    dialog(value ? text('Редактировать техпак', 'Edit Tech Pack') : text('Новый техпак', 'New Tech Pack'), [field('SKU', sku), field(text('Код техпака', 'Tech Pack code'), code), ...editableFields(value)], async (values) => {
      if (value) return Boolean(await command(value, `/v2/tech-packs/${encodeURIComponent(value.techPackCode)}`, { expectedVersion: value.version, ...payload(values) }, 'PATCH'));
      return Boolean(await command(null, '/v2/tech-packs', { techPackCode: values.techPackCode, sku: values.sku, ...payload(values) }));
    });
  }
  async function confirmIssue(value) {
    const accepted = await confirmAction({
      title: text('Выпустить технический пакет', 'Issue tech pack'),
      question: text(`${value.techPackCode}: после выпуска редакция неизменяема.`, `${value.techPackCode}: the revision becomes immutable once issued.`),
      confirmLabel: text('Выпустить', 'Issue'),
    });
    if (accepted) await command(value, `/v2/tech-packs/${encodeURIComponent(value.techPackCode)}/issue`, { expectedVersion: value.version });
  }
  function openAcknowledgement(value) { dialog(text('Подтверждение фабрики', 'Supplier acknowledgement'), [field(text('Код фабрики', 'Supplier code'), input('supplierCode', value.supplierCode, { readonly: true, required: true })), field(text('Ссылка / номер подтверждения', 'Acknowledgement reference'), input('acknowledgementReference', '', { required: true, minlength: '2', maxlength: '160' })), field(text('Подтвердил', 'Acknowledged by'), input('acknowledgedBy', '', { required: true, minlength: '2', maxlength: '160' })), field(text('Комментарий', 'Notes'), textarea('notes', '', { rows: '4', maxlength: '1000' }))], async (values) => Boolean(await command(value, `/v2/tech-packs/${encodeURIComponent(value.techPackCode)}/acknowledge`, { expectedVersion: value.version, supplierCode: values.supplierCode, acknowledgementReference: values.acknowledgementReference, acknowledgedBy: values.acknowledgedBy, notes: values.notes || null })), text('Зафиксировать', 'Record'));
  }
  function openRevision(value) { dialog(text('Новая редакция', 'New revision'), [field(text('Код новой редакции', 'New revision code'), input('techPackCode', core.nextRevisionCode(value), { required: true, maxlength: '64' }))], async (values) => Boolean(await command(value, `/v2/tech-packs/${encodeURIComponent(value.techPackCode)}/revisions`, { expectedVersion: value.version, techPackCode: values.techPackCode })), text('Создать редакцию', 'Create revision'));
  }
  function openWithdraw(value) { dialog(text('Отозвать техпак', 'Withdraw Tech Pack'), [field(text('Причина', 'Reason'), textarea('reason', '', { required: true, minlength: '5', maxlength: '500', rows: '4' }))], async (values) => Boolean(await command(value, `/v2/tech-packs/${encodeURIComponent(value.techPackCode)}/withdraw`, { expectedVersion: value.version, reason: values.reason })), text('Отозвать', 'Withdraw'));
  }

  function renderTechPacks() {
    ensureLoaded();
    const summary = core.summarize(ui.items);
    const items = core.filter(ui.items, { status: ui.status, ready: ui.readiness, search: ui.search });
    return ui.document ? renderDocument(ui.document) : h('section', { className: 'tech-pack-page' }, [header(summary), ui.error ? null : filters(), ui.error ? h('div', { className: 'tech-pack-error' }, [h('strong', { text: text('Не удалось загрузить техпаки', 'Could not load Tech Packs') }), h('span', { text: ui.error }), h('button', { type: 'button', className: 'secondary', text: text('Повторить', 'Retry'), onclick: () => { void load({ reset: true }); } })]) : null, ui.error ? null : h('div', { className: 'tech-pack-layout' }, [registry(items), inspector(selected())])]);
  }

  const previousRenderView = renderView;
  renderView = (...args) => state.view === 'tech-packs' ? renderTechPacks() : previousRenderView(...args);
  const previousRenderNavigation = renderNavigation;
  renderNavigation = (...args) => {
    const navigation = previousRenderNavigation(...args);
    for (const button of navigation.querySelectorAll('button')) {
      const label = button.textContent.trim();
      if (label !== 'Технические пакеты' && label !== 'Tech packs') continue;
      button.disabled = false;
      button.classList.remove('planned', 'is-planned');
      button.setAttribute('aria-label', text('Открыть технические пакеты', 'Open Tech Packs'));
      button.addEventListener('click', (event) => { event.preventDefault(); event.stopImmediatePropagation(); state.view = 'tech-packs'; renderApp(); }, true);
    }
    return navigation;
  };
  global.SynthaTechPacksWorkspace.fetchAll = fetchAll;
})(window);
