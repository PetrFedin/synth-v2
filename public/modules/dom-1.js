const ICONS = Object.freeze({
  overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 10v9h13v-9M9 19v-6h6v6"/></svg>',
  partners: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.8 19c.4-3.7 2.2-5.5 5.2-5.5s4.8 1.8 5.2 5.5M13.8 14.3c.8-.8 1.8-1.2 3.2-1.2 2.5 0 4 1.5 4.3 4.5"/></svg>',
  catalog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m12 3 8 4.2-8 4.2-8-4.2L12 3Z"/><path d="m4 11.5 8 4.2 8-4.2M4 15.8l8 4.2 8-4.2"/></svg>',
  showrooms: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7.5 6 3h12l2 4.5"/><path d="M4 7.5h16V21H4zM8 21v-7h8v7"/><path d="M3 7.5c0 1.6 1 2.8 2.5 2.8S8 9.1 8 7.5c0 1.6 1 2.8 2.5 2.8S13 9.1 13 7.5c0 1.6 1 2.8 2.5 2.8S18 9.1 18 7.5c0 1.6 1 2.8 2.5 2.8"/></svg>',
  selections: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/><path d="m16.5 15 1.4 1.4 2.7-3"/></svg>',
  orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 4h12v16H6zM9 2h6v4H9zM9 10h6M9 14h6M9 18h4"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5h16v15H4zM8 2v6M16 2v6M4 10h16"/><path d="M8 14h3M13 14h3M8 17h3"/></svg>',
  notifications: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9M9.5 20h5"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 6v5h-5M4 18v-5h5"/><path d="M6.1 8.2A7 7 0 0 1 18.9 6L20 11M4 13l1.1 5A7 7 0 0 0 18 15.8"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"/></svg>',
  collapse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M19 4H5v16h14zM10 4v16M15 9l-3 3 3 3"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M19 4H5v16h14zM10 4v16M13 9l3 3-3 3"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9M9.5 20h5"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 21V7l8-4 8 4v14M8 9h2M14 9h2M8 13h2M14 13h2M9 21v-4h6v4"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m14 6-6 6 6 6"/></svg>'
});

function icon(name, className = '') {
  const node = el('span', { className: `icon ${className}`.trim(), ariaHidden: 'true' });
  node.innerHTML = ICONS[name] || ICONS.catalog;
  return node;
}

function entity(title, status, metadata, actions) {
  const box = el('article', { className: 'entity', tabindex: '0' });
  const head = el('div', { className: 'entity-head' });
  const titleBlock = el('div', { className: 'entity-title-block' });
  titleBlock.append(
    el('div', { className: 'entity-title', rawText: title || I18N.translate('\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044f') }),
    el('div', { className: 'entity-code', rawText: String(title || '').slice(0, 42) }),
  );
  head.append(titleBlock, statusBadge(status));
  box.append(head);
  const meta = el('div', { className: 'meta' });
  metadata.filter(Boolean).forEach(value => meta.append(el('span', { rawText: translateDataText(value) })));
  box.append(meta);
  if (actions.length) {
    const row = el('div', { className: 'row entity-actions' });
    actions.forEach(action => row.append(action));
    box.append(row);
  } else {
    box.append(el('div', { className: 'entity-actions' }));
  }
  return box;
}

function sectionCard(title, children, buttonLabel, onButton, pagingSection) {
  const card = el('section', { className: 'card section' });
  const tools = el('div', { className: 'toolbar section-toolbar' });
  const heading = el('div', { className: 'section-heading' });
  const count = children.filter(child => !child.classList?.contains('empty')).length;
  heading.append(el('h3', { text: title }), el('span', { className: 'section-count', rawText: String(count) }));
  tools.append(heading);
  if (buttonLabel && typeof onButton === 'function') {
    const button = el('button', { className: 'button small', text: buttonLabel, type: 'button' });
    button.addEventListener('click', onButton);
    tools.append(button);
  }
  const paging = window.SynthaWorkspaceController;
  if (pagingSection && paging?.hasMore(pagingSection)) {
    const status = paging.status(pagingSection);
    const label = status.state === 'loading'
      ? localText('\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026', 'Loading\u2026')
      : status.state === 'error'
        ? localText('\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c', 'Retry')
        : localText('\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0435\u0449\u0451', 'Load more');
    const button = el('button', { className: 'button small', rawText: label, type: 'button' });
    button.disabled = status.state === 'loading';
    button.addEventListener('click', () => { void paging.loadNext(pagingSection); });
    tools.append(button);
  }
  const stack = el('div', { className: 'stack' });
  children.forEach(child => stack.append(child));
  card.append(tools, stack);
  return card;
}

function toolbar(title, buttonLabel, action) {
  const bar = el('div', { className: 'toolbar view-toolbar' });
  const copy = el('div', { className: 'view-toolbar-copy' });
  copy.append(
    el('p', { className: 'toolbar-kicker', rawText: 'WORKSPACE' }),
    el('p', { className: 'muted', text: title }),
  );
  bar.append(copy);
  if (buttonLabel && typeof action === 'function') {
    const button = el('button', { className: 'button primary', text: buttonLabel, type: 'button' });
    button.addEventListener('click', action);
    bar.append(button);
  }
  return bar;
}

function kpi(label, value) {
  const card = el('article', { className: 'card kpi' });
  card.append(
    el('span', { className: 'kpi-marker', ariaHidden: 'true' }),
    el('span', { className: 'muted', text: label }),
    el('strong', { rawText: String(value) }),
  );
  return card;
}

function actionButton(label, fn, variant = '', confirmText = '') {
  const button = el('button', { className: `button small ${variant}`.trim(), text: label, type: 'button' });
  button.addEventListener('click', () => {
    if (confirmText && !window.confirm(I18N.translate(confirmText))) return;
    runAction(async () => {
      await fn();
      await reload();
      renderApp();
      toast(I18N.t('common.operationComplete'), 'success');
    }, button);
  });
  return button;
}

function statusBadge(status) { return el('span', { className: `badge ${String(status).toLowerCase()}`, rawText: statusLabel(status) }); }
function notice(text, type = '') { return el('div', { className: `notice ${type}`.trim(), text }); }
function empty(text) { return el('div', { className: 'empty', text }); }
function dialogHost() { return el('dialog', { id: 'form-dialog' }); }

function brandBlock() {
  const brand = el('div', { className: 'brand' });
  const mark = el('div', { className: 'brand-mark', ariaHidden: 'true' });
  mark.append(
    el('span', { className: 'brand-facet facet-left' }),
    el('span', { className: 'brand-facet facet-center' }),
    el('span', { className: 'brand-facet facet-right' }),
  );
  const copy = el('div', { className: 'brand-copy' });
  copy.append(el('h1', { rawText: 'SYNTHA' }), el('small', { rawText: 'Fashion Operating System' }));
  brand.append(mark, copy);
  return brand;
}

function clear(node) { while (node.firstChild) node.firstChild.remove(); }
function el(tag, props = {}) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'rawText') node.textContent = String(value);
    else if (key === 'text') node.textContent = I18N.translate(String(value));
    else if (key === 'className') node.className = value;
    else if (key === 'ariaLabel') node.setAttribute('aria-label', I18N.translate(String(value)));
    else if (key === 'ariaPressed') node.setAttribute('aria-pressed', String(value));
    else if (key === 'ariaHidden') node.setAttribute('aria-hidden', String(value));
    else if (key === 'title' || key === 'placeholder') node.setAttribute(key, I18N.translate(String(value)));
    else if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  }
  return node;
}

function inputField(labelText, type, attrs = {}) {
  const label = el('label');
  label.append(el('span', { text: labelText }));
  const control = el('input', { type, ...attrs });
  label.append(control);
  return { label, control };
}

function buildField(field) {
  if (field.kind === 'select') {
    const label = el('label');
    label.append(el('span', { text: field.label }));
    const control = el('select', { name: field.name, required: true });
    field.options.forEach(option => {
      const value = typeof option === 'string' ? option : option.id;
      const text = field.format ? field.format(option) : (typeof option === 'string' ? option : (option.name || option.id));
      control.append(el('option',{value,rawText:text}));
    });
    label.append(control);
    return { label, control };
  }
  return inputField(field.label, field.kind === 'number' ? 'number' : field.kind, {
    name: field.name,
    required: true,
    value: field.value ?? '',
    step: field.kind === 'number' ? (field.integer ? '1' : '0.01') : undefined,
    min: field.min ?? (field.kind === 'number' ? '0' : undefined),
    maxlength: field.maxLength,
  });
}

function textDef(name, label, value = '', maxLength = 160) { return { name, label, kind: 'text', value, maxLength }; }
function dateDef(name, label) { return { name, label, kind: 'date' }; }
function dateTimeDef(name, label) { return { name, label, kind: 'datetime-local' }; }
function numberDef(name, label, value, integer, min = 0) { return { name, label, kind: 'number', value, integer, min }; }
function selectDef(name, label, options, format) { return { name, label, kind: 'select', options, format }; }
function showInlineError(form, message) { form.querySelector('.notice.error')?.remove(); form.prepend(notice(message, 'error')); }
function setButtonBusy(button, busy, text) { button.disabled = busy; button.textContent = I18N.translate(String(text)); }

async function runAction(action, button) {
  if (state.busy || button.disabled) return;
  state.busy = true;
  const old = button.textContent;
  setButtonBusy(button, true, I18N.t('common.processing'));
  try { await action(); }
  catch (error) {
    toast(error.message, 'error');
    if (!state.token) renderLogin(I18N.t('auth.sessionEnded'));
  } finally {
    state.busy = false;
    if (button.isConnected) setButtonBusy(button, false, old);
  }
}
