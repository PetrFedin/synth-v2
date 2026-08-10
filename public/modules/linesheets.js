(function installLinesheetsWorkspace(global) {
  'use strict';

  const LS = global.SynthaLinesheets || (global.SynthaLinesheets = {
    collectionId: '', selectedId: '', query: '', items: [], nextCursor: null,
    loadedCollectionId: '', loading: false, loadingMore: false, error: '', requestToken: 0,
  });

  function text(ru, en) { return localText(ru, en); }
  function list(input) { return Array.isArray(input) ? input : []; }
  function value(input) { return String(input ?? '').trim(); }
  function collections() { return list(state.workspace?.collections); }
  function collectionName(collection) { return value(collection?.name || collection?.title || collection?.code || collection?.id) || text('Коллекция', 'Collection'); }

  function formatDate(raw) {
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(I18N.getLocale() === 'en' ? 'en-GB' : 'ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(date);
  }

  function formatMoney(amount, currency) {
    const number = Number(amount);
    if (!Number.isFinite(number)) return '—';
    try {
      return new Intl.NumberFormat(I18N.getLocale() === 'en' ? 'en-GB' : 'ru-RU', {
        style: 'currency', currency: value(currency) || 'USD', maximumFractionDigits: 2,
      }).format(number);
    } catch { return `${number.toFixed(2)} ${value(currency)}`.trim(); }
  }

  function shortHash(hash) {
    const normalized = value(hash);
    return normalized ? `${normalized.slice(0, 10)}…${normalized.slice(-6)}` : '—';
  }

  function resetForCollection(collectionId) {
    LS.collectionId = collectionId; LS.selectedId = ''; LS.items = []; LS.nextCursor = null;
    LS.loadedCollectionId = ''; LS.loading = false; LS.loadingMore = false; LS.error = ''; LS.requestToken += 1;
  }

  async function loadPublications({ append = false } = {}) {
    const collectionId = value(LS.collectionId);
    if (!collectionId || LS.loading || LS.loadingMore) return;
    const requestToken = ++LS.requestToken;
    if (append) LS.loadingMore = true; else LS.loading = true;
    LS.error = '';
    try {
      const cursor = append && LS.nextCursor ? `&cursor=${encodeURIComponent(LS.nextCursor)}` : '';
      const page = await api(`/v2/collections/${encodeURIComponent(collectionId)}/commercial-publications?limit=50${cursor}`);
      if (requestToken !== LS.requestToken || collectionId !== LS.collectionId) return;
      const incoming = list(page?.items);
      LS.items = append ? [...LS.items, ...incoming] : incoming;
      LS.nextCursor = page?.nextCursor || null;
      LS.loadedCollectionId = collectionId;
      if (!LS.selectedId || !LS.items.some(item => item.id === LS.selectedId)) LS.selectedId = LS.items[0]?.id || '';
    } catch (error) {
      if (requestToken !== LS.requestToken || collectionId !== LS.collectionId) return;
      LS.error = value(error?.message) || text('Не удалось загрузить опубликованные листы.', 'Could not load published linesheets.');
      if (!append) LS.items = [];
    } finally {
      if (requestToken === LS.requestToken) {
        LS.loading = false; LS.loadingMore = false;
        if (state.view === 'linesheets') renderApp();
      }
    }
  }

  function ensureLoad() {
    const available = collections();
    if (!LS.collectionId && available.length) LS.collectionId = value(available[0].id);
    if (!LS.collectionId || LS.loading || LS.loadedCollectionId === LS.collectionId) return;
    void loadPublications();
  }

  function filteredPublications() {
    const query = value(LS.query).toLocaleLowerCase();
    if (!query) return LS.items;
    return LS.items.filter(publication => [publication.id, publication.currency, publication.contentHash,
      ...list(publication.lines).flatMap(line => [line.sku, line.name])].join(' ').toLocaleLowerCase().includes(query));
  }

  function toolbar() {
    const available = collections();
    const bar = el('section', { className: 'ls9-commandbar' });
    const collectionLabel = el('label', { className: 'ls9-field' });
    collectionLabel.append(el('span', { className: 'ls9-field-label', rawText: text('Коллекция', 'Collection') }));
    const select = el('select', { className: 'ls9-select', ariaLabel: text('Выберите коллекцию', 'Select collection'), disabled: available.length === 0 });
    if (!available.length) select.append(el('option', { value: '', rawText: text('Нет доступных коллекций', 'No collections available') }));
    available.forEach(collection => select.append(el('option', {
      value: value(collection.id), rawText: collectionName(collection), selected: value(collection.id) === LS.collectionId,
    })));
    select.addEventListener('change', () => { resetForCollection(select.value); renderApp(); });
    collectionLabel.append(select);

    const searchLabel = el('label', { className: 'ls9-search' });
    searchLabel.append(icon('search'));
    const search = el('input', { type: 'search', value: LS.query,
      placeholder: text('Поиск по публикации, SKU или товару…', 'Search publication, SKU or product...'),
      ariaLabel: text('Поиск опубликованных листов', 'Search published linesheets') });
    search.addEventListener('input', () => { LS.query = search.value; });
    search.addEventListener('change', () => renderApp());
    search.addEventListener('keydown', event => { if (event.key === 'Enter') renderApp(); });
    searchLabel.append(search);

    const refresh = el('button', { className: 'ls9-filter-button', type: 'button' });
    refresh.append(icon('refresh'), el('span', { rawText: text('Обновить', 'Refresh') }));
    refresh.addEventListener('click', () => { LS.loadedCollectionId = ''; LS.nextCursor = null; LS.selectedId = ''; void loadPublications(); renderApp(); });
    bar.append(collectionLabel, searchLabel, refresh);
    return bar;
  }

  function metrics() {
    const publications = LS.items.length;
    const lines = LS.items.reduce((sum, publication) => sum + list(publication.lines).length, 0);
    const currencies = new Set(LS.items.map(publication => publication.currency).filter(Boolean)).size;
    const strip = el('section', { className: 'ls9-metrics', ariaLabel: text('Сводка опубликованных листов', 'Published linesheet summary') });
    [[text('Публикации', 'Publications'), publications], [text('Строки ассортимента', 'Assortment lines'), lines],
      [text('Валюты', 'Currencies'), currencies], [text('Режим', 'Mode'), text('Только чтение', 'Read only')]]
      .forEach(([label, metric]) => { const card = el('div', { className: 'ls9-metric' }); card.append(el('span', { className: 'ls9-metric-label', rawText: label }), el('strong', { rawText: String(metric) })); strip.append(card); });
    return strip;
  }

  function statusCell() {
    const cell = el('td');
    cell.append(el('span', { className: 'ls9-status ls9-status-published', rawText: text('Опубликовано', 'Published') }));
    return cell;
  }

  function publicationTable(publications) {
    const wrap = el('div', { className: 'ls9-table-wrap' });
    const table = el('table', { className: 'ls9-table' });
    const head = el('thead'); const headRow = el('tr');
    [text('Публикация', 'Publication'), text('Статус', 'Status'), text('Опубликовано', 'Published'), text('Валюта', 'Currency'), text('Позиций', 'Lines'), text('Контрольная сумма', 'Checksum')]
      .forEach(label => headRow.append(el('th', { rawText: label })));
    head.append(headRow);
    const body = el('tbody');
    publications.forEach(publication => {
      const row = el('tr', { className: `ls9-row ${LS.selectedId === publication.id ? 'selected' : ''}`.trim(), tabindex: '0' });
      const choose = () => { LS.selectedId = publication.id; renderApp(); };
      row.addEventListener('click', choose);
      row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
      row.append(el('td', { rawText: value(publication.id) || '—' }), statusCell(), el('td', { rawText: formatDate(publication.publishedAt) }),
        el('td', { rawText: value(publication.currency) || '—' }), el('td', { rawText: String(list(publication.lines).length) }),
        el('td', { rawText: shortHash(publication.contentHash), title: value(publication.contentHash) }));
      body.append(row);
    });
    table.append(head, body); wrap.append(table); return wrap;
  }

  function lineTable(publication) {
    const wrap = el('div', { className: 'ls9-table-wrap ls9-line-table-wrap' });
    const table = el('table', { className: 'ls9-table ls9-line-table' });
    const head = el('thead'); const row = el('tr');
    [text('SKU', 'SKU'), text('Наименование', 'Name'), text('Версия', 'Version'), text('Цена', 'Price'), text('MOQ', 'MOQ')]
      .forEach(label => row.append(el('th', { rawText: label })));
    head.append(row); const body = el('tbody');
    list(publication.lines).forEach(line => { const tr = el('tr'); tr.append(el('td', { rawText: value(line.sku) || '—' }), el('td', { rawText: value(line.name) || '—' }),
      el('td', { rawText: line.catalogVersion == null ? '—' : String(line.catalogVersion) }), el('td', { rawText: formatMoney(line.unitPrice, line.currency || publication.currency) }),
      el('td', { rawText: line.minimumOrderQuantity == null ? '—' : String(line.minimumOrderQuantity) })); body.append(tr); });
    table.append(head, body); wrap.append(table); return wrap;
  }

  function inspector(publication) {
    const aside = el('aside', { className: 'ls9-inspector' });
    if (!publication) { aside.append(el('div', { className: 'ls9-empty', rawText: text('Выберите опубликованный лист.', 'Select a published linesheet.') })); return aside; }
    const header = el('div', { className: 'ls9-inspector-head' }); const title = el('div');
    title.append(el('span', { className: 'ls9-eyebrow', rawText: text('Неизменяемый коммерческий snapshot', 'Immutable commercial snapshot') }), el('h3', { rawText: value(publication.id) || text('Публикация', 'Publication') }));
    header.append(title, el('span', { className: 'ls9-status ls9-status-published', rawText: text('Опубликовано', 'Published') }));
    const info = el('dl', { className: 'ls9-info-grid' });
    [[text('Коллекция', 'Collection'), value(publication.collectionId) || '—'], [text('Валюта', 'Currency'), value(publication.currency) || '—'],
      [text('Опубликовано', 'Published'), formatDate(publication.publishedAt)], [text('Позиций', 'Lines'), String(list(publication.lines).length)], [text('Контрольная сумма', 'Checksum'), value(publication.contentHash) || '—']]
      .forEach(([label, content]) => { const item = el('div', { className: 'ls9-info-item' }); item.append(el('dt', { rawText: label }), el('dd', { rawText: content })); info.append(item); });
    const sectionTitle = el('div', { className: 'ls9-section-title' });
    sectionTitle.append(el('h4', { rawText: text('Опубликованный ассортимент', 'Published assortment') }), el('span', { rawText: text('Только чтение', 'Read only') }));
    const actions = el('div', { className: 'ls9-actions' });
    const printButton = el('button', { className: 'button', type: 'button', rawText: text('Печать', 'Print') }); printButton.addEventListener('click', () => global.print());
    const exportButton = el('button', { className: 'button primary', type: 'button', rawText: text('Экспорт CSV', 'Export CSV') }); exportButton.addEventListener('click', () => exportPublication(publication));
    actions.append(printButton, exportButton); aside.append(header, info, sectionTitle, lineTable(publication), actions); return aside;
  }

  function exportPublication(publication) {
    const headers = ['sku', 'name', 'catalogVersion', 'unitPrice', 'currency', 'minimumOrderQuantity'];
    const escapeCsv = input => `"${String(input ?? '').replaceAll('"', '""')}"`;
    const rows = list(publication.lines).map(line => headers.map(key => escapeCsv(line[key])).join(','));
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url;
    link.download = `${value(publication.id) || 'commercial-publication'}.csv`; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }

  function statePanel(className, title, description, action) {
    const panel = el('section', { className: `ls9-state ${className}`.trim() }); panel.append(el('h3', { rawText: title }), el('p', { rawText: description })); if (action) panel.append(action); return panel;
  }

  function content() {
    if (!collections().length) return statePanel('ls9-empty', text('Нет доступных коллекций', 'No collections available'), text('Сначала создайте или откройте коллекцию. Linesheets не создаёт демонстрационные коммерческие данные.', 'Create or open a collection first. Linesheets does not create demonstration commercial data.'));
    if (LS.loading && !LS.items.length) return statePanel('ls9-loading', text('Загрузка опубликованных листов…', 'Loading published linesheets...'), text('Получаем неизменяемые коммерческие snapshots из серверного реестра.', 'Fetching immutable commercial snapshots from the server registry.'));
    if (LS.error && !LS.items.length) { const retry = el('button', { className: 'button', type: 'button', rawText: text('Повторить', 'Retry') }); retry.addEventListener('click', () => { LS.loadedCollectionId = ''; void loadPublications(); renderApp(); }); return statePanel('ls9-error', text('Не удалось загрузить публикации', 'Could not load publications'), LS.error, retry); }
    if (!LS.items.length) return statePanel('ls9-empty', text('Опубликованных листов пока нет', 'No published linesheets yet'), text('После коммерческой публикации коллекции immutable snapshot появится здесь автоматически.', 'After the collection is commercially published, its immutable snapshot will appear here automatically.'));
    const filtered = filteredPublications(); const selected = LS.items.find(item => item.id === LS.selectedId) || LS.items[0] || null;
    const layout = el('section', { className: 'ls9-layout' }); const registry = el('div', { className: 'ls9-registry' }); const registryHead = el('div', { className: 'ls9-section-title' });
    registryHead.append(el('h3', { rawText: text('Реестр публикаций', 'Publication registry') }), el('span', { rawText: `${filtered.length}/${LS.items.length}` })); registry.append(registryHead);
    registry.append(filtered.length ? publicationTable(filtered) : el('div', { className: 'ls9-empty', rawText: text('По вашему запросу ничего не найдено.', 'No publications match your search.') }));
    if (LS.nextCursor) { const loadMore = el('button', { className: 'button ls9-load-more', type: 'button', disabled: LS.loadingMore, rawText: LS.loadingMore ? text('Загрузка…', 'Loading...') : text('Загрузить ещё', 'Load more') }); loadMore.addEventListener('click', () => { void loadPublications({ append: true }); renderApp(); }); registry.append(loadMore); }
    if (LS.error) registry.append(el('div', { className: 'ls9-inline-error', rawText: LS.error }));
    layout.append(registry, inspector(selected)); return layout;
  }

  function renderLinesheets() {
    ensureLoad();
    const page = el('div', { className: 'ls9-view' }); const header = el('header', { className: 'ls9-header' }); const copy = el('div');
    copy.append(el('span', { className: 'ls9-eyebrow', rawText: 'Commercial Publication' }), el('h2', { rawText: text('Листы коллекций', 'Linesheets') }),
      el('p', { rawText: text('Опубликованная коммерческая версия коллекции. Данные только для чтения и не вычисляются в браузере.', 'Published commercial version of a collection. Data is read-only and is never derived in the browser.') }));
    header.append(copy, el('span', { className: 'ls9-readonly', rawText: text('Только опубликованные данные', 'Published data only') }));
    page.append(header, toolbar(), metrics(), content()); return page;
  }

  const previousRenderView = renderView;
  renderView = function renderViewWithLinesheets() { if (state.view === 'linesheets') return renderLinesheets(); return previousRenderView(); };
  global.SynthaLinesheetsWorkspace = Object.freeze({ render: renderLinesheets, rows: () => LS.items, reload: () => { LS.loadedCollectionId = ''; return loadPublications(); } });
})(window);
