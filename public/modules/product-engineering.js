(function installProductEngineering(root) {
  'use strict';

  const cache = new Map();
  const PURPOSES = [
    ['garment_interpretation', 'Распознать конструкцию изделия', 'Interpret garment construction'],
    ['document_ingestion', 'Разобрать технические документы', 'Ingest technical documents'],
    ['measurement_assist', 'Предложить POM и измерения', 'Assist POM and measurements'],
    ['bom_assist', 'Предложить состав BOM', 'Assist BOM composition'],
    ['construction_assist', 'Проверить технологические узлы', 'Assist construction nodes'],
    ['technical_flat', 'Подготовить технический flat', 'Prepare technical flat'],
    ['sample_review', 'Разобрать образец', 'Review sample'],
    ['conflict_review', 'Проверить противоречия', 'Review conflicts'],
  ];

  function text(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }
  function itemState(styleId) {
    if (!cache.has(styleId)) cache.set(styleId, { data: null, loading: false, error: null });
    return cache.get(styleId);
  }
  function can(product, capability) {
    return Boolean(root.SynthaUiCapabilities?.hasForOrganisation(state.workspace, product.brandId, capability));
  }
  function readAllowed(product) { return can(product, root.SynthaUiCapabilities.CAPABILITIES.PRODUCT_ENGINEERING_READ); }
  function manageAllowed(product) { return can(product, root.SynthaUiCapabilities.CAPABILITIES.PRODUCT_ENGINEERING_MANAGE); }

  async function load(styleId, force = false) {
    const holder = itemState(styleId);
    if (holder.loading || (!force && holder.data)) return;
    holder.loading = true;
    holder.error = null;
    try {
      holder.data = await api(`/v2/product/styles/${encodeURIComponent(styleId)}/engineering?limit=100`);
    } catch (problem) {
      holder.error = problem;
    } finally {
      holder.loading = false;
      if (state.view === 'styles') renderApp();
    }
  }

  function invalidate(styleId) {
    const holder = itemState(styleId);
    holder.data = null;
    holder.error = null;
    queueMicrotask(() => { void load(styleId, true); });
  }

  function status(value) {
    const labels = {
      queued: ['в очереди', 'queued'], running: ['в работе', 'running'], completed: ['завершён', 'completed'],
      failed: ['ошибка', 'failed'], cancelled: ['отменён', 'cancelled'], pending: ['ждёт проверки', 'pending'],
      accepted: ['принято', 'accepted'], rejected: ['отклонено', 'rejected'], superseded: ['заменено', 'superseded'],
      open: ['открыт', 'open'], resolved: ['решён', 'resolved'], ignored: ['принят как исключение', 'ignored'],
      draft: ['черновик', 'draft'], approved: ['утверждён', 'approved'],
      blocking: ['блокирует', 'blocking'], warning: ['внимание', 'warning'], info: ['информация', 'info'],
    };
    const pair = labels[value] || [value || '—', value || '—'];
    return text(pair[0], pair[1]);
  }

  function purpose(value) {
    const row = PURPOSES.find(([code]) => code === value);
    return row ? text(row[1], row[2]) : value;
  }

  function confidence(value) {
    return typeof value === 'number' ? `${Math.round(value * 100)}%` : '—';
  }

  function asText(value) {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      const encoded = JSON.stringify(value);
      return encoded.length > 140 ? `${encoded.slice(0, 137)}…` : encoded;
    } catch { return '—'; }
  }

  function summary(data) {
    const pending = data.proposals.filter((row) => row.status === 'pending').length;
    const conflicts = data.conflicts.filter((row) => row.status === 'open').length;
    const blocking = data.conflicts.filter((row) => row.status === 'open' && row.severity === 'blocking').length;
    const approvedDrawings = data.drawings.filter((row) => row.status === 'approved').length;
    const row = el('div', { className: 'od-engineering-summary' });
    [
      [text('Анализы', 'Analyses'), data.analyses.length],
      [text('Предложения', 'Pending proposals'), pending],
      [text('Конфликты', 'Open conflicts'), conflicts],
      [text('Блокирующие', 'Blocking'), blocking],
      [text('Утверждённые виды', 'Approved views'), approvedDrawings],
    ].forEach(([label, value]) => {
      const card = el('div', { className: 'od-engineering-kpi', 'data-od14-component': 'metric' });
      card.append(el('strong', { rawText: String(value) }), el('span', { rawText: label }));
      row.append(card);
    });
    return row;
  }

  function requestAnalysis(item) {
    const product = item.product;
    const options = PURPOSES.map(([code, ru, en]) => [code, text(ru, en)]);
    openForm({
      title: text('Новый инженерный анализ', 'New engineering analysis'),
      hint: text(
        'AI создаёт только доказательства и предложения. Ни одно каноническое поле модели, BOM, мерок или техпака автоматически не меняется.',
        'AI creates evidence and proposals only. No canonical Product, BOM, measurement or Tech Pack field is changed automatically.',
      ),
      fields: [
        field(text('Задача', 'Purpose'), select('purpose', options)),
        field(text('Что проверить', 'Review objective'), input('objective', 'text', { maxlength: '500', placeholder: text('Например: проверить конструкцию по референсам', 'e.g. verify construction against references') })),
      ],
      submitLabel: text('Создать анализ', 'Create analysis'),
      onSubmit: async (values) => {
        await mutate(`/v2/product/styles/${encodeURIComponent(product.id)}/engineering/analyses`, {
          ...(product.styleVersionId ? { styleVersionId: product.styleVersionId } : {}),
          purpose: values.purpose,
          inputManifest: {
            objective: values.objective?.trim() || null,
            styleCode: product.styleCode,
            styleVersionId: product.styleVersionId || null,
            sourcePolicy: 'canonical-product-assets-and-explicit-user-sources',
            requestedFrom: 'product-master-engineering-tab',
          },
        });
        invalidate(product.id);
        toast(text('Инженерный анализ создан. Канонические данные не изменены.', 'Engineering analysis created. Canonical data is unchanged.'), 'success');
      },
    });
  }

  async function mutateAnalysis(item, analysis, action) {
    const button = item;
    await runAction(async () => {
      await mutate(`/v2/product-engineering/analyses/${encodeURIComponent(analysis.id)}/${action}`, {});
      invalidate(analysis.styleId);
    }, button);
  }

  function analysisPanel(product, rows, manage) {
    const wrap = el('div', { className: 'stack' });
    wrap.append(el('h4', { rawText: text('Анализы', 'Analyses') }));
    if (!rows.length) {
      wrap.append(notice(text('Инженерных анализов пока нет.', 'No engineering analyses yet.')));
      return wrap;
    }
    const tableRows = rows.map((row) => {
      const actions = el('div', { className: 'od-inline-actions' });
      if (manage && row.status === 'queued') {
        const start = el('button', { className: 'button small', type: 'button', rawText: text('Запустить', 'Start') });
        start.addEventListener('click', () => { void mutateAnalysis(start, row, 'start'); });
        actions.append(start);
      }
      if (manage && row.status === 'running') {
        const complete = el('button', { className: 'button small', type: 'button', rawText: text('Завершить', 'Complete') });
        complete.addEventListener('click', () => { void mutateAnalysis(complete, row, 'complete'); });
        actions.append(complete);
      }
      return [purpose(row.purpose), statusBadge(row.status), row.requestedAt ? formatDate(row.requestedAt) : '—', row.inputHash?.slice(0, 10) || '—', actions];
    });
    wrap.append(odMiniTable(
      [text('Задача', 'Purpose'), text('Статус', 'Status'), text('Создан', 'Created'), 'SHA-256', text('Действие', 'Action')],
      tableRows,
    ));
    return wrap;
  }

  function rejectProposal(product, proposal) {
    openForm({
      title: text('Отклонить предложение', 'Reject proposal'),
      hint: text('Причина остаётся в истории инженерного решения.', 'The reason remains in engineering decision history.'),
      fields: [field(text('Причина', 'Reason'), input('note', 'text', { required: true, minlength: '2', maxlength: '4000' }))],
      submitLabel: text('Отклонить', 'Reject'),
      onSubmit: async (values) => {
        await mutate(`/v2/product-engineering/proposals/${encodeURIComponent(proposal.id)}/resolve`, {
          expectedVersion: proposal.version, decision: 'rejected', note: values.note.trim(),
        });
        invalidate(product.id);
      },
    });
  }

  function proposalActions(product, proposal, manage) {
    if (!manage || proposal.status !== 'pending') return status(proposal.status);
    const row = el('div', { className: 'od-inline-actions' });
    const accept = el('button', { className: 'button small primary', type: 'button', rawText: text('Принять', 'Accept') });
    accept.title = text('Принять предложение в review. Это ещё не меняет canonical entity.', 'Accept the proposal in review. This does not yet mutate the canonical entity.');
    accept.addEventListener('click', () => { void runAction(async () => {
      await mutate(`/v2/product-engineering/proposals/${encodeURIComponent(proposal.id)}/resolve`, {
        expectedVersion: proposal.version, decision: 'accepted',
      });
      invalidate(product.id);
    }, accept); });
    const reject = el('button', { className: 'button small', type: 'button', rawText: text('Отклонить', 'Reject') });
    reject.addEventListener('click', () => rejectProposal(product, proposal));
    row.append(accept, reject);
    return row;
  }

  function proposalsPanel(product, rows, manage) {
    const wrap = el('div', { className: 'stack' });
    wrap.append(el('h4', { rawText: text('Предложения AI / правил', 'AI / rule proposals') }));
    if (!rows.length) { wrap.append(notice(text('Предложений пока нет.', 'No proposals yet.'))); return wrap; }
    wrap.append(odMiniTable(
      [text('Контур', 'Authority'), text('Поле', 'Field'), text('Предложение', 'Proposal'), text('Уверенность', 'Confidence'), text('Статус', 'Status / action')],
      rows.map((row) => [
        row.targetAuthority,
        row.targetField,
        asText(row.proposedValue),
        confidence(row.confidence),
        proposalActions(product, row, manage),
      ]),
    ));
    return wrap;
  }

  function resolveConflictForm(product, conflict) {
    openForm({
      title: text('Закрыть технический конфликт', 'Resolve technical conflict'),
      hint: text('Конфликт не исчезает: решение фиксируется рядом с исходными кандидатами.', 'The conflict is preserved with its candidates and resolution.'),
      fields: [
        field(text('Решение', 'Disposition'), select('disposition', [['resolved', text('Разрешён', 'Resolved')], ['ignored', text('Принять как исключение', 'Accept as exception')]])),
        field(text('Комментарий', 'Decision note'), input('note', 'text', { maxlength: '2000' })),
      ],
      submitLabel: text('Зафиксировать', 'Record decision'),
      onSubmit: async (values) => {
        await mutate(`/v2/product-engineering/conflicts/${encodeURIComponent(conflict.id)}/resolve`, {
          expectedVersion: conflict.version,
          disposition: values.disposition,
          resolution: { note: values.note?.trim() || null },
        });
        invalidate(product.id);
      },
    });
  }

  function conflictsPanel(product, rows, manage) {
    const wrap = el('div', { className: 'stack' });
    wrap.append(el('h4', { rawText: text('Противоречия источников', 'Source conflicts') }));
    if (!rows.length) { wrap.append(notice(text('Конфликтов источников нет.', 'No source conflicts.'))); return wrap; }
    wrap.append(odMiniTable(
      [text('Уровень', 'Severity'), text('Что расходится', 'Subject'), text('Варианты', 'Candidates'), text('Статус', 'Status'), text('Действие', 'Action')],
      rows.map((row) => {
        const action = manage && row.status === 'open'
          ? (() => {
              const button = el('button', { className: 'button small', type: 'button', rawText: text('Разобрать', 'Resolve') });
              button.addEventListener('click', () => resolveConflictForm(product, row));
              return button;
            })()
          : '—';
        return [statusBadge(row.severity), row.subject, row.candidates.map(asText).join(' ↔ '), status(row.status), action];
      }),
    ));
    return wrap;
  }

  const SVG_TAGS = new Set(['svg','g','path','line','polyline','polygon','rect','circle','ellipse','text','tspan','defs','clippath','mask','lineargradient','radialgradient','stop']);
  const SVG_ATTRS = new Set(['viewbox','width','height','d','points','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','opacity','transform','font-size','text-anchor','clip-path','mask','offset','stop-color','stop-opacity']);
  function safeSvg(svg) {
    try {
      const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const rootNode = parsed.documentElement;
      if (String(rootNode.nodeName).toLowerCase() !== 'svg') return null;
      const clean = (node) => {
        [...node.children].forEach((child) => {
          if (!SVG_TAGS.has(String(child.nodeName).toLowerCase())) { child.remove(); return; }
          clean(child);
        });
        [...node.attributes].forEach((attribute) => {
          const name = attribute.name.toLowerCase();
          if (!SVG_ATTRS.has(name) || name.startsWith('on') || /url\s*\(\s*https?:/i.test(attribute.value)) node.removeAttribute(attribute.name);
        });
      };
      clean(rootNode);
      return document.importNode(rootNode, true);
    } catch { return null; }
  }

  function drawingsPanel(product, rows, manage) {
    const wrap = el('div', { className: 'stack' });
    wrap.append(el('h4', { rawText: text('Технические виды SVG', 'Technical SVG views') }));
    if (!rows.length) { wrap.append(notice(text('Технические виды ещё не созданы.', 'No technical views yet.'))); return wrap; }
    const grid = el('div', { className: 'od-engineering-drawing-grid' });
    rows.slice(0, 12).forEach((drawing) => {
      const card = el('article', { className: 'od-engineering-drawing', 'data-od14-component': 'card' });
      const head = el('div', { className: 'od-engineering-drawing-head' });
      head.append(el('strong', { rawText: `${drawing.viewType} · v${drawing.versionNo}` }), statusBadge(drawing.status));
      card.append(head);
      const visual = el('div', { className: 'od-engineering-svg-preview' });
      const node = safeSvg(drawing.svg);
      if (node) visual.append(node); else visual.append(el('span', { className: 'muted', rawText: text('SVG не прошёл безопасное отображение.', 'SVG could not be safely rendered.') }));
      card.append(visual, el('small', { className: 'muted', rawText: `${drawing.objectCount ?? 0} ${text('объектов', 'objects')} · ${drawing.contentHash.slice(0, 10)}…` }));
      if (manage && drawing.status === 'draft') {
        const approve = el('button', { className: 'button small', type: 'button', rawText: text('Утвердить вид', 'Approve view') });
        approve.addEventListener('click', () => { void runAction(async () => {
          await mutate(`/v2/product-engineering/drawings/${encodeURIComponent(drawing.id)}/approve`, {});
          invalidate(product.id);
        }, approve); });
        card.append(approve);
      }
      grid.append(card);
    });
    wrap.append(grid);
    return wrap;
  }

  function panel(item) {
    const product = item.product;
    if (!readAllowed(product)) return notice(text('Инженерный AI-контур недоступен для этой роли.', 'The AI engineering workspace is not available to this role.'));
    const holder = itemState(product.id);
    if (!holder.data && !holder.loading && !holder.error) queueMicrotask(() => { void load(product.id); });
    if (holder.loading && !holder.data) return notice(text('Загрузка AI Engineering…', 'Loading AI Engineering…'));
    if (holder.error) {
      const wrap = el('div', { className: 'stack' });
      wrap.append(notice(holder.error?.message || text('AI Engineering недоступен.', 'AI Engineering is unavailable.')));
      const retry = el('button', { className: 'button small', type: 'button', rawText: text('Повторить', 'Retry') });
      retry.addEventListener('click', () => { holder.error = null; void load(product.id, true); });
      wrap.append(retry);
      return wrap;
    }
    const data = holder.data || { analyses: [], proposals: [], conflicts: [], drawings: [] };
    const manage = manageAllowed(product);
    const wrap = el('div', { className: 'stack od-engineering-workspace' });
    const guard = notice(text(
      'AI здесь не является источником истины: он формирует evidence, proposal и conflict. Принятое предложение отдельно применяется через канонический контур.',
      'AI is not an authority here: it produces evidence, proposals and conflicts. An accepted proposal is applied separately through its canonical authority.',
    ));
    wrap.append(guard, summary(data));
    if (manage) {
      const actions = el('div', { className: 'od-inline-actions' });
      const create = el('button', { className: 'button small primary', type: 'button', rawText: text('Новый анализ', 'New analysis') });
      create.addEventListener('click', () => requestAnalysis(item));
      const refresh = el('button', { className: 'button small', type: 'button', rawText: text('Обновить', 'Refresh') });
      refresh.addEventListener('click', () => { invalidate(product.id); });
      actions.append(create, refresh);
      wrap.append(actions);
    }
    wrap.append(
      conflictsPanel(product, data.conflicts, manage),
      proposalsPanel(product, data.proposals, manage),
      drawingsPanel(product, data.drawings, manage),
      analysisPanel(product, data.analyses, manage),
    );
    return wrap;
  }

  root.SynthaProductEngineering = Object.freeze({ panel, load, invalidate });
})(window);
