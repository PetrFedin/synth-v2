(function installOmnidataV8() {
  'use strict';

  const BUILD = 'visual-20260804-8';
  const PAGE_CONTEXT = Object.freeze({
    overview: {
      ru: ['РАБОЧЕЕ ПРОСТРАНСТВО', 'Рабочий стол', 'Сводное состояние разработки, производства, продаж и операционных задач.'],
      en: ['WORKSPACE', 'Workspace', 'A consolidated view of product development, production, sales and operational tasks.'],
    },
    planning: {
      ru: ['РАЗРАБОТКА ПРОДУКТА', 'Планирование коллекций', 'Архитектура коллекции, ассортиментные цели, сроки и контроль критического пути.'],
      en: ['PRODUCT DEVELOPMENT', 'Collection planning', 'Collection architecture, assortment targets, deadlines and critical-path control.'],
    },
    catalog: {
      ru: ['РАЗРАБОТКА ПРОДУКТА', 'Коллекции и каталог', 'Единый реестр коллекций, моделей, артикулов, статусов публикации и коммерческой готовности.'],
      en: ['PRODUCT DEVELOPMENT', 'Collections and catalogue', 'A unified registry of collections, styles, SKUs, publication states and commercial readiness.'],
    },
    styles: {
      ru: ['РАЗРАБОТКА ПРОДУКТА', 'Модели и цветовые варианты', 'Управление моделями, цветовыми вариантами, размерными рядами и готовностью данных.'],
      en: ['PRODUCT DEVELOPMENT', 'Styles and colourways', 'Manage styles, colourways, size ranges and data readiness.'],
    },
    materials: {
      ru: ['РАЗРАБОТКА ПРОДУКТА', 'Материалы и фурнитура', 'Библиотека тканей, материалов и фурнитуры с поставщиками, ценами, остатками и статусами.'],
      en: ['PRODUCT DEVELOPMENT', 'Materials and trims', 'A library of fabrics, materials and trims with suppliers, prices, stock and statuses.'],
    },
    boms: {
      ru: ['РАЗРАБОТКА ПРОДУКТА', 'Спецификации и себестоимость', 'Состав изделия, нормы расхода, операции, накладные расходы и производственная себестоимость.'],
      en: ['PRODUCT DEVELOPMENT', 'BOM and costing', 'Product composition, consumption norms, operations, overheads and production costing.'],
    },
    measurements: {
      ru: ['РАЗРАБОТКА ПРОДУКТА', 'Таблицы измерений', 'Базовые измерения, градация размеров, допуски, версии и синхронизация с моделями.'],
      en: ['PRODUCT DEVELOPMENT', 'Measurement charts', 'Base measurements, size grading, tolerances, revisions and style synchronisation.'],
    },
    partners: {
      ru: ['ЗАКУПКИ И ПРОИЗВОДСТВО', 'Партнёры и поставщики', 'Контрагенты, производственные площадки, коммерческие условия и история взаимодействий.'],
      en: ['SOURCING AND PRODUCTION', 'Partners and suppliers', 'Counterparties, production sites, commercial terms and relationship history.'],
    },
    showrooms: {
      ru: ['ОПТОВАЯ ТОРГОВЛЯ', 'Оптовый шоурум', 'Публикация ассортимента, сезонные предложения и работа с байерами.'],
      en: ['WHOLESALE COMMERCE', 'B2B showroom', 'Assortment publishing, seasonal offers and buyer collaboration.'],
    },
    selections: {
      ru: ['ОПТОВАЯ ТОРГОВЛЯ', 'Ассортименты', 'Подборки товаров для клиентов, согласование количеств и подготовка оптового заказа.'],
      en: ['WHOLESALE COMMERCE', 'Assortments', 'Client product selections, quantity alignment and wholesale order preparation.'],
    },
    orders: {
      ru: ['ОПТОВАЯ ТОРГОВЛЯ', 'Оптовые заказы', 'Заказы, резервы, подтверждения, статусы исполнения, оплаты и отгрузки.'],
      en: ['WHOLESALE COMMERCE', 'Wholesale orders', 'Orders, reservations, confirmations, fulfilment states, payments and shipments.'],
    },
    calendar: {
      ru: ['ОПЕРАЦИОННОЕ УПРАВЛЕНИЕ', 'Календарь', 'Производственные, закупочные, коммерческие и маркетинговые события в едином календаре.'],
      en: ['OPERATIONS', 'Calendar', 'Production, sourcing, commercial and marketing events in one calendar.'],
    },
    notifications: {
      ru: ['ОПЕРАЦИОННОЕ УПРАВЛЕНИЕ', 'Уведомления', 'События, предупреждения, просроченные действия и изменения по рабочим процессам.'],
      en: ['OPERATIONS', 'Notifications', 'Events, warnings, overdue actions and workflow changes.'],
    },
  });

  const AUDIT_ROOTS = Object.freeze([
    '.sidebar',
    '.topbar',
    '.view-toolbar',
    '.od-tabs',
    '.od-status-strip',
    '.od-metrics',
    '.od-commandbar',
    '.od-table thead',
    '.od-table-footer',
    '.od-inspector',
    '.planning-toolbar',
    '.planning-filters',
    '.planning-table thead',
    '.styles-toolbar',
    '.styles-filters',
    '.styles-table thead',
    '.materials-toolbar',
    '.materials-filters',
    '.materials-table thead',
    '.bom-toolbar',
    '.bom-filters',
    '.bom-table thead',
    '.bom-inspector',
    '.measurement-toolbar',
    '.measurement-filters',
    '.measurement-table thead',
    '.measurement-inspector',
    '.notice',
    'dialog',
    '.form-shell',
  ]);

  function locale() {
    return I18N.getLocale() === 'en' ? 'en' : 'ru';
  }

  function currentContext() {
    return PAGE_CONTEXT[state?.view] || PAGE_CONTEXT.overview;
  }

  function contextText(index) {
    return currentContext()[locale()][index];
  }

  function normalizeTextNode(node) {
    const original = node.nodeValue;
    if (!original || !original.trim()) return;
    const translated = I18N.translate(original);
    if (translated !== original) node.nodeValue = translated;
  }

  function normalizeRoot(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      normalizeTextNode(node);
      node = walker.nextNode();
    }

    root.querySelectorAll('[title], [aria-label], input[placeholder], textarea[placeholder], option').forEach((element) => {
      for (const attribute of ['title', 'aria-label', 'placeholder']) {
        const value = element.getAttribute?.(attribute);
        if (!value) continue;
        const translated = I18N.translate(value);
        if (translated !== value) element.setAttribute(attribute, translated);
      }
      if (element.tagName === 'OPTION') {
        const original = element.textContent;
        const translated = I18N.translate(original);
        if (translated !== original) element.textContent = translated;
      }
    });
  }

  function applyDocumentLanguage() {
    const activeLocale = locale();
    document.documentElement.lang = activeLocale;
    document.body.dataset.locale = activeLocale;
    document.body.dataset.synthaVisual = BUILD;
    document.title = activeLocale === 'en'
      ? 'Syntha — Fashion Operating System'
      : 'Syntha — операционная система моды';
  }

  function applyBrandLanguage() {
    const tagline = document.querySelector('.brand small');
    if (tagline) tagline.textContent = locale() === 'en' ? 'Fashion Operating System' : 'Операционная система моды';
  }

  function applyPageContext() {
    const toolbar = document.querySelector('.view-toolbar');
    if (toolbar) {
      toolbar.dataset.section = contextText(0);
      toolbar.dataset.title = contextText(1);
      toolbar.setAttribute('aria-label', `${contextText(0)}: ${contextText(1)}`);
      const kicker = toolbar.querySelector('.toolbar-kicker');
      const title = toolbar.querySelector('.view-toolbar-copy > .muted');
      if (kicker) kicker.textContent = contextText(0);
      if (title) title.textContent = contextText(1);
      let description = toolbar.querySelector('.od-v8-page-description');
      if (!description) {
        description = document.createElement('p');
        description.className = 'od-v8-page-description';
        toolbar.querySelector('.view-toolbar-copy')?.append(description);
      }
      description.textContent = contextText(2);
    }

    const breadcrumb = document.querySelector('.breadcrumb');
    const current = breadcrumb?.querySelector('strong');
    if (current) current.textContent = contextText(1);
  }

  function applyLanguageControl() {
    const switcher = document.querySelector('.od-v7-language-switcher');
    if (!switcher) return;
    switcher.setAttribute('aria-label', locale() === 'en' ? 'Interface language' : 'Язык интерфейса');
    switcher.querySelectorAll('.language-option').forEach((button) => {
      const code = button.textContent.trim().toUpperCase();
      button.setAttribute('lang', code === 'EN' ? 'en' : 'ru');
      button.setAttribute('title', code === 'EN' ? 'English' : 'Русский');
      button.setAttribute('aria-label', code === 'EN' ? 'English interface' : 'Русский интерфейс');
    });
  }

  function applySystemFooter() {
    const footer = document.querySelector('.od-v7-system-footer');
    if (!footer) return;
    const parts = footer.querySelectorAll('span');
    if (parts[0]) parts[0].textContent = locale() === 'en' ? 'Server time: UTC+3' : 'Время сервера: UTC+3';
    const title = footer.querySelector('strong');
    if (title) title.textContent = locale() === 'en' ? 'Syntha Fashion Operating System' : 'Syntha — операционная система моды';
    if (parts.length) parts[parts.length - 1].textContent = BUILD;
  }

  function auditLanguage() {
    document.querySelectorAll(AUDIT_ROOTS.join(',')).forEach(normalizeRoot);
  }

  function applyOmnidataV8() {
    document.body.classList.add('omnidata-v8');
    applyDocumentLanguage();
    applyBrandLanguage();
    applyPageContext();
    applyLanguageControl();
    auditLanguage();
    applySystemFooter();
  }

  const previousRenderApp = renderApp;
  renderApp = (...args) => {
    const result = previousRenderApp(...args);
    applyOmnidataV8();
    return result;
  };

  window.SynthaOmnidataV8 = Object.freeze({
    build: BUILD,
    apply: applyOmnidataV8,
    audit: auditLanguage,
    pageContext: PAGE_CONTEXT,
  });
})();