(function installPlaceholderImport(global) {
  'use strict';

  // Loading a season plan from the file it was planned in.
  //
  // A buyer writes the season in a spreadsheet months before anyone opens this application, and the
  // only way in was to retype it slot by slot. The screen below does three things in order, and the
  // order is the design: it reads the file here, asks the server what would happen, and only then
  // offers to do it. Nothing is written until someone has seen the whole verdict, because a plan that
  // half-loaded looks exactly like a plan.
  const ui = global.SynthaPlaceholderImport || (global.SynthaPlaceholderImport = {
    contract: null, rows: [], fileName: '', headerProblems: null, result: null, busy: false, error: '',
  });

  function text(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }

  const COLUMN_LABEL = {
    placeholderCode: ['Код слота', 'Code'],
    nameRu: ['Название RU', 'Name RU'],
    nameEn: ['Название EN', 'Name EN'],
    category: ['Категория', 'Category'],
    gender: ['Пол', 'Gender'],
    ageGroup: ['Возрастная группа', 'Age group'],
    novelty: ['Новизна', 'Novelty'],
    seasonality: ['Сезонность', 'Seasonality'],
    fit: ['Посадка', 'Fit'],
    capsule: ['Капсула', 'Capsule'],
    drop: ['Дроп', 'Drop'],
    description: ['Описание', 'Description'],
    colourwayCount: ['Цветомоделей', 'Colourways'],
    plannedQuantity: ['Плановое количество', 'Planned quantity'],
    launchAt: ['Дата запуска', 'Launch date'],
    currency: ['Валюта', 'Currency'],
    recommendedRetailPrice: ['РРЦ', 'Retail price'],
    plannedUnitCost: ['Плановая себестоимость', 'Planned unit cost'],
  };

  // Why a row was refused, said in the words of the person who wrote the file rather than in the
  // words of the check that caught it.
  const REASON = {
    required: ['не заполнено', 'is empty'],
    notACode: ['допустимы латинские буквы, цифры и . _ - / (до 64 знаков)', 'use latin letters, digits and . _ - / (up to 64 characters)'],
    notCurrency: ['нужен трёхбуквенный код (например EUR)', 'needs a three-letter code (for example EUR)'],
    notAmount: ['не похоже на сумму (например 249 или 249,00)', 'not an amount (for example 249 or 249.00)'],
    notWholeNumber: ['нужно целое число больше нуля', 'needs a whole number above zero'],
    notDate: ['нужна дата (например 01.09.2027 или 2027-09-01)', 'needs a date (for example 01.09.2027 or 2027-09-01)'],
    costAboveRetail: ['себестоимость выше РРЦ', 'unit cost is above the retail price'],
    repeatedInFile: ['этот код встречается в файле не один раз — строки', 'this code appears in the file more than once — lines'],
    unknownValue: ['нет такого значения в справочнике', 'no such value in the dictionary'],
    ambiguousValue: ['в справочнике несколько таких значений', 'the dictionary holds several matches'],
    dictionaryMissing: ['справочник ещё не загружен', 'the dictionary is not loaded yet'],
  };

  function columnLabel(field) { const pair = COLUMN_LABEL[field]; return pair ? text(pair[0], pair[1]) : field; }
  function reasonLabel(problem) {
    const pair = REASON[problem.reason];
    const base = pair ? text(pair[0], pair[1]) : problem.reason;
    // The value the author wrote goes after an em dash, not after a second colon: "не похоже на
    // сумму: 249 или 249,00: 10,999" reads as one sentence with two different meanings.
    return problem.value ? `${base} — «${problem.value}»` : base;
  }

  // A delimiter that is not the one the file uses turns every row into one column. Excel exports
  // semicolons in a Russian locale, tabs when the text is pasted, commas elsewhere — so the one the
  // header line actually contains is the one used.
  function detectDelimiter(line) {
    const counts = [[';', 0], ['\t', 0], [',', 0]].map(([char]) => [char, line.split(char).length - 1]);
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 0 ? counts[0][0] : ';';
  }

  // Quoted fields exist because a description contains the delimiter, and a doubled quote inside a
  // quoted field is a literal quote. Both are in every CSV a spreadsheet writes.
  function parseDelimited(source) {
    const normalized = String(source || '').replace(/\r\n?/g, '\n').replace(/^﻿/, '');
    const firstLine = normalized.split('\n')[0] || '';
    const delimiter = detectDelimiter(firstLine);
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let index = 0; index < normalized.length; index += 1) {
      const char = normalized[index];
      if (quoted) {
        if (char === '"') {
          if (normalized[index + 1] === '"') { field += '"'; index += 1; } else quoted = false;
        } else field += char;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === delimiter) { row.push(field); field = ''; continue; }
      if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
      field += char;
    }
    row.push(field);
    rows.push(row);
    return rows.filter((line) => line.some((cell) => String(cell).trim() !== ''));
  }

  function normalizeHeader(value) {
    return String(value ?? '').trim().toLowerCase().replace(/ё/g, 'е').replace(/[\s_\-./()]/g, '');
  }

  function mapHeaders(headers) {
    const columns = ui.contract?.columns || [];
    const mapped = {};
    const unknown = [];
    headers.forEach((header, index) => {
      const key = normalizeHeader(header);
      if (!key) return;
      const column = columns.find((candidate) => candidate.accepts.includes(key));
      if (!column) { unknown.push(String(header).trim()); return; }
      if (mapped[column.field] === undefined) mapped[column.field] = index;
    });
    const missing = (ui.contract?.required || []).filter((field) => mapped[field] === undefined);
    return { mapped, unknown, missing };
  }

  function readFile(source, fileName) {
    const table = parseDelimited(source);
    ui.fileName = fileName || '';
    ui.result = null;
    if (table.length < 2) {
      ui.headerProblems = { mapped: {}, unknown: [], missing: ui.contract?.required || [], empty: true };
      ui.rows = [];
      return;
    }
    const [headerRow, ...dataRows] = table;
    const headers = mapHeaders(headerRow);
    ui.headerProblems = headers.missing.length || headers.unknown.length ? headers : null;
    ui.rows = dataRows.map((cells, index) => {
      const row = { line: index + 2 };
      for (const [field, position] of Object.entries(headers.mapped)) row[field] = String(cells[position] ?? '').trim();
      return row;
    });
  }

  async function send(campaignId, mode) {
    if (ui.busy || !ui.rows.length) return;
    ui.busy = true; ui.error = '';
    renderApp();
    try {
      const result = await mutate('/v2/assortment/placeholders/import', { campaignId, mode, rows: ui.rows }, 'POST');
      ui.result = result;
      if (result.committed) {
        toast(text(`Загружено слотов: ${result.summary.ready}.`, `${result.summary.ready} slots loaded.`), 'success');
        await reloadWorkspace();
      } else if (mode === 'commit' && !result.summary.rejected && !result.summary.ready) {
        toast(text('Все слоты из файла уже есть в кампании.', 'Every slot in the file is already in the campaign.'));
      }
    } catch (error) {
      ui.error = error?.message || I18N.t('common.requestError');
    } finally {
      ui.busy = false;
      renderApp();
    }
  }

  async function reloadWorkspace() {
    try {
      const workspace = await api('/v2/workspace');
      state.workspace = workspace;
    } catch (error) { /* the register simply shows what it last loaded */ }
  }

  function templateCsv() {
    const columns = ui.contract?.columns || [];
    const header = columns.map((column) => columnLabel(column.field)).join(';');
    const example = columns.map((column) => EXAMPLE[column.field] ?? '').join(';');
    return `﻿${header}\n${example}\n`;
  }

  const EXAMPLE = {
    placeholderCode: 'SS27-OUT-001', nameRu: 'Куртка стёганая', nameEn: 'Quilted jacket',
    category: 'Одежда', gender: 'Женский', ageGroup: 'Взрослый', novelty: 'Новинка',
    seasonality: 'Осень-зима', fit: 'Прямая', capsule: 'Aurora', drop: 'D1',
    description: 'Утеплённая куртка основной линии', colourwayCount: '3', plannedQuantity: '1200',
    launchAt: '01.09.2027', currency: 'EUR', recommendedRetailPrice: '249,00', plannedUnitCost: '72,50',
  };

  function downloadTemplate() {
    const blob = new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: 'syntha-placeholders.csv' });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function verdictBadge(verdict) {
    const tone = { created: 'positive', ready: 'positive', skipped: 'muted', rejected: 'danger' }[verdict] || 'muted';
    const label = {
      created: text('загружено', 'created'),
      ready: text('готово к загрузке', 'ready'),
      skipped: text('уже есть', 'already there'),
      rejected: text('отклонено', 'rejected'),
    }[verdict] || verdict;
    return el('span', { className: `od-badge od-badge-${tone}`, rawText: label });
  }

  function resultTable() {
    const rows = ui.result?.rows || [];
    const table = el('table', { className: 'od-table od-import-table' });
    const head = el('tr');
    [text('Строка', 'Line'), text('Код', 'Code'), text('Результат', 'Result'), text('Что не так', 'What is wrong')]
      .forEach((label) => head.append(el('th', { rawText: label })));
    const thead = el('thead');
    thead.append(head);
    table.append(thead);
    const body = el('tbody');
    // Refused rows first: they are the only ones anybody has to do something about.
    const order = { rejected: 0, ready: 1, created: 1, skipped: 2 };
    [...rows].sort((a, b) => (order[a.verdict] ?? 3) - (order[b.verdict] ?? 3) || a.line - b.line).forEach((row) => {
      const tr = el('tr', { className: row.verdict === 'rejected' ? 'od-import-row-rejected' : '' });
      tr.append(el('td', { rawText: String(row.line) }));
      tr.append(el('td', { rawText: row.placeholderCode || '—' }));
      const verdictCell = el('td');
      verdictCell.append(verdictBadge(row.verdict));
      tr.append(verdictCell);
      const problems = el('td');
      if (row.problems?.length) {
        const list = el('ul', { className: 'od-import-problems' });
        row.problems.forEach((problem) => {
          const item = el('li');
          item.append(el('strong', { rawText: `${columnLabel(problem.column)}: ` }), el('span', { rawText: reasonLabel(problem) }));
          list.append(item);
        });
        problems.append(list);
      } else problems.append(el('span', { className: 'muted', rawText: '—' }));
      tr.append(problems);
      body.append(tr);
    });
    table.append(body);
    const wrap = el('div', { className: 'od-table-wrap' });
    wrap.append(table);
    return wrap;
  }

  function summaryLine() {
    const summary = ui.result?.summary;
    if (!summary) return null;
    const parts = [
      `${text('строк', 'rows')}: ${summary.total}`,
      `${ui.result.committed ? text('загружено', 'created') : text('готово', 'ready')}: ${summary.ready}`,
      `${text('уже есть', 'already there')}: ${summary.skipped}`,
      `${text('отклонено', 'rejected')}: ${summary.rejected}`,
    ];
    return el('p', { className: summary.rejected ? 'od-import-summary danger' : 'od-import-summary', rawText: parts.join(' · ') });
  }

  function campaignOptions() {
    const campaigns = Array.isArray(state.workspace?.campaigns) ? state.workspace.campaigns : [];
    return campaigns.filter((campaign) => campaign.status !== 'closed');
  }

  function openDialog() {
    const campaigns = campaignOptions();
    if (!campaigns.length) {
      toast(text('Нужна незакрытая кампания: плейсхолдеры планируются внутри неё.', 'An open campaign is required: placeholders are planned inside one.'), 'error');
      return;
    }
    ui.rows = []; ui.result = null; ui.headerProblems = null; ui.error = ''; ui.fileName = '';

    const modal = el('dialog', { className: 'od-import-dialog' });
    const campaign = el('select', { className: 'od-import-select' });
    campaigns.forEach((item) => campaign.append(el('option', { value: item.id, rawText: `${item.name} · ${item.season || ''}`.trim() })));
    const file = el('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv' });
    const paste = el('textarea', { className: 'od-import-paste', rows: '5', placeholder: text('…или вставьте таблицу прямо из Excel', '…or paste the table straight from Excel') });
    const body = el('div', { className: 'od-import-body' });

    function draw() {
      body.replaceChildren();
      if (ui.error) body.append(notice(ui.error, 'error'));
      if (ui.headerProblems) {
        const problems = ui.headerProblems;
        if (problems.empty) body.append(notice(text('В файле нет ни одной строки данных — только заголовок или пусто.', 'The file holds no data rows — only a header, or nothing.'), 'error'));
        if (problems.missing?.length) {
          body.append(notice(
            `${text('Не хватает обязательных колонок', 'Required columns are missing')}: ${problems.missing.map(columnLabel).join(', ')}`,
            'error',
          ));
        }
        if (problems.unknown?.length) {
          // A column nobody reads is worse than a missing one: the data looks delivered.
          body.append(notice(
            `${text('Эти колонки не распознаны и загружены не будут', 'These columns are not recognised and will not be loaded')}: ${problems.unknown.join(', ')}`,
          ));
        }
      }
      if (ui.rows.length && !ui.result) {
        body.append(el('p', { className: 'od-import-summary', rawText: `${ui.fileName ? `${ui.fileName} · ` : ''}${text('строк к проверке', 'rows to check')}: ${ui.rows.length}` }));
      }
      if (ui.result) {
        body.append(summaryLine());
        if (ui.result.summary.rejected) {
          body.append(notice(text(
            'Пока в файле есть отклонённые строки, не загружается ничего: иначе в кампании окажется половина плана, и заметят это через недели.',
            'Nothing is loaded while any row is rejected: otherwise the campaign holds half a plan, and that is found weeks later.',
          )));
        }
        body.append(resultTable());
      }
      check.disabled = ui.busy || !ui.rows.length;
      load.disabled = ui.busy || !ui.result || ui.result.committed || ui.result.summary.rejected || !ui.result.summary.ready;
    }

    const check = el('button', { className: 'button secondary', type: 'button', rawText: text('Проверить', 'Check') });
    const load = el('button', { className: 'button primary', type: 'button', rawText: text('Загрузить', 'Load') });
    const template = el('button', { className: 'button secondary', type: 'button', rawText: text('Шаблон CSV', 'CSV template') });
    const close = el('button', { className: 'button secondary', type: 'button', rawText: text('Закрыть', 'Close') });

    file.addEventListener('change', () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      const reader = new FileReader();
      reader.addEventListener('load', () => { readFile(String(reader.result || ''), chosen.name); draw(); });
      reader.readAsText(chosen, 'utf-8');
    });
    paste.addEventListener('change', () => { if (paste.value.trim()) { readFile(paste.value, ''); draw(); } });
    template.addEventListener('click', downloadTemplate);
    check.addEventListener('click', async () => { await send(campaign.value, 'validate'); draw(); });
    load.addEventListener('click', async () => { await send(campaign.value, 'commit'); draw(); });
    close.addEventListener('click', () => modal.close());

    const heading = el('header');
    heading.append(el('h2', { rawText: text('Импорт плейсхолдеров', 'Import placeholders') }));
    const campaignField = el('label', { className: 'od-import-field' });
    campaignField.append(el('span', { rawText: text('Кампания', 'Campaign') }), campaign);
    const fileField = el('label', { className: 'od-import-field' });
    fileField.append(el('span', { rawText: text('Файл', 'File') }), file);
    const controls = el('div', { className: 'od-import-controls' });
    controls.append(campaignField, fileField);
    const footer = el('footer');
    footer.append(template, close, check, load);
    modal.append(
      heading,
      el('p', { className: 'muted', rawText: text(
        'Файл CSV из Excel или вставленная таблица. Категория, пол, возраст, новизна, сезонность и посадка пишутся словами — они сверяются со справочниками.',
        'A CSV from Excel, or a pasted table. Category, gender, age, novelty, seasonality and fit are written as words and checked against the governed dictionaries.',
      ) }),
      controls,
      paste,
      body,
      footer,
    );
    modal.addEventListener('close', () => modal.remove(), { once: true });
    document.body.append(modal);
    modal.showModal();
    draw();
  }

  async function ensureContract() {
    if (ui.contract || ui.contractLoading) return;
    ui.contractLoading = true;
    try { ui.contract = await api('/v2/assortment/placeholders/import/template'); }
    catch (error) { ui.contract = null; }
    finally { ui.contractLoading = false; }
  }

  // Published for the planning screen, which owns the line-plan tab this belongs to.
  global.SynthaPlaceholderImport.open = () => { void ensureContract().then(openDialog); };
  global.SynthaPlaceholderImport.canImport = () => {
    const caps = window.SynthaUiCapabilities;
    return Boolean(caps?.hasAny(state.workspace, caps.CAPABILITIES.CAMPAIGN_MANAGE, 'brand'));
  };
  queueMicrotask(() => { void ensureContract(); });
})(window);
