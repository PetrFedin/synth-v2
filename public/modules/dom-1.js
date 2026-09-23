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
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m14 6-6 6 6 6"/></svg>',
  // Thirty sections shared eight glyphs, so eight of them — costing, measurement charts, RFQs,
  // quotations, quality, assortments, prices, tasks — were drawn with the identical mark. With the
  // sidebar collapsed to its rail the icon is the only thing on screen, and those eight sections
  // became indistinguishable from one another. Each section that a person navigates to by sight
  // now has a mark of its own, in the same 24px stroke language as the originals.
  planning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 20V4M4 20h16"/><path d="M7.5 8.5h6M7.5 13h10M7.5 17h4"/></svg>',
  styles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 3.5 6 5 3.5 8l2.5 2v10h12V10l2.5-2L18 5l-3-1.5"/><path d="M9 3.5a3 3 0 0 0 6 0"/></svg>',
  materials: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 4h12v16H6z"/><path d="M6 8h12M6 12h12M6 16h12"/><path d="M10 4v16M14 4v16"/></svg>',
  costing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5"/><path d="M15.5 13.5v5M13.5 15h3.2a1.3 1.3 0 0 1 0 2.6h-3.2"/></svg>',
  measurements: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 9h18v6H3z"/><path d="M7 9v3M11 9v4M15 9v3M19 9v4"/></svg>',
  samples: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12.5 3H20v7.5l-9 9L3.5 12z"/><circle cx="16.5" cy="7" r="1.4"/></svg>',
  techpack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3.5 6.5h6l2 2.5h9V20h-17z"/><path d="M8 13h8M8 16.5h5"/></svg>',
  rfq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 3h8l4 4v9H6z"/><path d="M14 3v4h4"/><path d="M9.5 19.5h11M17.5 16.5l3 3-3 3"/></svg>',
  quotation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12.5 3.5H20V11l-8.5 8.5L4 12z"/><circle cx="16.4" cy="7.1" r="1.3"/><path d="M8.5 11.5h4M9.5 14.2h3"/></svg>',
  production: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 20V10l5 3V10l5 3V10l5 3V20z"/><path d="M18 10V4h3v6"/><path d="M7 16h2M13 16h2"/></svg>',
  productionOrder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m12 3 8 4v10l-8 4-8-4V7z"/><path d="m4 7 8 4 8-4M12 11v10"/></svg>',
  timeline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 6h10M4 12h14M4 18h7"/><circle cx="17" cy="6" r="2"/><circle cx="14" cy="18" r="2"/></svg>',
  quality: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3.2 19.5 6v6c0 4.4-3 7.5-7.5 8.8C7.5 19.5 4.5 16.4 4.5 12V6z"/><path d="m8.8 12.2 2.3 2.3 4.1-4.6"/></svg>',
  logistics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2.5 6.5h11v9h-11z"/><path d="M13.5 9.5H17l3 3v3h-6.5"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/></svg>',
  linesheet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3.5 5h17v14h-17z"/><path d="M3.5 9.5h17M9 9.5V19M14.5 9.5V19"/></svg>',
  buyers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 8.5 5.5 4h13L20 8.5v2.2H4z"/><path d="M5.5 10.7V20h13v-9.3"/><circle cx="12" cy="14" r="1.8"/><path d="M8.8 20c0-2 1.4-3.2 3.2-3.2s3.2 1.2 3.2 3.2"/></svg>',
  reorder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 7.5v4h-4M4 16.5v-4h4"/><path d="M5.6 10A7 7 0 0 1 18.4 8.4M18.4 14A7 7 0 0 1 5.6 15.6"/></svg>',
  pricing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 3.5h14v17H5z"/><path d="m9 15.5 6-7"/><circle cx="9.4" cy="9.4" r="1.4"/><circle cx="14.6" cy="14.6" r="1.4"/></svg>',
  payments: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 6h18v12H3z"/><path d="M3 10h18"/><path d="M6.5 14.5h4"/></svg>',
  libraries: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 4h4v16H5zM10.5 4h4v16h-4z"/><path d="m16.2 5.1 3.3 1-3.4 13.2-3.1-.9"/></svg>',
  analytics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 20V4M4 20h16"/><path d="M8 20v-6M12.5 20V8.5M17 20v-9"/></svg>',
  tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M11 6.5h9M11 12h9M11 17.5h6"/><path d="m3.5 6.3 1.4 1.4 2.4-2.6M3.5 11.8l1.4 1.4 2.4-2.6M3.5 17.3l1.4 1.4 2.4-2.6"/></svg>',
  suppliers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 20V9.5L8 7v2.5L13 7v2.5L18 7v13z"/><path d="M18 9V4.5h3V20"/><path d="M6.5 16h2M11 16h2"/></svg>'
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
    el('div', { className: 'entity-title', rawText: title || I18N.translate('Без названия') }),
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
      ? localText('Загрузка…', 'Loading…')
      : status.state === 'error'
        ? localText('Повторить', 'Retry')
        : localText('Загрузить ещё', 'Load more');
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

// Asking somebody to confirm something is part of the product, so it looks like the product. A native
// window.confirm cannot be translated, carries the browser's own chrome, blocks the page while it is
// open, and looked nothing like the styled confirmations the rest of the application already used.
// One helper, so no screen has to decide this for itself.
function confirmAction({ title, question, confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    const modal = el('dialog', { className: 'app-confirm' });
    const form = el('form', { method: 'dialog' });
    const heading = el('header');
    heading.append(el('h2', { rawText: title }));
    const body = el('p', { className: 'app-confirm-question', rawText: question });
    const footer = el('footer');
    const cancel = el('button', { className: 'button secondary', type: 'button', rawText: I18N.t('common.cancel') });
    const accept = el('button', { className: `button ${danger ? 'danger' : 'primary'}`, type: 'submit', rawText: confirmLabel });
    let answered = false;
    const settle = (value) => { if (answered) return; answered = true; resolve(value); };
    cancel.addEventListener('click', () => { settle(false); modal.close(); });
    form.addEventListener('submit', (event) => { event.preventDefault(); settle(true); modal.close(); });
    // Escape and the backdrop both mean "no", and both must answer the caller waiting on this.
    modal.addEventListener('close', () => { settle(false); modal.remove(); }, { once: true });
    footer.append(cancel, accept);
    form.append(heading, body, footer);
    modal.append(form);
    document.body.append(modal);
    modal.showModal();
    accept.focus();
  });
}

function actionButton(label, fn, variant = '', confirmText = '') {
  const button = el('button', { className: `button small ${variant}`.trim(), text: label, type: 'button' });
  button.addEventListener('click', async () => {
    if (confirmText) {
      const question = I18N.translate(confirmText);
      const accepted = await confirmAction({
        title: label,
        question,
        confirmLabel: label,
        danger: String(variant).includes('danger'),
      });
      if (!accepted) return;
    }
    runAction(async () => {
      await fn();
      // Some actions only open a form; the work happens when that form is submitted. Reloading and
      // re-rendering here would destroy the dialog, and the success toast would be a lie.
      if (document.querySelector('dialog[open]')) return;
      await reload();
      renderApp();
      toast(I18N.t('common.operationComplete'), 'success');
    }, button);
  });
  return button;
}

function statusBadge(status) { return el('span', { className: `badge ${String(status).toLowerCase()}`, rawText: statusLabel(status) }); }
// Отказ по правам показывается как **состояние раздела**, а не как ошибка: красная плашка «не
// удалось загрузить» предлагает повторить, а повторять нечего — роль та же. Отдельный вид говорит,
// что раздел существует и закрыт, и это разные новости.
//
// Разделы хранят от упавшего запроса **только текст**, без самой ошибки, поэтому признак отказа
// приходится узнавать по нему. Это не разбор прозы: сравнение идёт с той же строкой, которую в
// этом же рантайме выдал `I18N.t('common.forbidden')` — транспорт ставит её сам и только на 403.
// Если строка когда-нибудь разойдётся, плашка вернётся к обычному виду ошибки, то есть к тому, что
// было до этой правки: деградация молчаливая и безопасная.
function isForbiddenText(text) {
  return typeof text === 'string' && text === I18N.t('common.forbidden');
}
function notice(text, type = '') {
  const kind = type === 'error' && isForbiddenText(text) ? 'denied' : type;
  return el('div', { className: `notice ${kind}`.trim(), text });
}
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
    const control = el('select', { name: field.name });
    control.required = field.required !== false;
    field.options.forEach(option => {
      const value = typeof option === 'string' ? option : option.id;
      const text = field.format ? field.format(option) : (typeof option === 'string' ? option : (option.name || option.id));
      const optionNode = el('option',{value,rawText:text});
      if (field.value !== undefined && String(field.value) === String(value)) optionNode.selected = true;
      control.append(optionNode);
    });
    label.append(control);
    return { label, control };
  }
  const built = inputField(field.label, field.kind === 'number' ? 'number' : field.kind, {
    name: field.name,
    value: field.value ?? '',
    step: field.kind === 'number' ? (field.integer ? '1' : '0.01') : undefined,
    min: field.min ?? (field.kind === 'number' ? '0' : undefined),
    maxlength: field.maxLength,
    // Пример значения. Поле, которое просит непрозрачный идентификатор, обязано показать, как он
    // выглядит: иначе человек смотрит на пустую строку и не знает, что туда писать.
    placeholder: field.placeholder,
  });
  built.control.required = field.required !== false;
  return built;
}

function textDef(name, label, value = '', maxLength = 160, required = true) { return { name, label, kind: 'text', value, maxLength, required }; }
function optionalTextDef(name, label, value = '', maxLength = 160) { return textDef(name, label, value, maxLength, false); }
function dateDef(name, label, value = '') { return { name, label, kind: 'date', value }; }
function dateTimeDef(name, label, value = '') { return { name, label, kind: 'datetime-local', value }; }
function numberDef(name, label, value, integer, min = 0) { return { name, label, kind: 'number', value, integer, min }; }
function selectDef(name, label, options, format, value) { return { name, label, kind: 'select', options, format, value }; }
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