(function installDigitalSamples(root) {
  'use strict';

  const TEXT = {
    title: ['Цифровые образцы', 'Digital samples'],
    subtitle: ['Версии цифрового изделия и экономика партии', 'Digital garment revisions and batch economics'],
    disclosure: ['Здесь фиксируются только метаданные файла. Файл ещё не загружен и не проверен; запись не означает технический или производственный допуск.', 'This records file metadata only. The file is not uploaded or verified; the record is not a technical or production approval.'],
    add: ['Добавить образец', 'Add sample'],
    revise: ['Новая ревизия', 'New revision'],
    refresh: ['Обновить', 'Refresh'],
    history: ['История', 'History'],
    scenario: ['Новый сценарий', 'New scenario'],
    noVersion: ['Сначала создайте версию модели.', 'Create a style version first.'],
    empty: ['Для этой версии модели цифровых образцов пока нет.', 'No digital samples exist for this style version yet.'],
    loading: ['Загрузка…', 'Loading…'],
    unverified: ['не проверен', 'unverified'],
    file: ['Файл', 'File'],
    revision: ['Ревизия', 'Revision'],
    sourceHash: ['SHA-256 файла', 'File SHA-256'],
    manifestHash: ['SHA-256 записи', 'Record SHA-256'],
    lineage: ['Происхождение', 'Lineage'],
    economics: ['Экономика партии', 'Batch economics'],
    estimate: ['Ручной плановый расчёт — не фактическая прибыль, не котировка фабрики и не прогноз спроса.', 'Manual planning estimate — not actual profit, a supplier quote, or a demand forecast.'],
    hidden: ['Экономика скрыта: для роли нет права просмотра маржи.', 'Economics is hidden: this role has no margin permission.'],
    noScenarios: ['Для этой ревизии сценариев пока нет.', 'No scenarios exist for this revision yet.'],
    save: ['Сохранить', 'Save'],
    cancel: ['Отмена', 'Cancel'],
    uncertain: ['Ответ сервера не получен. Повтор сохранения использует тот же ключ операции; не меняйте поля до сверки.', 'The server response was not received. Retry Save uses the same operation key; do not edit fields until reconciled.'],
    conflict: ['Ревизия уже изменилась. Введённые данные сохранены в форме — обновите реестр и сверьте изменения.', 'The revision changed. Your input remains in the form — refresh and reconcile before saving.'],
    denied: ['Для этой операции недостаточно прав.', 'You do not have permission for this operation.'],
    error: ['Операция не выполнена.', 'The operation failed.'],
    saved: ['Запись сохранена.', 'Record saved.'],
    styleVersion: ['Версия модели', 'Style version'],
    batchInvestment: ['Вложения в партию', 'Batch investment'],
    plannedRevenue: ['Плановая выручка', 'Planned revenue'],
    unitContribution: ['Вклад одной продажи', 'Contribution per sale'],
    contributionSalesResult: ['Результат продаж после запуска', 'Sales result after launch cost'],
    unsoldStockAtProductionCost: ['Капитал в непроданном остатке', 'Capital in unsold inventory'],
    batchCashResult: ['Денежный результат партии', 'Whole-batch cash result'],
    salesBreakEvenUnits: ['Продаж до покрытия запуска', 'Units to cover launch cost'],
    batchCashBreakEvenUnits: ['Продаж до возврата вложений', 'Units to recover batch cash'],
    MOQ_NOT_MET: ['Объём ниже MOQ.', 'Batch is below MOQ.'],
    PACK_MULTIPLE_NOT_MET: ['Партия нарушает кратность упаковки.', 'Batch violates pack multiple.'],
    NON_POSITIVE_UNIT_CONTRIBUTION: ['Цена не покрывает переменные затраты.', 'Price does not cover variable costs.'],
    BATCH_CASH_RECOVERY_UNREACHABLE: ['Даже полная продажа партии не возвращает вложения.', 'Even full sell-through cannot recover batch investment.'],
    BATCH_CASH_SHORTFALL: ['План продаж не возвращает вложения в партию.', 'Planned sales do not recover batch investment.'],
    name: ['Название сценария', 'Scenario name'],
    currency: ['Валюта', 'Currency'],
    quantity: ['Партия, шт.', 'Batch, units'],
    expectedSoldUnits: ['План продаж, шт.', 'Planned sales, units'],
    unitProductionCost: ['Себестоимость / шт.', 'Production cost / unit'],
    netUnitPrice: ['Цена после скидок, без налогов', 'Net price after discounts, ex tax'],
    unitSellingCost: ['Расходы продажи / шт.', 'Selling cost / unit'],
    fixedDevelopmentCost: ['Разовые затраты запуска', 'Fixed development cost'],
    minimumOrderQuantity: ['Минимальная партия', 'Minimum order quantity'],
    packSize: ['Кратность партии', 'Pack multiple'],
    titleRu: ['Название RU', 'Name RU'],
    titleEn: ['Название EN', 'Name EN'],
    sourceFileName: ['Имя файла', 'File name'],
    sourceFormat: ['Формат', 'Format'],
    declaredSha256: ['SHA-256 исходного файла', 'Declared file SHA-256'],
    declaredByteLength: ['Размер, байт', 'Declared size, bytes'],
    note: ['Примечание', 'Note'],
  };

  const stateByVersion = new Map();

  function tr(key) {
    const pair = TEXT[key] || [key, key];
    return typeof localText === 'function' ? localText(pair[0], pair[1]) : pair[0];
  }
  function node(tag, className, text) {
    const value = document.createElement(tag);
    if (className) value.className = className;
    if (text !== undefined) value.textContent = String(text);
    return value;
  }
  function capability(product, name) {
    return Boolean(root.SynthaUiCapabilities?.hasForOrganisation(state.workspace, product.brandId, name));
  }
  function mutationKey() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    return Array.from(a, x => x.toString(16).padStart(2, '0')).join('');
  }
  function amount(value) {
    if (value === null || value === undefined) return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    return new Intl.NumberFormat(I18N.getLocale?.() === 'en' ? 'en-GB' : 'ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n);
  }
  function errorMessage(error) {
    if (error?.status === 403) return tr('denied');
    if (String(error?.code || '').includes('CONFLICT')) return tr('conflict');
    return (error?.message || tr('error'));
  }
  function formField(name, type = 'text', options = {}) {
    const label = node('label', 'ds-field');
    label.append(node('span', '', tr(name)));
    const input = options.values ? node('select') : node('input');
    input.name = name;
    input.required = options.required !== false;
    if (options.values) {
      options.values.forEach(item => {
        const option = node('option', '', item); option.value = item; input.append(option);
      });
    } else {
      input.type = type;
      if (options.min !== undefined) input.min = String(options.min);
      if (options.max !== undefined) input.max = String(options.max);
      if (options.step !== undefined) input.step = String(options.step);
      if (options.pattern) input.pattern = options.pattern;
      if (options.maxLength) input.maxLength = options.maxLength;
    }
    input.value = options.value ?? '';
    label.append(input);
    return { label, input };
  }

  function panel(product) {
    const rootNode = node('section', 'ds-workspace');
    if (!product.styleVersionId) {
      rootNode.append(node('p', 'ds-empty', tr('noVersion')));
      return rootNode;
    }
    const versionKey = product.styleVersionId;
    const model = stateByVersion.get(versionKey) || {
      samples: [], selected: null, history: [], scenarios: [], loading: false, error: null,
      sampleCursor: null, scenarioCursor: null, pending: null,
    };
    stateByVersion.set(versionKey, model);

    const header = node('div', 'ds-header');
    const heading = node('div');
    heading.append(node('h3', '', tr('title')), node('p', 'ds-muted', tr('subtitle')));
    const actions = node('div', 'od-inline-actions');
    const refresh = node('button', 'button small', tr('refresh')); refresh.type = 'button';
    refresh.addEventListener('click', () => load(true));
    actions.append(refresh);
    if (capability(product, 'product-engineering.manage')) {
      const add = node('button', 'button small primary', tr('add')); add.type = 'button';
      add.addEventListener('click', () => openManifest(null));
      actions.prepend(add);
    }
    header.append(heading, actions);
    const notice = node('p', 'ds-truth', tr('disclosure'));
    const status = node('p', 'ds-status'); status.setAttribute('aria-live', 'polite');
    const body = node('div', 'ds-layout');
    const register = node('div', 'ds-register');
    const detail = node('div', 'ds-detail');
    const editor = node('div', 'ds-editor');
    body.append(register, detail);
    rootNode.append(header, notice, status, editor, body);

    function renderRegister() {
      register.replaceChildren();
      if (model.loading && !model.samples.length) {
        register.append(node('p', 'ds-empty', tr('loading'))); return;
      }
      if (!model.samples.length) {
        register.append(node('p', 'ds-empty', tr('empty'))); return;
      }
      model.samples.forEach(sample => {
        const row = node('button', 'ds-row'); row.type = 'button';
        row.setAttribute('aria-pressed', String(model.selected?.seriesId === sample.seriesId));
        row.append(
          node('strong', '', I18N.getLocale?.() === 'en' ? sample.titleEn : sample.titleRu),
          node('span', 'ds-muted', sample.sourceFileName),
          node('small', '', tr('revision') + ' ' + sample.revision + ' · ' + sample.sourceFormat.toUpperCase()),
        );
        row.addEventListener('click', () => select(sample));
        register.append(row);
      });
    }

    function ledgerRow(label, value, strong = false, negative = false) {
      const row = node('div', strong ? 'ds-ledger-row total' : 'ds-ledger-row');
      row.append(node('span', '', label), node('strong', negative ? 'ds-negative' : '', value));
      return row;
    }

    function renderDetail() {
      detail.replaceChildren();
      const sample = model.selected;
      if (!sample) return;
      const head = node('div', 'ds-detail-head');
      const title = node('div');
      title.append(
        node('h3', '', (I18N.getLocale?.() === 'en' ? sample.titleEn : sample.titleRu) + ' · ' + tr('revision') + ' ' + sample.revision),
        node('p', 'ds-muted', sample.sourceFileName),
      );
      head.append(title, node('span', 'badge warning', tr('unverified')));
      detail.append(head);

      const rowActions = node('div', 'od-inline-actions');
      const history = node('button', 'button small', tr('history')); history.type='button';
      history.addEventListener('click', () => loadHistory(sample));
      rowActions.append(history);
      const latest = model.samples.find(x => x.seriesId === sample.seriesId);
      if (capability(product, 'product-engineering.manage') && latest?.id === sample.id) {
        const revise = node('button', 'button small', tr('revise')); revise.type='button';
        revise.addEventListener('click', () => openManifest(sample)); rowActions.append(revise);
      }
      if (capability(product, 'cost.manage')) {
        const scenario = node('button', 'button small primary', tr('scenario')); scenario.type='button';
        scenario.addEventListener('click', () => openScenario(sample)); rowActions.append(scenario);
      }
      detail.append(rowActions);

      const facts = node('dl', 'ds-facts');
      [
        [tr('file'), sample.sourceFileName + ' · ' + sample.declaredByteLength + ' B'],
        [tr('sourceHash'), sample.declaredSha256],
        [tr('manifestHash'), sample.manifestHash],
        [tr('styleVersion'), sample.styleVersionId + ' · ' + sample.styleVersionContentHash],
      ].forEach(([label, value]) => {
        const item=node('div'); item.append(node('dt','',label),node('dd','',value)); facts.append(item);
      });
      detail.append(facts);

      if (model.history.length > 1) {
        const historyBar=node('div','ds-history');
        model.history.forEach(version => {
          const b=node('button','button small','v'+version.revision); b.type='button';
          b.title=version.createdAt; b.addEventListener('click',()=>select(version,false)); historyBar.append(b);
        });
        detail.append(historyBar);
      }

      detail.append(node('h4','',tr('economics')));
      if (!capability(product, 'margin.read')) {
        detail.append(node('p','ds-empty',tr('hidden'))); return;
      }
      detail.append(node('p','ds-muted',tr('estimate')));
      if (!model.scenarios.length) {
        detail.append(node('p','ds-empty',tr('noScenarios'))); return;
      }
      if (model.scenarios.length > 1) {
        const table=node('table','ds-compare');
        const thead=node('thead'), hr=node('tr');
        [tr('name'),tr('expectedSoldUnits'),tr('batchCashResult')].forEach(v=>hr.append(node('th','',v)));
        thead.append(hr); table.append(thead);
        const tbody=node('tbody');
        model.scenarios.forEach(s=>{
          const r=node('tr');
          r.append(node('td','',s.calculation.input.name),node('td','',s.calculation.input.expectedSoldUnits),
            node('td','',amount(s.calculation.result.batchCashResult)+' '+s.calculation.input.currency));
          tbody.append(r);
        });
        table.append(tbody); const scroll=node('div','ds-table-scroll'); scroll.append(table); detail.append(scroll);
      }
      model.scenarios.forEach(scenario => {
        const calc=scenario.calculation, result=calc.result, card=node('article','ds-scenario');
        card.append(node('h4','',calc.input.name),node('p','ds-muted',calc.input.currency+' · '+tr('quantity')+': '+calc.input.quantity+' · '+tr('expectedSoldUnits')+': '+calc.input.expectedSoldUnits));
        const ledger=node('div','ds-ledger');
        [
          ['batchInvestment',result.batchInvestment],
          ['plannedRevenue',result.plannedRevenue],
          ['unitContribution',result.unitContribution],
          ['contributionSalesResult',result.contributionSalesResult],
          ['unsoldStockAtProductionCost',result.unsoldStockAtProductionCost],
        ].forEach(([key,value])=>ledger.append(ledgerRow(tr(key),amount(value)+' '+calc.input.currency)));
        ledger.append(ledgerRow(tr('batchCashResult'),amount(result.batchCashResult)+' '+calc.input.currency,true,String(result.batchCashResult).startsWith('-')));
        ledger.append(ledgerRow(tr('salesBreakEvenUnits'),result.salesBreakEvenUnits ?? '—'));
        ledger.append(ledgerRow(tr('batchCashBreakEvenUnits'),result.batchCashBreakEvenUnits ?? '—'));
        card.append(ledger);
        [...calc.blockers,...calc.warnings].forEach(code=>card.append(node('p','ds-warning',tr(code))));
        detail.append(card);
      });
    }

    async function load(force=false) {
      if (model.loading && !force) return;
      model.loading=true; model.error=null; status.textContent=tr('loading'); status.className='ds-status'; renderRegister();
      try {
        const page=await api('/v2/product/style-versions/'+encodeURIComponent(product.styleVersionId)+'/digital-samples?limit=100');
        model.samples=page.items || []; model.sampleCursor=page.nextCursor;
        const existing=model.selected && model.samples.find(x=>x.seriesId===model.selected.seriesId);
        model.selected=existing || model.samples[0] || null;
        status.textContent=''; status.className='ds-status';
        renderRegister();
        if (model.selected) await select(model.selected,false); else renderDetail();
      } catch(error) {
        model.error=error; status.textContent=errorMessage(error); status.className='ds-status error';
      } finally { model.loading=false; renderRegister(); }
    }

    async function select(sample, loadScenario=true) {
      model.selected=sample; renderRegister();
      if (loadScenario && capability(product,'margin.read')) {
        try {
          const page=await api('/v2/digital-sample-versions/'+encodeURIComponent(sample.id)+'/scenarios?limit=100');
          model.scenarios=page.items || []; model.scenarioCursor=page.nextCursor;
        } catch(error) { model.scenarios=[]; status.textContent=errorMessage(error); status.className='ds-status error'; }
      }
      renderDetail();
    }

    async function loadHistory(sample) {
      try {
        const page=await api('/v2/digital-sample-series/'+encodeURIComponent(sample.seriesId)+'/versions?limit=100');
        model.history=page.items || []; renderDetail();
      } catch(error) { status.textContent=errorMessage(error); status.className='ds-status error'; }
    }

    function openEditor(titleText, fields, submit) {
      editor.replaceChildren();
      const form=node('form','ds-form');
      form.append(node('h4','',titleText));
      const grid=node('div','ds-form-grid'), message=node('p','ds-form-message');
      const controls={};
      fields.forEach(spec=>{
        const made=formField(spec.name,spec.type,spec);
        controls[spec.name]=made.input; grid.append(made.label);
      });
      const buttons=node('div','od-inline-actions');
      const save=node('button','button small primary',tr('save')); save.type='submit';
      const cancel=node('button','button small',tr('cancel')); cancel.type='button';
      cancel.addEventListener('click',()=>editor.replaceChildren());
      buttons.append(save,cancel); form.append(grid,message,buttons); editor.append(form);
      let pending=null;
      form.addEventListener('submit',async event=>{
        event.preventDefault();
        if(!form.reportValidity()) return;
        const value={};
        fields.forEach(spec=>{
          const raw=controls[spec.name].value;
          value[spec.name]=spec.type==='number'?Number(raw):raw;
        });
        const fingerprint=JSON.stringify(value);
        if(!pending || pending.fingerprint!==fingerprint) pending={fingerprint,key:mutationKey()};
        save.disabled=true; cancel.disabled=true; message.textContent='';
        try {
          const saved=await submit(value,pending.key);
          pending=null; editor.replaceChildren(); status.textContent=tr('saved'); status.className='ds-status';
          await load(true);
          const found=model.samples.find(x=>x.id===saved.id || x.seriesId===saved.seriesId);
          if(found) await select(found);
        } catch(error) {
          const uncertain=!error?.status || error.status>=500;
          message.textContent=uncertain?tr('uncertain'):errorMessage(error);
          if(!uncertain) pending=null;
        } finally { save.disabled=false; cancel.disabled=false; }
      });
    }

    function openManifest(previous) {
      const base=previous || {};
      openEditor(previous?tr('revise'):tr('add'),[
        {name:'titleRu',value:base.titleRu||'',maxLength:160},
        {name:'titleEn',value:base.titleEn||'',maxLength:160},
        {name:'sourceFileName',value:base.sourceFileName||'',maxLength:200},
        {name:'sourceFormat',values:['glb','gltf','obj','usd','usdz','fbx','zprj'],value:base.sourceFormat||'glb'},
        {name:'declaredSha256',value:base.declaredSha256||'',pattern:'[a-f0-9]{64}',maxLength:64},
        {name:'declaredByteLength',type:'number',value:base.declaredByteLength||'',min:1,max:524288000,step:1},
        {name:'note',value:base.note||'',required:false,maxLength:2000},
      ],(value,key)=>api(
        previous?'/v2/digital-sample-series/'+encodeURIComponent(previous.seriesId)+'/versions'
          :'/v2/product/style-versions/'+encodeURIComponent(product.styleVersionId)+'/digital-samples',
        {method:'POST',body:previous?{...value,expectedHeadId:previous.id}:value,idempotencyKey:key},
      ));
    }

    function openScenario(sample) {
      const prior=model.scenarios.at(-1)?.calculation?.input || {};
      openEditor(tr('scenario'),[
        {name:'name',value:'',maxLength:160},
        {name:'currency',values:['EUR','RUB','USD','GBP','CHF','CNY','JPY'],value:prior.currency||'EUR'},
        {name:'quantity',type:'number',value:prior.quantity||'',min:1,max:1000000,step:1},
        {name:'expectedSoldUnits',type:'number',value:prior.expectedSoldUnits??'',min:0,max:1000000,step:1},
        {name:'unitProductionCost',value:prior.unitProductionCost||'',pattern:'(0|[1-9][0-9]{0,11})([.][0-9]{1,4})?'},
        {name:'netUnitPrice',value:prior.netUnitPrice||'',pattern:'(0|[1-9][0-9]{0,11})([.][0-9]{1,4})?'},
        {name:'unitSellingCost',value:prior.unitSellingCost||'',pattern:'(0|[1-9][0-9]{0,11})([.][0-9]{1,4})?'},
        {name:'fixedDevelopmentCost',value:prior.fixedDevelopmentCost||'',pattern:'(0|[1-9][0-9]{0,11})([.][0-9]{1,4})?'},
        {name:'minimumOrderQuantity',type:'number',value:prior.minimumOrderQuantity||1,min:1,max:1000000,step:1},
        {name:'packSize',type:'number',value:prior.packSize||1,min:1,max:1000000,step:1},
      ],(value,key)=>api('/v2/digital-sample-versions/'+encodeURIComponent(sample.id)+'/scenarios',{method:'POST',body:value,idempotencyKey:key}));
    }

    queueMicrotask(()=>load());
    return rootNode;
  }

  root.SynthaDigitalSamples=Object.freeze({panel});
})(window);
