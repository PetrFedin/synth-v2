function openForm(title, fields, submitAction) {
  const unavailable = fields.find(field => field.kind === 'select' && field.options.length === 0);
  if (unavailable) { toast(I18N.t('common.noData', { label: I18N.translate(unavailable.label) }), 'error'); return; }
  const dialog = document.querySelector('#form-dialog'); clear(dialog);
  const body = el('div', { className: 'dialog-body' });
  const close = el('button', { className: 'button small', text: I18N.t('common.close'), type: 'button' });
  const head = el('div', { className: 'dialog-head' }); head.append(el('h3', { text: title }), close);
  const form = el('form'); const grid = el('div', { className: 'form-grid' });
  const controls = new Map();
  fields.forEach(field => { const built = buildField(field); controls.set(field.name, built.control); grid.append(built.label); });
  const submit = el('button', { className: 'button primary', text: I18N.t('common.save'), type: 'submit' });
  form.append(grid, submit);

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
  const requestClose = () => {
    if (submitting) return false;
    if (isDirty() && !window.confirm(I18N.t('common.unsavedChangesConfirm'))) return false;
    dialog.close();
    return true;
  };
  const cancelDialog = event => {
    if (!shouldBlockNavigation()) return;
    event.preventDefault();
    requestClose();
  };

  close.addEventListener('click', requestClose);
  dialog.addEventListener('cancel', cancelDialog);
  dialog.addEventListener('close', cleanup, { once: true });
  window.addEventListener('beforeunload', beforeUnload);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    close.disabled = true;
    setButtonBusy(submit, true, I18N.t('common.saving'));
    try {
      const values = {};
      fields.forEach(field => {
        const raw = controls.get(field.name).value;
        values[field.name] = field.kind === 'number' ? (field.integer ? Number.parseInt(raw, 10) : Number(raw)) : raw;
      });
      await submitAction(values);
      saved = true;
      dialog.close();
      try {
        await reload();
        renderApp();
        toast(I18N.t('common.changesSaved'), 'success');
      } catch (refreshError) {
        toast(`${I18N.t('common.savedRefreshFailed')} ${refreshError.message}`, 'error');
      }
    } catch (error) {
      showInlineError(form, error.message);
    } finally {
      submitting = false;
      close.disabled = false;
      if (submit.isConnected) setButtonBusy(submit, false, I18N.t('common.save'));
    }
  });
  body.append(head, form); dialog.append(body); dialog.showModal();
}
