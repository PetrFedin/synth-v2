function openForm(title, fields, submitAction) {
  const unavailable = fields.find(field => field.kind === 'select' && field.options.length === 0);
  if (unavailable) { toast(`\u041d\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0445 \u0434\u0430\u043d\u043d\u044b\u0445: ${unavailable.label}`, 'error'); return; }
  const dialog = document.querySelector('#form-dialog'); clear(dialog);
  const body = el('div', { className: 'dialog-body' });
  const close = el('button', { className: 'button small', text: '\u0417\u0430\u043a\u0440\u044b\u0442\u044c', type: 'button' }); close.addEventListener('click', () => dialog.close());
  const head = el('div', { className: 'dialog-head' }); head.append(el('h3', { text: title }), close);
  const form = el('form'); const grid = el('div', { className: 'form-grid' });
  const controls = new Map();
  fields.forEach(field => { const built = buildField(field); controls.set(field.name,built.control); grid.append(built.label); });
  const submit = el('button', { className: 'button primary', text: '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c', type: 'submit' });
  form.append(grid, submit);
  form.addEventListener('submit', async event => {
    event.preventDefault(); setButtonBusy(submit,true,'\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c\u2026');
    try {
      const values = {};
      fields.forEach(field => { const raw = controls.get(field.name).value; values[field.name] = field.kind === 'number' ? (field.integer ? Number.parseInt(raw,10) : Number(raw)) : raw; });
      await submitAction(values); dialog.close(); await reload(); renderApp(); toast('\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b','success');
    } catch (error) { showInlineError(form,error.message); }
    finally { setButtonBusy(submit,false,'\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c'); }
  });
  body.append(head,form); dialog.append(body); dialog.showModal();
}
