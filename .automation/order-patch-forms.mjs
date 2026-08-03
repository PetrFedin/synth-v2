import { edit, replaceOnce, replaceRegexOnce } from './order-patch-utils.mjs';

await edit('public/modules/i18n-runtime.js', source => replaceOnce(
  source,
  "    'form.cancelOrder': ['\\u041e\\u0442\\u043c\\u0435\\u043d\\u0438\\u0442\\u044c \\u0437\\u0430\\u043a\\u0430\\u0437', 'Cancel order'],",
  "    'form.editOrderTerms': ['\\u0420\\u0435\\u0434\\u0430\\u043a\\u0442\\u0438\\u0440\\u043e\\u0432\\u0430\\u0442\\u044c \\u0443\\u0441\\u043b\\u043e\\u0432\\u0438\\u044f \\u0437\\u0430\\u043a\\u0430\\u0437\\u0430', 'Edit order terms'],\n    'form.cancelOrder': ['\\u041e\\u0442\\u043c\\u0435\\u043d\\u0438\\u0442\\u044c \\u0437\\u0430\\u043a\\u0430\\u0437', 'Cancel order'],",
  'Order terms translation',
));

await edit('public/modules/dom-1.js', source => {
  let updated = replaceOnce(
    source,
`    field.options.forEach(option => {
      const value = typeof option === 'string' ? option : option.id;
      const text = field.format ? field.format(option) : (typeof option === 'string' ? option : (option.name || option.id));
      control.append(el('option',{value,rawText:text}));
    });`,
`    field.options.forEach(option => {
      const value = typeof option === 'string' ? option : option.id;
      const text = field.format ? field.format(option) : (typeof option === 'string' ? option : (option.name || option.id));
      const optionNode = el('option',{value,rawText:text});
      if (field.value !== undefined && String(field.value) === String(value)) optionNode.selected = true;
      control.append(optionNode);
    });`,
    'Select initial value support',
  );
  return replaceOnce(
    updated,
`function dateDef(name, label) { return { name, label, kind: 'date' }; }
function dateTimeDef(name, label) { return { name, label, kind: 'datetime-local' }; }
function numberDef(name, label, value, integer, min = 0) { return { name, label, kind: 'number', value, integer, min }; }
function selectDef(name, label, options, format) { return { name, label, kind: 'select', options, format }; }`,
`function dateDef(name, label, value = '') { return { name, label, kind: 'date', value }; }
function dateTimeDef(name, label, value = '') { return { name, label, kind: 'datetime-local', value }; }
function numberDef(name, label, value, integer, min = 0) { return { name, label, kind: 'number', value, integer, min }; }
function selectDef(name, label, options, format, value) { return { name, label, kind: 'select', options, format, value }; }`,
    'Form definition initial values',
  );
});

await edit('public/modules/forms-3.js', source => replaceRegexOnce(
  source,
  /function orderForm\(\) \{[\s\S]*$/,
`function orderForm() {
  const caps = window.SynthaUiCapabilities;
  const selections = state.workspace.selections.filter(x => x.status === 'submitted' && caps.hasForOrganisation(state.workspace, x.shopId, caps.CAPABILITIES.ORDER_WRITE) && !state.workspace.orders.some(o => o.selectionId === x.id));
  openForm('\\u0421\\u043e\\u0437\\u0434\\u0430\\u0442\\u044c \\u0437\\u0430\\u043a\\u0430\\u0437', [
    selectDef('selectionId', 'Selection', selections),
    ...orderTermsFields(),
  ], values => mutate('/v2/orders', { selectionId: values.selectionId, terms: validatedOrderTerms(values) }));
}

function orderTermsEditForm(order) {
  openForm(I18N.t('form.editOrderTerms'), orderTermsFields(order.terms), values => mutate(
    \`/v2/orders/\${encodeURIComponent(order.id)}/terms\`,
    { expectedVersion: order.version, terms: validatedOrderTerms(values) },
    'PATCH',
  ));
}

function orderTermsFields(terms = {}) {
  return [
    selectDef('incoterm', 'Incoterm', ['EXW', 'FCA', 'FOB', 'CIF', 'DAP', 'DDP'], undefined, terms.incoterm || 'EXW'),
    numberDef('paymentDays', '\\u041e\\u0442\\u0441\\u0440\\u043e\\u0447\\u043a\\u0430, \\u0434\\u043d\\u0435\\u0439', terms.paymentDays ?? 30, true, 0),
    numberDef('prepaymentPercent', '\\u041f\\u0440\\u0435\\u0434\\u043e\\u043f\\u043b\\u0430\\u0442\\u0430, %', terms.prepaymentPercent ?? 20, false, 0),
    dateDef('deliveryStart', '\\u041d\\u0430\\u0447\\u0430\\u043b\\u043e \\u043f\\u043e\\u0441\\u0442\\u0430\\u0432\\u043a\\u0438', orderDateValue(terms.deliveryStart)),
    dateDef('deliveryEnd', '\\u041a\\u043e\\u043d\\u0435\\u0446 \\u043f\\u043e\\u0441\\u0442\\u0430\\u0432\\u043a\\u0438', orderDateValue(terms.deliveryEnd)),
  ];
}

function validatedOrderTerms(values) {
  const validation = window.SynthaUiValidation;
  validation.dateRange(values.deliveryStart, values.deliveryEnd, 'Delivery dates');
  return {
    incoterm: values.incoterm,
    paymentDays: validation.number(values.paymentDays, 'Payment days', { integer: true, min: 0, max: 365 }),
    prepaymentPercent: validation.number(values.prepaymentPercent, 'Prepayment', { min: 0, max: 100 }),
    deliveryStart: values.deliveryStart,
    deliveryEnd: values.deliveryEnd,
  };
}

function orderDateValue(value) {
  if (!value) return '';
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function orderCancellationForm(order) {
  const validation = window.SynthaUiValidation;
  openForm(I18N.t('form.cancelOrder'), [textDef('reason', I18N.t('form.cancellationReason'), '', 1000)], values => mutate(\`/v2/orders/\${encodeURIComponent(order.id)}/cancel\`, {
    orderId: order.id,
    expectedVersion: order.version,
    reason: validation.requiredText(values.reason, 'Cancellation reason', { minLength: 3, maxLength: 1000 }),
  }));
}
`,
  'Order forms',
));