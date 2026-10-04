// `valueFor(значение родителя)` — выбор по умолчанию, который зависит от родителя (например, точка
// подборки для выбранной подборки). Применяется при первой отрисовке и каждый раз, когда родитель
// меняется; после неудачной отправки выбор человека не сбрасывается.
function dependentSelectDef(name, label, dependsOn, optionsFor, format, value, emptyMessage, valueFor) {
  return { name, label, kind: 'select', options: [], dependsOn, optionsFor, format, value, emptyMessage, valueFor };
}

// Четвёртый параметр — что делать после успешного сохранения (оба поля необязательны):
//   successMessage — [ru, en]: тост «Готово: …» вместо общего «Изменения сохранены»;
//   afterSave — вернуть человека туда, откуда открыта форма (например, перечитать диалог с
//   долгоживущим состоянием): вызывается после перечитывания рабочего пространства и перерисовки,
//   тост показывается после него, чтобы лечь в только что открытый диалог.
function openForm(title, fields, submitAction, options = {}) {
  const unavailable = fields.find(field => field.kind === 'select' && !field.dependsOn && field.options.length === 0);
  if (unavailable) { toast(I18N.t('common.noData', { label: I18N.translate(unavailable.label) }), 'error'); return; }
  const dialog = document.querySelector('#form-dialog'); clear(dialog);
  const body = el('div', { className: 'dialog-body' });
  const close = el('button', { className: 'button secondary', text: I18N.t('common.close'), type: 'button' });
  const head = el('div', { className: 'dialog-head' }); head.append(el('h3', { text: title }));
  const form = el('form'); const grid = el('div', { className: 'form-grid' });
  const controls = new Map();
  const labels = new Map();
  fields.forEach(field => { const built = buildField(field); controls.set(field.name, built.control); labels.set(field.name, built.label); grid.append(built.label); });
  // Поле может показываться только при определённом значении другого поля (`visibleWhen(значение
  // поля dependsOn)`): цены по вариантам относятся к выбранному коммерческому снимку, и поля чужого
  // снимка не должны ни мешать форме, ни уходить на сервер. Скрытое поле отключено — браузер не
  // проверяет его и не отправляет, а в `values` оно отсутствует.
  const refreshVisibleFields = () => {
    fields.filter(field => typeof field.visibleWhen === 'function').forEach(field => {
      const parent = controls.get(field.dependsOn);
      const visible = Boolean(parent && field.visibleWhen(parent.value));
      labels.get(field.name).hidden = !visible;
      controls.get(field.name).disabled = !visible;
    });
  };
  const submit = el('button', { className: 'button primary', text: I18N.t('common.save'), type: 'submit' });
  // Closing and saving are the two answers to the same question, so they sit together at the end of
  // the form. This dialog used to put Close at the top right and stretch Save across the full width,
  // while every other dialog in the application offered the pair, right-aligned, in a footer.
  const actions = el('footer', { className: 'dialog-actions' });
  actions.append(close, submit);
  form.append(grid, actions);

  const setSelectOptions = (field, options, forced) => {
    const control = controls.get(field.name);
    const preferred = forced || control.value || field.value;
    clear(control);
    options.forEach(option => {
      const value = typeof option === 'string' ? option : option.id;
      const text = field.format ? field.format(option) : (typeof option === 'string' ? option : (option.name || option.id));
      const optionNode = el('option', { value, rawText: text });
      // Подсказка к пункту — для того, что человеку не нужно читать, но нужно назвать в поддержку (короткий код).
      const hint = typeof field.optionTitle === 'function' && typeof option === 'object' ? field.optionTitle(option) : undefined;
      if (hint) optionNode.setAttribute('title', hint);
      if (preferred !== undefined && String(preferred) === String(value)) optionNode.selected = true;
      control.append(optionNode);
    });
    control.disabled = options.length === 0;
  };

  const lastParentValue = new Map();
  const refreshDependentFields = () => {
    const blocked = [];
    fields.filter(field => field.kind === 'select' && field.dependsOn).forEach(field => {
      const parent = controls.get(field.dependsOn);
      const options = parent && typeof field.optionsFor === 'function' ? field.optionsFor(parent.value) : [];
      // Умолчание по родителю выбирается только когда родитель действительно сменился.
      const parentChanged = parent && lastParentValue.get(field.name) !== parent.value;
      if (parent) lastParentValue.set(field.name, parent.value);
      const forced = parentChanged && typeof field.valueFor === 'function' ? field.valueFor(parent.value) : '';
      setSelectOptions(field, Array.isArray(options) ? options : [], forced);
      if (!options?.length) blocked.push(field.emptyMessage || I18N.t('common.noData', { label: I18N.translate(field.label) }));
    });
    form.querySelector('.dependent-field-notice')?.remove();
    if (blocked.length) {
      const message = notice(blocked[0], 'error');
      message.classList.add('dependent-field-notice');
      form.prepend(message);
    }
    submit.disabled = blocked.length > 0;
  };

  fields.filter(field => field.kind === 'select' && field.dependsOn).forEach(field => {
    controls.get(field.dependsOn)?.addEventListener('change', refreshDependentFields);
  });
  fields.filter(field => typeof field.visibleWhen === 'function').forEach(field => {
    controls.get(field.dependsOn)?.addEventListener('change', refreshVisibleFields);
  });
  refreshDependentFields();
  refreshVisibleFields();

  const snapshot = () => JSON.stringify(fields.map(field => [field.name, controls.get(field.name).value]));
  const baseline = snapshot();
  let submitting = false;
  let saved = false;
  let disposed = false;
  const isDirty = () => snapshot() !== baseline;
  const shouldBlockNavigation = () => !saved && (submitting || isDirty());

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener('beforeunload', beforeUnload);
    dialog.removeEventListener('cancel', cancelDialog);
  };
  const beforeUnload = event => {
    if (!shouldBlockNavigation()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  // Asking "discard your edits?" through the browser's own box was the last native dialog left in the
  // application. Nobody reads the return value of this, so it can wait for a styled answer.
  const requestClose = async () => {
    if (submitting) return false;
    if (isDirty()) {
      const accepted = await confirmAction({
        title: I18N.t('common.unsavedChangesTitle'),
        question: I18N.t('common.unsavedChangesConfirm'),
        confirmLabel: I18N.t('common.discardChanges'),
        danger: true,
      });
      if (!accepted) return false;
    }
    dialog.close();
    return true;
  };
  const cancelDialog = event => {
    if (!shouldBlockNavigation()) return;
    event.preventDefault();
    void requestClose();
  };

  close.addEventListener('click', () => { void requestClose(); });
  dialog.addEventListener('cancel', cancelDialog);
  dialog.addEventListener('close', cleanup, { once: true });
  window.addEventListener('beforeunload', beforeUnload);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || submit.disabled) return;
    submitting = true;
    close.disabled = true;
    setButtonBusy(submit, true, I18N.t('common.saving'));
    try {
      const values = {};
      fields.forEach(field => {
        const control = controls.get(field.name);
        if (typeof field.visibleWhen === 'function' && control.disabled) return;
        const raw = control.value;
        // Необязательное числовое поле, оставленное пустым, — «не задано», а не ноль.
        if (field.kind === 'number' && field.required === false && raw === '') { values[field.name] = null; return; }
        values[field.name] = field.kind === 'number' ? (field.integer ? Number.parseInt(raw, 10) : Number(raw)) : raw;
      });
      await submitAction(values);
      saved = true;
      dialog.close();
      try {
        await reload();
        renderApp();
        if (typeof options.afterSave === 'function') await options.afterSave();
        if (Array.isArray(options.successMessage)) toastDone(options.successMessage[0], options.successMessage[1]);
        else toast(I18N.t('common.changesSaved'), 'success');
      } catch (refreshError) {
        toast(`${I18N.t('common.savedRefreshFailed')} ${refreshError.message}`, 'error');
      }
    } catch (error) {
      showInlineError(form, error.message);
    } finally {
      submitting = false;
      close.disabled = false;
      if (submit.isConnected) {
        setButtonBusy(submit, false, I18N.t('common.save'));
        refreshDependentFields();
        // Список зависимых полей включает отключённые, а скрытое поле должно оставаться отключённым.
        refreshVisibleFields();
      }
    }
  });
  body.append(head, form); dialog.append(body); dialog.showModal();
}

function openDetails(title, rows) {
  const dialog = document.querySelector('#form-dialog'); clear(dialog);
  const body = el('div', { className: 'dialog-body' });
  const close = el('button', { className: 'button small', text: I18N.t('common.close'), type: 'button' });
  const head = el('div', { className: 'dialog-head' }); head.append(el('h3', { text: title }), close);
  const grid = el('div', { className: 'form-grid' });
  for (const row of rows) {
    const label = el('label');
    const output = factValue(row.value);
    label.append(el('span', { text: row.label }), output);
    grid.append(label);
  }
  close.addEventListener('click', () => dialog.close());
  body.append(head, grid); dialog.append(body); dialog.showModal();
}