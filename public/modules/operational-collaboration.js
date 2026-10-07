(function installOperationalCollaboration(global) {
  'use strict';

  const caps = global.SynthaUiCapabilities;
  if (!caps) throw new Error('SynthaUiCapabilities must load before operational-collaboration.js');

  const ui = {
    context: null,
    data: null,
    loading: false,
    error: '',
    activeTab: 'threads',
    selectedThreadId: null,
    busy: false,
    generation: 0,
    dialog: null,
  };

  const KINDS = Object.freeze(['general','clarification','fit','qc','sourcing','handoff']);
  const OUTCOMES = Object.freeze(['approved','rejected','accepted_with_risk','deferred','waived','recorded']);

  function text(ru, en) {
    if (typeof localText === 'function') return localText(ru, en);
    return global.I18N?.getLocale?.() === 'en' ? en : ru;
  }

  function h(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = String(value);
      else if (key === 'disabled') node.disabled = Boolean(value);
      else if (key === 'checked') node.checked = Boolean(value);
      else if (key === 'value') node.value = String(value);
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, String(value));
    }
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child === undefined || child === null || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function normalizeContext(input = {}) {
    const entityType = String(input.entityType ?? '').trim();
    const entityId = String(input.entityId ?? '').trim();
    if (!entityType || !entityId) throw new Error('OPERATIONAL_COLLABORATION_CONTEXT_REQUIRED');
    const organisationIds = [...new Set((input.organisationIds ?? []).map(String).filter(Boolean))];
    return Object.freeze({
      entityType,
      entityId,
      entityVersion: Number.isInteger(input.entityVersion) && input.entityVersion > 0 ? input.entityVersion : null,
      contentHash: /^[a-f0-9]{64}$/i.test(String(input.contentHash ?? '')) ? String(input.contentHash).toLowerCase() : null,
      organisationIds: Object.freeze(organisationIds),
      label: String(input.label ?? entityId),
    });
  }

  function activeMemberships() {
    return (Array.isArray(state.workspace?.memberships) ? state.workspace.memberships : []).filter((item) => item.status === 'active');
  }

  function resolveActingOrganisation(context, capability) {
    const normalized = normalizeContext(context);
    return activeMemberships()
      .filter((item) => !normalized.organisationIds.length || normalized.organisationIds.includes(item.organisationId))
      .find((item) => caps.hasForOrganisation(state.workspace, item.organisationId, capability))
      ?.organisationId ?? null;
  }

  function canRead(context) {
    return Boolean(resolveActingOrganisation(context, caps.CAPABILITIES.COLLABORATION_READ));
  }
  function canWrite(context) {
    return Boolean(resolveActingOrganisation(context, caps.CAPABILITIES.COLLABORATION_WRITE));
  }
  function canDecide(context) {
    return Boolean(resolveActingOrganisation(context, caps.CAPABILITIES.DECISION_RECORD));
  }

  function entityReference(context) {
    const normalized = normalizeContext(context);
    return {
      type: normalized.entityType,
      id: normalized.entityId,
      ...(normalized.entityVersion ? { version: normalized.entityVersion } : {}),
      ...(normalized.contentHash ? { contentHash: normalized.contentHash } : {}),
    };
  }

  function buildThreadInput(context, { title, kind = 'general' } = {}) {
    const normalized = normalizeContext(context);
    const ownerOrganisationId = resolveActingOrganisation(normalized, caps.CAPABILITIES.COLLABORATION_WRITE);
    if (!ownerOrganisationId) throw new Error('COLLABORATION_WRITE_REQUIRED');
    return Object.freeze({
      ownerOrganisationId,
      participantOrganisationIds: Object.freeze(normalized.organisationIds.filter((id) => id !== ownerOrganisationId)),
      entity: Object.freeze(entityReference(normalized)),
      title: String(title ?? '').trim(),
      kind,
    });
  }

  function buildDecisionInput(context, { threadId = null, decisionType, outcome, rationale, evidenceRefs = [], supersedesDecisionId = null } = {}) {
    const normalized = normalizeContext(context);
    const actingOrganisationId = resolveActingOrganisation(normalized, caps.CAPABILITIES.DECISION_RECORD);
    if (!actingOrganisationId) throw new Error('DECISION_RECORD_REQUIRED');
    return Object.freeze({
      actingOrganisationId,
      ...(threadId ? { threadId } : {}),
      entity: Object.freeze(entityReference(normalized)),
      decisionType: String(decisionType ?? '').trim(),
      outcome,
      rationale: String(rationale ?? '').trim(),
      evidenceRefs: Object.freeze([...new Set(evidenceRefs.map(String).filter(Boolean))]),
      ...(supersedesDecisionId ? { supersedesDecisionId } : {}),
    });
  }

  async function read(context, request = api) {
    const normalized = normalizeContext(context);
    return request(`/v2/operational/entities/${encodeURIComponent(normalized.entityType)}/${encodeURIComponent(normalized.entityId)}/collaboration`);
  }

  async function load() {
    if (!ui.context || ui.loading) return;
    const generation = ++ui.generation;
    ui.loading = true;
    ui.error = '';
    render();
    try {
      const data = await read(ui.context);
      if (generation !== ui.generation) return;
      ui.data = data;
      const openThreads = (data?.threads ?? []).filter((thread) => thread.status === 'open');
      if (!openThreads.some((thread) => thread.id === ui.selectedThreadId)) {
        ui.selectedThreadId = openThreads[0]?.id ?? data?.threads?.[0]?.id ?? null;
      }
    } catch (error) {
      if (generation === ui.generation) ui.error = error?.message || text('Не удалось загрузить обсуждение.', 'Could not load collaboration.');
    } finally {
      if (generation === ui.generation) {
        ui.loading = false;
        render();
      }
    }
  }

  function ensureDialog() {
    if (ui.dialog?.isConnected) return ui.dialog;
    const dialog = h('dialog', {
      className: 'operational-collaboration-inspector',
      'data-ods-role': 'inspector',
      'data-ods-part': 'surface',
      'aria-label': text('Обсуждение и решения', 'Discussion and decisions'),
    });
    dialog.addEventListener('close', () => {
      ui.context = null;
      ui.data = null;
      ui.error = '';
      ui.selectedThreadId = null;
      ui.generation += 1;
    });
    document.body.append(dialog);
    ui.dialog = dialog;
    return dialog;
  }

  function createButton(context, { compact = true } = {}) {
    const normalized = normalizeContext(context);
    if (!canRead(normalized)) return null;
    return h('button', {
      type: 'button',
      className: compact ? 'secondary operational-collaboration-trigger' : 'button operational-collaboration-trigger',
      'data-ods-role': 'button',
      text: text('Обсуждение', 'Discussion'),
      onclick: () => open(normalized),
    });
  }

  function open(context) {
    const normalized = normalizeContext(context);
    if (!canRead(normalized)) return;
    ui.context = normalized;
    ui.data = null;
    ui.error = '';
    ui.activeTab = 'threads';
    ui.selectedThreadId = null;
    const dialog = ensureDialog();
    render();
    if (!dialog.open) dialog.showModal();
    void load();
  }

  function close() {
    if (ui.dialog?.open) ui.dialog.close();
  }

  function tabButton(id, label, count) {
    const selected = ui.activeTab === id;
    return h('button', {
      type: 'button',
      className: selected ? 'active' : '',
      'aria-pressed': selected ? 'true' : 'false',
      text: count === undefined ? label : `${label} · ${count}`,
      onclick: () => { ui.activeTab = id; render(); },
    });
  }

  function render() {
    const dialog = ensureDialog();
    dialog.replaceChildren();
    if (!ui.context) return;

    const threads = Array.isArray(ui.data?.threads) ? ui.data.threads : [];
    const decisions = Array.isArray(ui.data?.decisions) ? ui.data.decisions : [];
    const header = h('header', { className: 'operational-collaboration-head', 'data-ods-part': 'section-head' }, [
      h('div', {}, [
        h('p', { className: 'eyebrow', text: text('ОПЕРАЦИОННЫЙ КОНТЕКСТ', 'OPERATIONAL CONTEXT') }),
        h('h2', { text: ui.context.label }),
        h('p', { className: 'muted', text: `${ui.context.entityType} · ${ui.context.entityId}` }),
      ]),
      h('button', { type: 'button', className: 'secondary', 'aria-label': text('Закрыть', 'Close'), text: '×', onclick: close }),
    ]);

    const tabs = h('nav', { className: 'operational-collaboration-tabs', 'data-ods-part': 'tabs' }, [
      tabButton('threads', text('Обсуждение', 'Discussion'), threads.length),
      tabButton('decisions', text('Решения', 'Decisions'), decisions.length),
    ]);

    const body = h('div', { className: 'operational-collaboration-body' }, [
      ui.loading ? h('p', { className: 'muted', text: text('Загрузка…', 'Loading…') }) : null,
      ui.error ? h('div', { className: 'operational-collaboration-alert', 'data-ods-part': 'alert' }, [
        h('strong', { text: text('Не удалось загрузить данные', 'Could not load data') }),
        h('p', { text: ui.error }),
        h('button', { type: 'button', className: 'secondary', text: text('Повторить', 'Retry'), onclick: () => void load() }),
      ]) : null,
      !ui.loading && !ui.error && ui.activeTab === 'threads' ? renderThreads(threads) : null,
      !ui.loading && !ui.error && ui.activeTab === 'decisions' ? renderDecisions(decisions, threads) : null,
    ]);

    dialog.append(header, tabs, body);
  }

  function renderThreads(threads) {
    const container = h('section', { className: 'operational-collaboration-panel' });
    if (!threads.length) container.append(h('div', { className: 'operational-collaboration-empty', 'data-ods-part': 'empty' }, [
      h('strong', { text: text('Обсуждений пока нет', 'No discussions yet') }),
      h('p', { className: 'muted', text: text('Создайте контекстное обсуждение — оно останется привязано к этому объекту.', 'Create a contextual discussion that stays linked to this entity.') }),
    ]));
    else {
      const list = h('div', { className: 'operational-thread-list', 'data-ods-part': 'list' });
      for (const thread of threads) {
        const selected = thread.id === ui.selectedThreadId;
        list.append(h('button', {
          type: 'button',
          className: selected ? 'operational-thread-item selected' : 'operational-thread-item',
          'data-ods-part': 'list-item',
          onclick: () => { ui.selectedThreadId = thread.id; render(); },
        }, [
          h('span', { text: thread.title }),
          h('small', { text: `${kindLabel(thread.kind)} · ${statusLabelSafe(thread.status)} · ${thread.messages?.length ?? 0}` }),
        ]));
      }
      container.append(list);
      const selected = threads.find((thread) => thread.id === ui.selectedThreadId) ?? threads[0];
      if (selected) container.append(renderThread(selected));
    }
    if (canWrite(ui.context)) container.append(renderNewThreadForm());
    return container;
  }

  function renderThread(thread) {
    const section = h('section', { className: 'operational-thread-detail', 'data-ods-part': 'card' }, [
      h('div', { className: 'operational-thread-title' }, [
        h('div', {}, [h('h3', { text: thread.title }), h('p', { className: 'muted', text: `${kindLabel(thread.kind)} · ${statusLabelSafe(thread.status)}` })]),
        thread.status === 'open' && canWrite(ui.context)
          ? h('button', { type: 'button', className: 'secondary', disabled: ui.busy, text: text('Завершить', 'Resolve'), onclick: () => void resolveThread(thread) })
          : null,
      ]),
    ]);
    const messages = h('div', { className: 'operational-message-list', 'data-ods-part': 'timeline' });
    for (const message of thread.messages ?? []) {
      messages.append(h('article', { className: 'operational-message', 'data-ods-part': 'timeline-item' }, [
        h('div', { className: 'operational-message-meta' }, [
          h('strong', { text: organisationName(message.authorOrganisationId) }),
          h('time', { datetime: message.createdAt, text: formatDateTime(message.createdAt) }),
        ]),
        h('p', { text: message.body }),
        message.evidenceRefs?.length ? h('small', { text: `${text('Доказательства', 'Evidence')}: ${message.evidenceRefs.join(', ')}` }) : null,
      ]));
    }
    if (!(thread.messages?.length)) messages.append(h('p', { className: 'muted', text: text('Сообщений пока нет.', 'No messages yet.') }));
    section.append(messages);
    if (thread.status === 'open' && canWrite(ui.context)) section.append(renderMessageForm(thread));
    return section;
  }

  function renderNewThreadForm() {
    const form = h('form', { className: 'operational-collaboration-form', 'data-ods-part': 'form' });
    const title = h('input', { name: 'title', required: 'required', maxlength: '200', placeholder: text('Тема обсуждения', 'Discussion title') });
    const kind = h('select', { name: 'kind' }, KINDS.map((value) => h('option', { value, text: kindLabel(value) })));
    const submit = h('button', { type: 'submit', className: 'primary', disabled: ui.busy, text: text('Начать обсуждение', 'Start discussion') });
    form.append(h('h3', { text: text('Новое обсуждение', 'New discussion') }), title, kind, submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!title.value.trim()) return;
      void createThread({ title: title.value, kind: kind.value });
    });
    return form;
  }

  function renderMessageForm(thread) {
    const form = h('form', { className: 'operational-collaboration-form compact', 'data-ods-part': 'form' });
    const body = h('textarea', { name: 'body', required: 'required', maxlength: '5000', rows: '3', placeholder: text('Сообщение по этому объекту…', 'Message about this entity…') });
    const submit = h('button', { type: 'submit', className: 'primary', disabled: ui.busy, text: text('Отправить', 'Send') });
    form.append(body, submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!body.value.trim()) return;
      void postMessage(thread, body.value);
    });
    return form;
  }

  function renderDecisions(decisions, threads) {
    const container = h('section', { className: 'operational-collaboration-panel' });
    if (!decisions.length) container.append(h('div', { className: 'operational-collaboration-empty', 'data-ods-part': 'empty' }, [
      h('strong', { text: text('Решений пока нет', 'No decisions yet') }),
      h('p', { className: 'muted', text: text('Решение — отдельный неизменяемый факт, а не сообщение в чате.', 'A decision is an immutable fact, not a chat message.') }),
    ]));
    const superseded = new Set(decisions.map((item) => item.supersedesDecisionId).filter(Boolean));
    const list = h('div', { className: 'operational-decision-list', 'data-ods-part': 'timeline' });
    for (const decision of [...decisions].reverse()) {
      list.append(h('article', { className: superseded.has(decision.id) ? 'operational-decision superseded' : 'operational-decision', 'data-ods-part': 'timeline-item' }, [
        h('div', { className: 'operational-decision-meta' }, [
          h('strong', { text: decision.decisionType }),
          h('span', { className: 'badge', text: outcomeLabel(decision.outcome) }),
        ]),
        h('p', { text: decision.rationale }),
        h('small', { text: `${organisationName(decision.decidedByOrganisationId)} · ${formatDateTime(decision.decidedAt)}` }),
        superseded.has(decision.id) ? h('small', { text: text('Заменено последующим решением', 'Superseded by a later decision') }) : null,
      ]));
    }
    container.append(list);
    if (canDecide(ui.context)) container.append(renderDecisionForm(decisions, threads));
    return container;
  }

  function renderDecisionForm(decisions, threads) {
    const form = h('form', { className: 'operational-collaboration-form', 'data-ods-part': 'form' });
    const decisionType = h('input', { name: 'decisionType', required: 'required', maxlength: '120', placeholder: text('Тип решения', 'Decision type') });
    const outcome = h('select', { name: 'outcome' }, OUTCOMES.map((value) => h('option', { value, text: outcomeLabel(value) })));
    const rationale = h('textarea', { name: 'rationale', required: 'required', maxlength: '4000', rows: '4', placeholder: text('Основание решения', 'Decision rationale') });
    const thread = h('select', { name: 'threadId' }, [
      h('option', { value: '', text: text('Без привязки к обсуждению', 'No discussion link') }),
      ...threads.filter((item) => item.status !== 'archived').map((item) => h('option', { value: item.id, text: item.title })),
    ]);
    const current = decisions.filter((item) => !decisions.some((candidate) => candidate.supersedesDecisionId === item.id));
    const supersedes = h('select', { name: 'supersedesDecisionId' }, [
      h('option', { value: '', text: text('Новое решение', 'New decision') }),
      ...current.map((item) => h('option', { value: item.id, text: `${item.decisionType} · ${outcomeLabel(item.outcome)}` })),
    ]);
    form.append(
      h('h3', { text: text('Зафиксировать решение', 'Record decision') }),
      decisionType, outcome, rationale, thread, supersedes,
      h('button', { type: 'submit', className: 'primary', disabled: ui.busy, text: text('Зафиксировать', 'Record') }),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!decisionType.value.trim() || !rationale.value.trim()) return;
      void createDecision({
        decisionType: decisionType.value,
        outcome: outcome.value,
        rationale: rationale.value,
        threadId: thread.value || null,
        supersedesDecisionId: supersedes.value || null,
      });
    });
    return form;
  }

  async function createThread(input) {
    await run(async () => {
      const created = await mutate('/v2/operational/threads', buildThreadInput(ui.context, input));
      ui.selectedThreadId = created.id;
    });
  }

  async function postMessage(thread, body) {
    const actingOrganisationId = resolveActingOrganisation(ui.context, caps.CAPABILITIES.COLLABORATION_WRITE);
    await run(() => mutate(`/v2/operational/threads/${encodeURIComponent(thread.id)}/messages`, { actingOrganisationId, body }));
  }

  async function resolveThread(thread) {
    const actingOrganisationId = resolveActingOrganisation(ui.context, caps.CAPABILITIES.COLLABORATION_WRITE);
    await run(() => mutate(`/v2/operational/threads/${encodeURIComponent(thread.id)}/resolve`, { actingOrganisationId, expectedVersion: thread.version }));
  }

  async function createDecision(input) {
    await run(() => mutate('/v2/operational/decisions', buildDecisionInput(ui.context, input)));
  }

  async function run(work) {
    if (ui.busy) return;
    ui.busy = true;
    render();
    try {
      await work();
      await load();
    } catch (error) {
      ui.error = error?.message || text('Операция не выполнена.', 'Operation failed.');
      render();
    } finally {
      ui.busy = false;
      render();
    }
  }

  function kindLabel(value) {
    const labels = {
      general: ['Общее', 'General'], clarification: ['Уточнение', 'Clarification'], fit: ['Посадка', 'Fit'],
      qc: ['Качество', 'Quality'], sourcing: ['Закупка', 'Sourcing'], handoff: ['Передача', 'Handoff'], exception: ['Проблема', 'Exception'],
    };
    const pair = labels[value] ?? [value, value];
    return text(pair[0], pair[1]);
  }

  function outcomeLabel(value) {
    const labels = {
      approved: ['Одобрено', 'Approved'], rejected: ['Отклонено', 'Rejected'],
      accepted_with_risk: ['Принято с риском', 'Accepted with risk'], deferred: ['Отложено', 'Deferred'],
      waived: ['Не требуется', 'Waived'], recorded: ['Зафиксировано', 'Recorded'],
    };
    const pair = labels[value] ?? [value, value];
    return text(pair[0], pair[1]);
  }

  function statusLabelSafe(value) {
    return typeof statusLabel === 'function' ? statusLabel(value) : value;
  }

  function organisationName(id) {
    const organisation = (state.workspace?.organisations ?? []).find((item) => item.id === id);
    return organisation?.name || organisation?.legalName || id;
  }

  function formatDateTime(value) {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return '—';
    return new Intl.DateTimeFormat(global.I18N?.localeTag?.() || undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(parsed));
  }

  global.addEventListener?.('syntha:locale-changed', () => { if (ui.dialog?.open) render(); });
  global.addEventListener?.('syntha:mutated', (event) => {
    const path = String(event?.detail?.path ?? '');
    if (ui.dialog?.open && path.startsWith('/v2/operational/')) void load();
  });

  global.SynthaOperationalCollaboration = Object.freeze({
    open, close, createButton, read, normalizeContext, resolveActingOrganisation, buildThreadInput, buildDecisionInput,
    canRead, canWrite, canDecide,
  });
})(window);
