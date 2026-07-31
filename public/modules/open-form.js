function openForm(title, fields, submitAction) {
  const unavailable = fields.find(field => field.kind === 'select' && field.options.length === 0);
  if (unavailable) { toast(I18N.t('common.noData', { label: I18N.translate(unavailable.label) }), 'error'); return; }
  const dialog = document.querySelector('#form-dialog'); clear(dialog);
  const body = el('div', { className: 'dialog-body' });
  const close = el('button', { className: 'button small', text: I18N.t('common.close'), type: 'button' }); close.addEventListener('click', () => dialog.close());
  const head = el('div', { className: 'dialog-head' }); head.append(el('h3', { text: title }), close);
  const form = el('form'); const grid = el('div', { className: 'form-grid' });
  const controls = new Map();
  fields.forEach(field => { const built = buildField(field); controls.set(field.name,built.control); grid.append(built.label); });
  const submit = el('button', { className: 'button primary', text: I18N.t('common.save'), type: 'submit' });
  form.append(grid, submit);
  form.addEventListener('submit', async event => {
    event.preventDefault(); setButtonBusy(submit,true,I18N.t('common.saving'));
    try {
      const values = {};
      fields.forEach(field => { const raw = controls.get(field.name).value; values[field.name] = field.kind === 'number' ? (field.integer ? Number.parseInt(raw,10) : Number(raw)) : raw; });
      await submitAction(values); dialog.close(); await reload(); renderApp(); toast(I18N.t('common.changesSaved'),'success');
    } catch (error) { showInlineError(form,error.message); }
    finally { setButtonBusy(submit,false,I18N.t('common.save')); }
  });
  body.append(head,form); dialog.append(body); dialog.showModal();
}
