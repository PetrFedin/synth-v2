(function installProductEngineering(root) {
  'use strict';

  const cache = new Map();
  const MODEL_CONTRACTS = Object.freeze({
    garment_interpretation: Object.freeze({ promptVersion: 'garment-interpretation-v1', schemaVersion: 'garment-ontology-v1' }),
    document_ingestion: Object.freeze({ promptVersion: 'document-ingestion-v1', schemaVersion: 'engineering-findings-v1' }),
    measurement_assist: Object.freeze({ promptVersion: 'measurement-assist-v1', schemaVersion: 'engineering-findings-v1' }),
    bom_assist: Object.freeze({ promptVersion: 'bom-assist-v1', schemaVersion: 'engineering-findings-v1' }),
    construction_assist: Object.freeze({ promptVersion: 'construction-assist-v1', schemaVersion: 'garment-ontology-v1' }),
    technical_flat: Object.freeze({ promptVersion: 'technical-flat-v1', schemaVersion: 'garment-ontology-v1' }),
    sample_review: Object.freeze({ promptVersion: 'sample-review-v1', schemaVersion: 'engineering-findings-v1' }),
    conflict_review: Object.freeze({ promptVersion: 'conflict-review-v1', schemaVersion: 'engineering-findings-v1' }),
  });

  const APPLY_ACTIONS = new Set([
    'measurement/chart',
    'material/specification',
    'tech_pack/revision',
    'operation_sequence/operations',
  ]);

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
      open: ['открыт', 'open'], acknowledged: ['принят в работу', 'acknowledged'], resolved: ['решён', 'resolved'], ignored: ['принят как исключение', 'ignored'],
      draft: ['черновик', 'draft'], approved: ['утверждён', 'approved'],
      blocking: ['блокирует', 'blocking'], warning: ['внимание', 'warning'], info: ['информация', 'info'],
      high: ['высокий риск', 'high risk'], medium: ['средний риск', 'medium risk'],
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
    const admittedSources = (data.sources ?? []).filter((row) => row.status === 'admitted').length;
    const openChanges = (data.changeCases ?? []).filter((row) => row.status === 'open').length;
    const row = el('div', { className: 'od-engineering-summary' });
    [
      [text('Источники', 'Admitted sources'), admittedSources],
      [text('Анализы', 'Analyses'), data.analyses.length],
      [text('Предложения', 'Pending proposals'), pending],
      [text('Конфликты', 'Open conflicts'), conflicts],
      [text('Блокирующие', 'Blocking'), blocking],
      [text('Утверждённые виды', 'Approved views'), approvedDrawings],
      [text('Ontology nodes', 'Ontology nodes'), data.garmentGraph?.nodeCount ?? 0],
      [text('Изменения источников', 'Open source changes'), openChanges],
    ].forEach(([label, value]) => {
      const card = el('div', { className: 'od-engineering-kpi', 'data-od14-component': 'metric' });
      card.append(el('strong', { rawText: String(value) }), el('span', { rawText: label }));
      row.append(card);
    });
    return row;
  }

  function uploadSource(item) {
    const product = item.product;
    const chooser = document.createElement('input');
    chooser.type = 'file';
    chooser.accept = '.pdf,.xlsx,.csv,.svg,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,image/svg+xml,image/jpeg,image/png,image/webp';
    chooser.addEventListener('change', async () => {
      const file = chooser.files?.[0];
      if (!file) return;
      try {
        await uploadBinary(`/v2/product/styles/${encodeURIComponent(product.id)}/engineering/upload`, file);
        invalidate(product.id);
        toast(text('Источник загружен и зафиксирован по SHA-256.', 'Source uploaded and fixed by SHA-256.'), 'success');
      } catch (error) {
        toast(error?.message || text('Не удалось загрузить источник.', 'Source upload failed.'), 'error');
      }
    }, { once: true });
    chooser.click();
  }

  function requestAnalysis(item) {
    const product = item.product;
    const options = PURPOSES.map(([code, ru, en]) => Object.freeze({ id: code, name: text(ru, en) }));
    openForm(
      text('Новый инженерный анализ', 'New engineering analysis'),
      [
        selectDef('purpose', text('Задача', 'Purpose'), options, option => option.name),
        textDef(
          'objective',
          text('Что проверить', 'Review objective'),
          '',
          500,
          false,
        ),
      ],
      async (values) => {
        const readySources = (itemState(product.id).data?.sources ?? []).filter((source) => source.status === 'admitted' && source.parseStatus === 'completed');
        if (!readySources.length) throw new Error(text('Сначала загрузите источник и дождитесь завершения проверки/парсинга.', 'Upload a source and wait for scan/parsing to complete first.'));
        const modelContract = MODEL_CONTRACTS[values.purpose];
        if (!modelContract) throw new Error(text('Для этой задачи ещё не определён model contract.', 'No model contract is defined for this purpose yet.'));
        const result = await mutate(`/v2/product/styles/${encodeURIComponent(product.id)}/engineering/analyses`, {
          ...(product.styleVersionId ? { styleVersionId: product.styleVersionId } : {}),
          purpose: values.purpose,
          inputManifest: {
            objective: values.objective?.trim() || null,
            styleCode: product.styleCode,
            styleVersionId: product.styleVersionId || null,
            sourcePolicy: 'admitted-parsed-sources-only',
            sourceIds: readySources.map((source) => source.id),
            autoExecute: true,
            modelContract,
            requestedFrom: 'product-master-engineering-tab',
          },
        });
        invalidate(product.id);
        return result;
      },
      {
        successMessage: [
          'Инженерный анализ создан. Канонические данные не изменены.',
          'Engineering analysis created. Canonical data is unchanged.',
        ],
      },
    );
  }

  async function mutateAnalysis(item, analysis, action) {
    const button = item;
    await runAction(async () => {
      await mutate(`/v2/product-engineering/analyses/${encodeURIComponent(analysis.id)}/${action}`, {});
      invalidate(analysis.styleId);
    }, button);
  }



  function garmentGraphPanel(graph) {
    const wrap = el('div', { className: 'stack' });
    wrap.append(el('h4', { rawText: text('Семантическая конструкция изделия', 'Garment ontology graph') }));
    if (!graph) {
      wrap.append(notice(text(
        'Reviewed garment graph ещё не создан. Он появится после квалифицированного garment/construction анализа.',
        'No reviewed garment graph yet. It will appear after a qualified garment/construction analysis.',
      )));
      return wrap;
    }

    const meta = el('div', { className: 'od-inline-actions' });
    meta.append(
      statusBadge(graph.status),
      el('span', { className: 'muted', rawText: graph.schemaVersion || '—' }),
      el('span', { className: 'muted', rawText: graph.contentHash ? `SHA-256 ${graph.contentHash.slice(0, 12)}…` : '—' }),
      el('span', { className: 'muted', rawText: `${graph.nodeCount ?? graph.nodes?.length ?? 0} undefined · ${graph.edgeCount ?? graph.edges?.length ?? 0} undefined` }),
    );
    wrap.append(meta);

    const nodeById = new Map((graph.nodes ?? []).map((node) => [node.id, node]));
    if (graph.nodes?.length) {
      wrap.append(odMiniTable(
        [text('Тип', 'Type'), text('Семантика', 'Semantic'), text('Название', 'Label'), text('Уверенность', 'Confidence'), text('Finding', 'Finding')],
        graph.nodes.slice(0, 80).map((node) => [
          node.nodeType,
          node.semanticCode || '—',
          node.label || '—',
          confidence(node.confidence),
          node.findingId || '—',
        ]),
      ));
    }

    if (graph.edges?.length) {
      wrap.append(el('h5', { rawText: text('Связи конструкции', 'Structural relations') }));
      wrap.append(odMiniTable(
        [text('От', 'From'), text('Связь', 'Relation'), text('К', 'To'), text('Уверенность', 'Confidence')],
        graph.edges.slice(0, 100).map((edge) => {
          const from = nodeById.get(edge.fromNodeId);
          const to = nodeById.get(edge.toNodeId);
          return [
            from?.semanticCode || from?.label || edge.fromNodeId,
            edge.relation,
            to?.semanticCode || to?.label || edge.toNodeId,
            confidence(edge.confidence),
          ];
        }),
      ));
    }
    return wrap;
  }

  function reviseSource(product, source, rows) {
    const candidates = rows.filter((row) => row.id !== source.id && row.status === 'admitted' && ['completed','not_required'].includes(row.parseStatus));
    if (!candidates.length) {
      toast(text('Сначала загрузите и дождитесь admission/parsing новой версии источника.', 'Upload and admit/parse the replacement source first.'), 'error');
      return;
    }
    openForm(
      text('Зафиксировать новую версию источника', 'Record source revision'),
      [
        selectDef('replacementSourceId', text('Новая версия', 'Replacement source'), candidates, row => `${row.originalName || row.id} · ${(row.contentHash || '').slice(0, 10)}…`),
        textDef('reason', text('Причина изменения', 'Revision reason'), '', 2000, true, 2),
      ],
      async (values) => {
        const result = await mutate(`/v2/product-engineering/sources/${encodeURIComponent(source.id)}/revise`, {
          replacementSourceId: values.replacementSourceId,
          reason: values.reason.trim(),
        });
        invalidate(product.id);
        queueMicrotask(() => { void showChangeCase(product, result.changeCase.id); });
        return result;
      },
      { successMessage: ['Изменение источника зафиксировано; зависимости пересчитаны.', 'Source revision recorded; dependency impact was recomputed.'] },
    );
  }

  function changeEvidenceStatus(value) {
    if (value === 'observed') return text('наблюдается', 'observed');
    if (value === 'derived') return text('выведено', 'derived');
    if (value === 'policy_required') return text('требуется политикой', 'policy required');
    return value || '—';
  }

  async function showChangeCase(product, changeCaseId) {
    const bundle = await api(`/v2/product-engineering/change-cases/${encodeURIComponent(changeCaseId)}`);
    const changeCase = bundle.changeCase;
    const rows = [
      { label: text('Статус', 'Status'), value: status(changeCase.status) },
      { label: 'Impact SHA-256', value: changeCase.impactHash },
      { label: text('Всего действий', 'Required actions'), value: String(bundle.impacts?.length ?? 0) },
    ];
    (bundle.impacts ?? []).slice(0, 80).forEach((impact) => rows.push({
      label: `${impact.area} · ${status(impact.severity)} · ${status(impact.status)}`,
      value: `${impact.requiredAction} · ${changeEvidenceStatus(impact.evidenceStatus)} · ${impact.entityId}${impact.entityVersion ? ` @ v${impact.entityVersion}` : ''}`,
    }));
    (bundle.receipts ?? []).slice(0, 80).forEach((receipt) => rows.push({
      label: `${text('Receipt', 'Receipt')} · ${receipt.disposition}`,
      value: `${receipt.impactId} · ${receipt.receiptHash?.slice(0, 16) || '—'}… · ${receipt.resultReference?.authority || receipt.waiver?.scope || '—'}`,
    }));
    openDetails(text('Влияние изменения источника', 'Source revision impact'), rows);
    return bundle;
  }

  async function closeNextChangeImpact(product, changeCaseId) {
    const bundle = await api(`/v2/product-engineering/change-cases/${encodeURIComponent(changeCaseId)}`);
    const impact = (bundle.impacts ?? []).find((row) => row.status === 'pending');
    if (!impact) {
      toast(text('Незакрытых impact больше нет.', 'No pending impacts remain.'), 'success');
      return showChangeCase(product, changeCaseId);
    }
    const dispositions = [
      Object.freeze({ id: 'resolved', name: text('Подтверждено исправление / пересмотр', 'Resolved by verified correction / review') }),
      Object.freeze({ id: 'waived', name: text('Разрешить как управляемое исключение', 'Waive as governed exception') }),
    ];
    openForm(
      `${text('Закрыть impact', 'Close impact')} · ${impact.area} · ${impact.requiredAction}`,
      [
        selectDef('disposition', text('Решение', 'Disposition'), dispositions, row => row.name),
        textDef('reason', text('Причина решения', 'Decision reason'), '', 4000, true, 2),
        textDef('evidenceReference', text('Ссылка/ID доказательства', 'Evidence reference / ID'), '', 500, true),
        optionalTextDef('resultAuthority', text('Canonical authority после исправления', 'Resulting canonical authority'), '', 100),
        optionalTextDef('resultEntityId', text('Canonical entity ID', 'Canonical entity ID'), '', 200),
        optionalTextDef('resultVersion', text('Версия или hash результата', 'Result version or hash'), '', 200),
        optionalTextDef('waiverScope', text('Scope исключения', 'Waiver scope'), '', 500),
        optionalTextDef('waiverExpiresAt', text('Истекает, ISO timestamp', 'Expires at, ISO timestamp'), '', 100),
      ],
      async (values) => {
        const disposition = values.disposition;
        const payload = {
          expectedVersion: impact.version,
          disposition,
          reason: values.reason.trim(),
          evidence: [{ kind: 'manual_review', reference: values.evidenceReference.trim() }],
        };
        if (disposition === 'waived') {
          if (!values.waiverScope?.trim()) throw new Error(text('Для waiver обязателен scope исключения.', 'Waiver scope is required.'));
          payload.waiver = {
            scope: values.waiverScope.trim(),
            ...(values.waiverExpiresAt?.trim() ? { expiresAt: values.waiverExpiresAt.trim() } : {}),
          };
        } else if (impact.evidenceStatus === 'policy_required') {
          if (!values.resultAuthority?.trim() || !values.resultEntityId?.trim() || !values.resultVersion?.trim()) {
            throw new Error(text('Для policy-required resolve нужны authority, entity ID и версия/hash результата.', 'Policy-required resolution needs authority, entity ID and resulting version/hash.'));
          }
          payload.resultReference = {
            authority: values.resultAuthority.trim(),
            entityId: values.resultEntityId.trim(),
            version: values.resultVersion.trim(),
          };
        } else if (values.resultAuthority?.trim() && values.resultEntityId?.trim() && values.resultVersion?.trim()) {
          payload.resultReference = { authority: values.resultAuthority.trim(), entityId: values.resultEntityId.trim(), version: values.resultVersion.trim() };
        }
        const result = await mutate(`/v2/product-engineering/change-impacts/${encodeURIComponent(impact.id)}/close`, payload);
        invalidate(product.id);
        queueMicrotask(() => { void showChangeCase(product, changeCaseId); });
        return result;
      },
      {
        successMessage: [
          'Impact закрыт с неизменяемым receipt. Waiver не считается исправлением факта.',
          'Impact closed with an immutable receipt. A waiver is not treated as a corrected fact.',
        ],
      },
    );
  }

  function acknowledgeChangeCase(product, changeCase) {
    openForm(
      text('Принять изменение в работу', 'Acknowledge change case'),
      [textDef('note', text('Комментарий', 'Acknowledgement note'), '', 4000, true, 2)],
      async (values) => {
        const result = await mutate(`/v2/product-engineering/change-cases/${encodeURIComponent(changeCase.id)}/acknowledge`, {
          expectedVersion: changeCase.version,
          note: values.note.trim(),
        });
        invalidate(product.id);
        return result;
      },
      { successMessage: ['Изменение принято в работу.', 'Change case acknowledged.'] },
    );
  }

  function changeCasesPanel(product, rows, manage) {
    const wrap = el('div', { className: 'stack' });
    wrap.append(el('h4', { rawText: text('Изменения и пересмотр зависимостей', 'Changes & dependency review') }));
    if (!rows.length) {
      wrap.append(notice(text('Зафиксированных замен источников пока нет.', 'No governed source revisions yet.')));
      return wrap;
    }
    const tableRows = rows.map((row) => {
      const actions = el('div', { className: 'od-inline-actions' });
      const view = el('button', { className: 'button small', type: 'button', rawText: text('Влияние', 'Impact') });
      view.addEventListener('click', () => { void showChangeCase(product, row.id); });
      actions.append(view);
      if (manage && row.status === 'open') {
        const ack = el('button', { className: 'button small primary', type: 'button', rawText: text('Принять в работу', 'Acknowledge') });
        ack.addEventListener('click', () => acknowledgeChangeCase(product, row));
        actions.append(ack);
      }
      if (manage && Number(row.pendingImpactCount ?? 0) > 0) {
        const resolve = el('button', { className: 'button small', type: 'button', rawText: text('Разобрать impact', 'Resolve impact') });
        resolve.title = text('Закрывает только один impact через resolve/waive receipt; waiver не выдаётся за исправление.', 'Closes one impact through a resolve/waive receipt; waiver never impersonates a correction.');
        resolve.addEventListener('click', () => { void closeNextChangeImpact(product, row.id); });
        actions.append(resolve);
      }
      return [
        statusBadge(row.status),
        `${(row.supersededSourceId || '').slice(0, 12)}… → ${(row.replacementSourceId || '').slice(0, 12)}…`,
        String(row.impactCount ?? 0),
        String(row.pendingImpactCount ?? 0),
        row.impactHash ? `${row.impactHash.slice(0, 12)}…` : '—',
        actions,
      ];
    });
    wrap.append(odMiniTable([
      text('Статус', 'Status'), text('Версии источника', 'Source revision'), text('Влияния', 'Impacts'),
      text('Ждут действий', 'Pending'), 'SHA-256', text('Действие', 'Action'),
    ], tableRows));
    return wrap;
  }

  function sourcesPanel(product, rows, manage) {
    const wrap = el('div', { className: 'stack' });
    wrap.append(el('h4', { rawText: text('Источники и provenance', 'Sources & provenance') }));
    if (!rows.length) {
      wrap.append(notice(text(
        'Управляемых источников пока нет. AI-анализ не должен использовать непроверенные файлы или произвольные внешние URL.',
        'No governed sources yet. AI analysis must not use unadmitted files or arbitrary external URLs.',
      )));
      return wrap;
    }
    wrap.append(odMiniTable(
      [
        text('Источник', 'Source'),
        text('Тип', 'Type'),
        'SHA-256',
        text('Безопасность', 'Security'),
        text('Admission', 'Admission'),
        text('Парсинг', 'Parsing'),
        text('Фрагменты', 'Fragments'),
        text('Действие', 'Action'),
      ],
      rows.map((row) => [
        row.originalName || row.id,
        row.mediaType || row.kind,
        row.contentHash ? `${row.contentHash.slice(0, 12)}…` : '—',
        statusBadge(row.scanStatus),
        statusBadge(row.status),
        statusBadge(row.parseStatus),
        String(row.fragmentCount ?? 0),
        manage ? (() => {
          const actions = el('div', { className: 'od-inline-actions' });
          if (row.status === 'admitted' && ['completed','not_required'].includes(row.parseStatus)) {
            const revise = el('button', { className: 'button small', type: 'button', rawText: text('Новая версия', 'New version') });
            revise.addEventListener('click', () => reviseSource(product, row, rows));
            actions.append(revise);
          }
          return actions;
        })() : '—',
      ]),
    ));
    return wrap;
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
      if (manage && row.status === 'queued' && row.inputManifest?.autoExecute !== true) {
        const start = el('button', { className: 'button small', type: 'button', rawText: text('Запустить', 'Start') });
        start.addEventListener('click', () => { void mutateAnalysis(start, row, 'start'); });
        actions.append(start);
      }
      if (manage && row.status === 'running') {
        const complete = el('button', { className: 'button small', type: 'button', rawText: text('Завершить', 'Complete') });
        complete.addEventListener('click', () => { void mutateAnalysis(complete, row, 'complete'); });
        actions.append(complete);
      }
      const stateCell = el('div', { className: 'stack compact' });
      stateCell.append(statusBadge(row.status));
      if (row.failureCode) stateCell.append(el('small', { className: 'muted', rawText: row.failureCode }));
      return [purpose(row.purpose), stateCell, row.requestedAt ? formatDate(row.requestedAt) : '—', row.inputHash?.slice(0, 10) || '—', actions];
    });
    wrap.append(odMiniTable(
      [text('Задача', 'Purpose'), text('Статус', 'Status'), text('Создан', 'Created'), 'SHA-256', text('Действие', 'Action')],
      tableRows,
    ));
    return wrap;
  }

  function rejectProposal(product, proposal) {
    openForm(
      text('Отклонить предложение', 'Reject proposal'),
      [textDef('note', text('Причина', 'Reason'), '', 4000, true, 2)],
      async (values) => {
        const result = await mutate(`/v2/product-engineering/proposals/${encodeURIComponent(proposal.id)}/resolve`, {
          expectedVersion: proposal.version,
          decision: 'rejected',
          note: values.note.trim(),
        });
        invalidate(product.id);
        return result;
      },
      { successMessage: ['Предложение отклонено.', 'Proposal rejected.'] },
    );
  }

  function impactEvidenceLabel(evidence) {
    if (!evidence || evidence.status === 'not_available') {
      return text('данные ещё не подключены', 'data not available in this reader');
    }
    if (evidence.status === 'derived') {
      return `${text('косвенно', 'derived')} · ${evidence.count ?? 0} · ${evidence.basis || '—'}`;
    }
    return `${text('наблюдается', 'observed')} · ${evidence.count ?? 0}`;
  }

  async function showProposalImpact(proposal) {
    const impact = await api(`/v2/product-engineering/proposals/${encodeURIComponent(proposal.id)}/impact`);
    const rows = [
      { label: text('Контур', 'Authority'), value: `${impact.authority} / ${impact.action}` },
      { label: text('Цель', 'Target'), value: impact.targetEntityId || '—' },
      { label: text('Контекст', 'Context'), value: impact.contextStatus === 'resolved'
        ? `${text('StyleVersion подтверждён', 'Exact StyleVersion resolved')} · ${impact.styleVersionId || '—'}`
        : text('StyleVersion не закреплён — показана policy-оценка без выдуманных фактов', 'No exact StyleVersion — policy impact is shown without invented repository facts') },
      { label: text('Поддержка apply', 'Apply support'), value: impact.supported ? text('поддерживается', 'supported') : text('пока не поддерживается', 'not supported yet') },
    ];
    (impact.impacts ?? []).forEach((row) => {
      rows.push({
        label: `${row.area} · ${status(row.severity)}`,
        value: `${row.action} · ${impactEvidenceLabel(row.evidence)}`,
      });
    });
    openDetails(text('Влияние перед применением', 'Pre-apply change impact'), rows);
    return impact;
  }

  function applyProposalForm(product, proposal) {
    openForm(
      text('Применить принятое предложение', 'Apply accepted proposal'),
      [
        numberDef(
          'expectedCanonicalVersion',
          text('Текущая версия canonical entity', 'Current canonical entity version'),
          '',
          true,
          1,
        ),
      ],
      async (values) => {
        const result = await mutate(`/v2/product-engineering/proposals/${encodeURIComponent(proposal.id)}/apply`, {
          expectedProposalVersion: proposal.version,
          expectedCanonicalVersion: values.expectedCanonicalVersion,
        });
        invalidate(product.id);
        return result;
      },
      {
        successMessage: [
          'Изменение прошло через канонический контур и зафиксировано в appliedReference.',
          'The change passed through its canonical authority and was recorded in appliedReference.',
        ],
      },
    );
  }


  function proposalActions(product, proposal, manage) {
    const row = el('div', { className: 'od-inline-actions' });

    if (proposal.status === 'pending') {
      if (!manage) return status(proposal.status);
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

    if (proposal.status === 'accepted') {
      const impact = el('button', { className: 'button small', type: 'button', rawText: text('Влияние', 'Impact') });
      impact.addEventListener('click', () => { void runAction(() => showProposalImpact(proposal), impact); });
      row.append(impact);

      if (proposal.appliedReference) {
        row.append(statusBadge('accepted'));
        row.append(el('small', {
          className: 'muted',
          rawText: `${text('Применено', 'Applied')} · ${proposal.appliedReference.authority || proposal.targetAuthority} · v${proposal.appliedReference.version ?? '—'}`,
        }));
        return row;
      }

      const key = `${proposal.targetAuthority}/${proposal.targetField}`;
      if (manage && APPLY_ACTIONS.has(key)) {
        const apply = el('button', { className: 'button small primary', type: 'button', rawText: text('Применить', 'Apply') });
        apply.title = text(
          'Сначала проверьте влияние. Применение вызывает отдельную canonical command с optimistic version check.',
          'Review impact first. Apply invokes a separate canonical command with an optimistic version check.',
        );
        apply.addEventListener('click', () => applyProposalForm(product, proposal));
        row.append(apply);
      } else if (manage) {
        row.append(el('small', { className: 'muted', rawText: text('Canonical apply для этого действия ещё не подключён.', 'Canonical apply is not connected for this action yet.') }));
      }
      return row;
    }

    return status(proposal.status);
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
    const dispositions = [
      Object.freeze({ id: 'resolved', name: text('Разрешён', 'Resolved') }),
      Object.freeze({ id: 'ignored', name: text('Принять как исключение', 'Accept as exception') }),
    ];
    openForm(
      text('Закрыть технический конфликт', 'Resolve technical conflict'),
      [
        selectDef('disposition', text('Решение', 'Disposition'), dispositions, option => option.name),
        optionalTextDef('note', text('Комментарий', 'Decision note'), '', 2000),
      ],
      async (values) => {
        const result = await mutate(`/v2/product-engineering/conflicts/${encodeURIComponent(conflict.id)}/resolve`, {
          expectedVersion: conflict.version,
          disposition: values.disposition,
          resolution: { note: values.note?.trim() || null },
        });
        invalidate(product.id);
        return result;
      },
      { successMessage: ['Технический конфликт зафиксирован.', 'Technical conflict decision recorded.'] },
    );
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
    const data = holder.data || { analyses: [], proposals: [], conflicts: [], drawings: [], sources: [], garmentGraph: null, changeCases: [] };
    const manage = manageAllowed(product);
    const wrap = el('div', { className: 'stack od-engineering-workspace' });
    const guard = notice(text(
      'AI здесь не является источником истины: он формирует evidence, proposal и conflict. Принятое предложение отдельно применяется через канонический контур.',
      'AI is not an authority here: it produces evidence, proposals and conflicts. An accepted proposal is applied separately through its canonical authority.',
    ));
    wrap.append(guard, summary(data));
    if (manage) {
      const actions = el('div', { className: 'od-inline-actions' });
      const upload = el('button', { className: 'button small primary', type: 'button', rawText: text('Добавить источник', 'Add source') });
      upload.addEventListener('click', () => uploadSource(item));
      const create = el('button', { className: 'button small', type: 'button', rawText: text('Новый анализ', 'New analysis') });
      create.addEventListener('click', () => requestAnalysis(item));
      const refresh = el('button', { className: 'button small', type: 'button', rawText: text('Обновить', 'Refresh') });
      refresh.addEventListener('click', () => { invalidate(product.id); });
      actions.append(upload, create, refresh);
      wrap.append(actions);
    }
    wrap.append(
      sourcesPanel(product, data.sources ?? [], manage),
      changeCasesPanel(product, data.changeCases ?? [], manage),
      garmentGraphPanel(data.garmentGraph ?? null),
      conflictsPanel(product, data.conflicts, manage),
      proposalsPanel(product, data.proposals, manage),
      drawingsPanel(product, data.drawings, manage),
      analysisPanel(product, data.analyses, manage),
    );
    return wrap;
  }

  root.SynthaProductEngineering = Object.freeze({ panel, load, invalidate });
})(window);
