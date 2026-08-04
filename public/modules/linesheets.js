(function installLinesheetsWorkspace(global) {
  'use strict';

  const LS = global.SynthaLinesheets || (global.SynthaLinesheets = {
    selectedId: '',
    query: '',
    status: 'all',
    season: 'all',
    tab: 'main',
    page: 1,
    pageSize: 10,
  });

  const STATUS_ORDER = ['active', 'draft', 'sent', 'viewed'];
  const STATUS_TEXT = Object.freeze({
    active: ['Активна', 'Active'],
    draft: ['Черновик', 'Draft'],
    sent: ['Отправлена', 'Sent'],
    viewed: ['Просмотрена', 'Viewed'],
  });
  const TABS = Object.freeze([
    ['main', 'Главная', 'Home'],
    ['relations', 'Карта связей', 'Relationship map'],
    ['roles', 'Матрица ролей', 'Role matrix'],
    ['sources', 'Источники', 'Sources'],
    ['history', 'История изменений', 'Change history'],
  ]);

  function text(ru, en) { return localText(ru, en); }
  function list(input) { return Array.isArray(input) ? input : []; }
  function value(input) { return String(input ?? '').trim(); }
  function finiteNumber(input, fallback = 0) {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function collectionStatus(collection) {
    const raw = value(collection.status).toLowerCase();
    if (raw === 'published' || raw === 'active' || raw === 'open') return 'active';
    if (raw === 'sent' || raw === 'submitted') return 'sent';
    if (raw === 'viewed' || raw === 'closed' || raw === 'completed') return 'viewed';
    return 'draft';
  }

  function collectionSeason(collection) {
    return value(collection.season || collection.seasonName || collection.code || collection.campaignName)
      || text('Без сезона', 'No season');
  }

  function formatDate(raw) {
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(I18N.getLocale() === 'en' ? 'en-GB' : 'ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(date);
  }

  function daysAgo(raw) {
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
    if (I18N.getLocale() === 'en') return days === 0 ? 'today' : `${days} days ago`;
    if (days === 0) return 'сегодня';
    if (days % 10 === 1 && days % 100 !== 11) return `${days} день назад`;
    if ([2, 3, 4].includes(days % 10) && ![12, 13, 14].includes(days % 100)) return `${days} дня назад`;
    return `${days} дней назад`;
  }

  function organisationById(id) {
    return list(state.workspace.organisations).find(item => item.id === id) || null;
  }

  function buyerFor(collection) {
    const selection = list(state.workspace.selections).find(item => item.collectionId === collection.id);
    const buyerId = selection?.retailerId || selection?.buyerId || selection?.organisationId;
    const organisation = buyerId ? organisationById(buyerId) : null;
    return {
      name: value(organisation?.name) || text('Не назначен', 'Not assigned'),
      country: value(organisation?.country || organisation?.market || organisation?.address?.country)
        || value(collection.country || collection.market)
        || text('Не указан', 'Not specified'),
    };
  }

  function buildRows() {
    const collections = list(state.workspace.collections);
    const skus = list(state.workspace.catalogSkus);
    const selections = list(state.workspace.selections);
    return collections.map((collection, index) => {
      const relatedSkus = skus.filter(item => item.collectionId === collection.id);
      const relatedSelections = selections.filter(item => item.collectionId === collection.id);
      const buyer = buyerFor(collection);
      const updatedAt = collection.updatedAt || collection.publishedAt || collection.createdAt;
      return {
        id: value(collection.id) || `collection-${index + 1}`,
        code: value(collection.code) || `LS-${String(index + 1).padStart(3, '0')}`,
        title: value(collection.name) || text(`Лист коллекции ${index + 1}`, `Collection linesheet ${index + 1}`),
        subtitle: relatedSkus.length
          ? text(`${relatedSkus.length} товаров`, `${relatedSkus.length} products`)
          : text('Нет добавленных товаров', 'No products added'),
        buyer: buyer.name,
        country: buyer.country,
        collection: collectionSeason(collection),
        updatedAt,
        updatedDate: formatDate(updatedAt),
        updatedRelative: daysAgo(updatedAt),
        status: collectionStatus(collection),
        views: finiteNumber(collection.views ?? collection.viewCount, 0),
        selectionCount: relatedSelections.length,
        products: relatedSkus,
        productCount: relatedSkus.length,
        description: value(collection.description) || text(
          'Лист коллекции объединяет ассортимент, коммерческие условия, материалы и связанные данные для работы с покупателем.',
          'The linesheet brings together the assortment, commercial terms, materials and related data for buyer collaboration.',
        ),
      };
    });
  }

  function sampleRows() {
    const names = I18N.getLocale() === 'en'
      ? ['Fall 2026 Main Line', 'Spring 2026 Preview', 'Resort 2026', 'Pre-Order Summer']
      : ['Основная линия Осень 2026', 'Предпросмотр Весна 2026', 'Круизная коллекция 2026', 'Предзаказ Лето'];
    return names.map((title, index) => ({
      id: `sample-${index + 1}`,
      code: `LS-${125 + index}`,
      title,
      subtitle: text('Демонстрационная структура', 'Demonstration structure'),
      buyer: text('Не назначен', 'Not assigned'),
      country: text('Не указан', 'Not specified'),
      collection: title,
      updatedAt: '',
      updatedDate: '—',
      updatedRelative: '',
      status: STATUS_ORDER[index],
      views: 0,
      selectionCount: 0,
      products: [],
      productCount: 0,
      example: true,
      description: text(
        'Создайте коллекцию и добавьте товары — этот пример будет автоматически заменён реальными данными Syntha.',
        'Create a collection and add products — this example will be replaced automatically with real Syntha data.',
      ),
    }));
  }

  function rows() {
    const actual = buildRows();
    return actual.length ? actual : sampleRows();
  }

  function badge(status) {
    const pair = STATUS_TEXT[status] || STATUS_TEXT.draft;
    return el('span', {
      className: `ls9-status ls9-status-${status}`,
      rawText: text(pair[0], pair[1]),
    });
  }

  function thumbnail(row, position = 0) {
    const sku = row.products[position];
    const title = value(sku?.name || row.title);
    const node = el('div', { className: `ls9-thumb ls9-thumb-${(position % 6) + 1}`, title });
    node.append(el('span', { rawText: initials(title || row.code) }));
    return node;
  }

  function tabs() {
    const nav = el('nav', { className: 'ls9-tabs', ariaLabel: text('Вкладки листов коллекций', 'Linesheet tabs') });
    TABS.forEach(([id, ru, en]) => {
      const button = el('button', {
        className: `ls9-tab ${LS.tab === id ? 'active' : ''}`.trim(),
        type: 'button',
        rawText: text(ru, en),
        ariaPressed: LS.tab === id ? 'true' : 'false',
      });
      button.addEventListener('click', () => {
        LS.tab = id;
        if (id !== 'main') toast(text(
          'Раздел будет связан с данными листа коллекции.',
          'This section will be linked to the linesheet data.',
        ));
        renderApp();
      });
      nav.append(button);
    });
    return nav;
  }

  function metrics(allRows) {
    const strip = el('section', { className: 'ls9-metrics', ariaLabel: text('Статусы листов коллекций', 'Linesheet statuses') });
    const definitions = [
      ['all', text('Все листы', 'All linesheets'), allRows.length],
      ...STATUS_ORDER.map(status => [
        status,
        text(STATUS_TEXT[status][0], STATUS_TEXT[status][1]),
        allRows.filter(row => row.status === status).length,
      ]),
    ];
    definitions.forEach(([id, label, count]) => {
      const button = el('button', {
        className: `ls9-metric ${LS.status === id ? 'active' : ''}`.trim(),
        type: 'button',
        ariaPressed: LS.status === id ? 'true' : 'false',
      });
      button.append(
        el('span', { className: `ls9-metric-dot tone-${id}`, ariaHidden: 'true' }),
        el('span', { className: 'ls9-metric-label', rawText: label }),
        el('strong', { rawText: String(count) }),
      );
      button.addEventListener('click', () => { LS.status = id; LS.page = 1; renderApp(); });
      strip.append(button);
    });
    return strip;
  }

  function controls(allRows) {
    const bar = el('section', { className: 'ls9-commandbar' });
    const search = el('label', { className: 'ls9-search' });
    search.append(icon('search'));
    const input = el('input', {
      type: 'search',
      value: LS.query,
      placeholder: text('Поиск листа, покупателя, коллекции…', 'Search linesheet, buyer, collection...'),
      ariaLabel: text('Поиск листов коллекций', 'Search linesheets'),
    });
    input.addEventListener('change', () => { LS.query = input.value.trim(); LS.page = 1; renderApp(); });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { LS.query = input.value.trim(); LS.page = 1; renderApp(); }
    });
    search.append(input);

    const filter = el('button', { className: 'ls9-filter-button', type: 'button' });
    filter.append(icon('selections'), el('span', { rawText: text('Фильтры', 'Filters') }));
    filter.addEventListener('click', () => toast(text(
      'Расширенные фильтры будут открываться в боковой панели.',
      'Advanced filters will open in a side panel.',
    )));

    const status = el('select', { className: 'ls9-select', ariaLabel: text('Фильтр по статусу', 'Filter by status') });
    [['all', text('Статус', 'Status')], ...STATUS_ORDER.map(item => [item, text(STATUS_TEXT[item][0], STATUS_TEXT[item][1])])]
      .forEach(([id, label]) => {
        const option = el('option', { value: id, rawText: label, selected: LS.status === id });
        status.append(option);
      });
    status.addEventListener('change', () => { LS.status = status.value; LS.page = 1; renderApp(); });

    const seasons = [...new Set(allRows.map(row => row.collection).filter(Boolean))];
    const season = el('select', { className: 'ls9-select', ariaLabel: text('Фильтр по сезону', 'Filter by season') });
    season.append(el('option', { value: 'all', rawText: text('Сезон', 'Season'), selected: LS.season === 'all' }));
    seasons.forEach(item => season.append(el('option', {
      value: item,
      rawText: item,
      selected: LS.season === item,
    })));
    season.addEventListener('change', () => { LS.season = season.value; LS.page = 1; renderApp(); });

    const more = el('button', { className: 'ls9-icon-button', type: 'button', rawText: '•••', ariaLabel: text('Дополнительные действия', 'More actions') });
    const spacer = el('span', { className: 'ls9-command-spacer', ariaHidden: 'true' });
    const listButton = el('button', { className: 'ls9-view-button active', type: 'button', ariaLabel: text('Список', 'List') });
    listButton.append(el('span', { className: 'ls9-list-glyph', ariaHidden: 'true' }));
    const gridButton = el('button', { className: 'ls9-view-button', type: 'button', ariaLabel: text('Сетка', 'Grid') });
    gridButton.append(el('span', { className: 'ls9-grid-glyph', ariaHidden: 'true' }));
    gridButton.addEventListener('click', () => toast(text(
      'Сеточный режим будет добавлен после товарной галереи.',
      'Grid mode will follow the product gallery.',
    )));

    bar.append(search, filter, status, season, more, spacer, listButton, gridButton);
    return bar;
  }

  function filteredRows(allRows) {
    const query = LS.query.toLocaleLowerCase();
    return allRows.filter(row => {
      if (LS.status !== 'all' && row.status !== LS.status) return false;
      if (LS.season !== 'all' && row.collection !== LS.season) return false;
      if (!query) return true;
      return [row.code, row.title, row.buyer, row.country, row.collection]
        .join(' ').toLocaleLowerCase().includes(query);
    });
  }

  function tableRow(row, index) {
    const tr = el('tr', { className: `ls9-row ${LS.selectedId === row.id ? 'selected' : ''}`.trim(), tabindex: '0' });
    const selectRow = () => { LS.selectedId = row.id; renderApp(); };
    tr.addEventListener('click', selectRow);
    tr.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectRow(); }
    });

    const checkboxCell = el('td', { className: 'ls9-check-cell' });
    const checkbox = el('input', {
      type: 'checkbox',
      checked: LS.selectedId === row.id,
      ariaLabel: text('Выбрать строку', 'Select row'),
    });
    checkbox.addEventListener('click', event => { event.stopPropagation(); LS.selectedId = row.id; renderApp(); });
    checkboxCell.append(checkbox);

    const numberCell = el('td', { className: 'ls9-number-cell', rawText: String(index + 1) });
    const nameCell = el('td', { className: 'ls9-name-cell' });
    const name = el('div', { className: 'ls9-name-copy' });
    name.append(
      el('strong', { rawText: row.code }),
      el('span', { rawText: row.title }),
      el('small', { rawText: row.subtitle }),
    );
    nameCell.append(thumbnail(row), name);

    const buyerCell = el('td');
    buyerCell.append(el('strong', { rawText: row.buyer }), el('small', { rawText: row.country }));
    const collectionCell = el('td', { rawText: row.collection });
    const dateCell = el('td');
    dateCell.append(el('strong', { rawText: row.updatedDate }), el('small', { rawText: row.updatedRelative }));
    const statusCell = el('td'); statusCell.append(badge(row.status));
    const viewsCell = el('td', { className: 'ls9-views-cell', rawText: String(row.views) });
    const actionsCell = el('td', { className: 'ls9-actions-cell' });
    const actions = el('button', { className: 'ls9-row-menu', type: 'button', rawText: '•••', ariaLabel: text('Действия строки', 'Row actions') });
    actions.addEventListener('click', event => {
      event.stopPropagation();
      toast(text('Меню действий листа коллекции.', 'Linesheet actions menu.'));
    });
    actionsCell.append(actions);
    tr.append(checkboxCell, numberCell, nameCell, buyerCell, collectionCell, dateCell, statusCell, viewsCell, actionsCell);
    return tr;
  }

  function registry(allRows) {
    const filtered = filteredRows(allRows);
    const totalPages = Math.max(1, Math.ceil(filtered.length / LS.pageSize));
    LS.page = Math.min(Math.max(1, LS.page), totalPages);
    const offset = (LS.page - 1) * LS.pageSize;
    const visible = filtered.slice(offset, offset + LS.pageSize);
    if (!LS.selectedId || !filtered.some(row => row.id === LS.selectedId)) LS.selectedId = filtered[0]?.id || allRows[0]?.id || '';

    const master = el('section', { className: 'ls9-master' });
    const tableWrap = el('div', { className: 'ls9-table-wrap' });
    const table = el('table', { className: 'ls9-table' });
    const thead = el('thead');
    const head = el('tr');
    [
      '', '№', text('Лист коллекции', 'Linesheet'), text('Покупатель / Ретейл', 'Buyer / Retailer'),
      text('Коллекция', 'Collection'), text('Дата обновления', 'Updated'), text('Статус', 'Status'),
      text('Просмотры', 'Views'), text('Действия', 'Actions'),
    ].forEach((label, index) => head.append(el('th', { className: index === 0 ? 'ls9-check-cell' : '', rawText: label })));
    thead.append(head);
    const tbody = el('tbody');
    visible.forEach((row, index) => tbody.append(tableRow(row, offset + index)));
    table.append(thead, tbody);
    tableWrap.append(table);
    if (!visible.length) tableWrap.append(el('div', {
      className: 'ls9-empty',
      rawText: text('По выбранным фильтрам данных нет.', 'No data matches the selected filters.'),
    }));

    const footer = el('footer', { className: 'ls9-table-footer' });
    const start = visible.length ? offset + 1 : 0;
    const end = offset + visible.length;
    footer.append(el('span', { rawText: text(`Показано ${start}–${end} из ${filtered.length}`, `Showing ${start}–${end} of ${filtered.length}`) }));
    const pages = el('div', { className: 'ls9-pagination' });
    const prev = el('button', {
      type: 'button', rawText: '‹', disabled: LS.page <= 1,
      ariaLabel: text('Предыдущая страница', 'Previous page'),
    });
    prev.addEventListener('click', () => { LS.page -= 1; renderApp(); });
    pages.append(prev);
    for (let page = 1; page <= Math.min(totalPages, 5); page += 1) {
      const button = el('button', { className: LS.page === page ? 'active' : '', type: 'button', rawText: String(page) });
      button.addEventListener('click', () => { LS.page = page; renderApp(); });
      pages.append(button);
    }
    const next = el('button', {
      type: 'button', rawText: '›', disabled: LS.page >= totalPages,
      ariaLabel: text('Следующая страница', 'Next page'),
    });
    next.addEventListener('click', () => { LS.page += 1; renderApp(); });
    pages.append(next);
    const size = el('select', { className: 'ls9-page-size', ariaLabel: text('Записей на странице', 'Rows per page') });
    [10, 25, 50].forEach(count => size.append(el('option', {
      value: count,
      rawText: text(`${count} на странице`, `${count} per page`),
      selected: LS.pageSize === count,
    })));
    size.addEventListener('change', () => { LS.pageSize = Number(size.value); LS.page = 1; renderApp(); });
    footer.append(pages, size);
    master.append(tableWrap, footer);
    return { master, selected: filtered.find(row => row.id === LS.selectedId) || allRows[0] };
  }

  function infoItem(label, content) {
    const node = el('div', { className: 'ls9-info-item' });
    node.append(el('span', { rawText: label }), el('strong', { rawText: content || '—' }));
    return node;
  }

  function inspector(row) {
    const aside = el('aside', { className: 'ls9-inspector' });
    if (!row) return aside;
    const header = el('header', { className: 'ls9-inspector-header' });
    const title = el('div', { className: 'ls9-inspector-title' });
    title.append(
      el('span', { className: 'ls9-code', rawText: row.code }),
      el('h2', { rawText: row.title }),
      el('p', { rawText: row.collection }),
    );
    const tools = el('div', { className: 'ls9-inspector-tools' });
    tools.append(badge(row.status));
    const more = el('button', { type: 'button', rawText: '•••', ariaLabel: text('Дополнительные действия', 'More actions') });
    const close = el('button', { type: 'button', rawText: '×', ariaLabel: text('Закрыть панель', 'Close panel') });
    close.addEventListener('click', () => { LS.selectedId = ''; renderApp(); });
    tools.append(more, close);
    header.append(title, tools);

    const summary = el('div', { className: 'ls9-inspector-summary' });
    [
      [String(row.productCount), text('товаров', 'products')],
      [row.buyer, text('покупатель', 'buyer')],
      [row.collection, text('коллекция', 'collection')],
      [row.updatedDate, text('обновлено', 'updated')],
    ].forEach(([primary, secondary]) => {
      const item = el('div');
      item.append(el('strong', { rawText: primary }), el('span', { rawText: secondary }));
      summary.append(item);
    });

    const nav = el('nav', { className: 'ls9-inspector-tabs' });
    [text('Обзор', 'Overview'), text('Товары', 'Products'), text('Покупатели', 'Buyers'), text('Статистика', 'Statistics'), text('История', 'History')]
      .forEach((label, index) => nav.append(el('button', { className: index === 0 ? 'active' : '', type: 'button', rawText: label })));

    const gallery = el('div', { className: 'ls9-gallery' });
    const previewCount = Math.max(5, Math.min(6, row.products.length || 5));
    for (let index = 0; index < previewCount; index += 1) gallery.append(thumbnail(row, index));
    if (row.productCount > 5) gallery.append(el('div', { className: 'ls9-gallery-more', rawText: `+${row.productCount - 5}` }));

    const description = el('section', { className: 'ls9-description' });
    description.append(el('h3', { rawText: text('Описание', 'Description') }), el('p', { rawText: row.description }));
    if (row.example) description.append(el('span', { className: 'ls9-example-note', rawText: text('Примерный режим', 'Sample mode') }));

    const info = el('section', { className: 'ls9-info-grid' });
    info.append(
      infoItem(text('Сезон', 'Season'), row.collection),
      infoItem(text('Коллекция', 'Collection'), row.title),
      infoItem(text('Тип', 'Type'), text('Лист коллекции', 'Linesheet')),
      infoItem(text('Товаров', 'Products'), String(row.productCount)),
      infoItem(text('Дата обновления', 'Updated'), row.updatedDate),
      infoItem(text('Статус', 'Status'), text(STATUS_TEXT[row.status][0], STATUS_TEXT[row.status][1])),
    );

    const related = el('section', { className: 'ls9-related' });
    related.append(el('h3', { rawText: text('Связанные данные', 'Related data') }));
    const tags = el('div');
    [row.buyer, row.collection, text('Ассортимент', 'Assortment')]
      .forEach(item => tags.append(el('button', { type: 'button', rawText: item })));
    tags.append(el('button', { type: 'button', rawText: '+' }));
    related.append(tags);

    const actions = el('footer', { className: 'ls9-inspector-actions' });
    const open = el('button', { className: 'button primary', type: 'button', rawText: text('Открыть лист', 'Open linesheet') });
    const edit = el('button', { className: 'button', type: 'button', rawText: text('Редактировать', 'Edit') });
    const share = el('button', { className: 'button', type: 'button', rawText: text('Поделиться', 'Share') });
    open.addEventListener('click', () => toast(text('Лист коллекции открыт в рабочем режиме.', 'Linesheet opened in workspace mode.'), 'success'));
    edit.addEventListener('click', () => toast(text('Редактирование будет связано с коллекцией и SKU.', 'Editing will be linked to the collection and SKUs.'));
    share.addEventListener('click', () => toast(text('Ссылка для покупателя будет сформирована после публикации.', 'The buyer link will be generated after publication.'));
    actions.append(open, edit, share);

    aside.append(header, summary, nav, gallery, description, info, related, actions);
    return aside;
  }

  function renderLinesheets() {
    const allRows = rows();
    if (!LS.selectedId) LS.selectedId = allRows[0]?.id || '';
    const page = el('div', { className: 'ls9-view' });
    page.append(tabs(), metrics(allRows), controls(allRows));
    const registryNode = registry(allRows);
    const layout = el('section', { className: 'ls9-layout' });
    layout.append(registryNode.master, inspector(registryNode.selected));
    page.append(layout);
    return page;
  }

  const previousRenderView = renderView;
  renderView = function renderViewWithLinesheets() {
    if (state.view === 'linesheets') return renderLinesheets();
    return previousRenderView();
  };

  global.SynthaLinesheetsWorkspace = Object.freeze({
    render: renderLinesheets,
    rows,
  });
})(window);
