(function installOmnidataV9(global) {
  'use strict';

  const BUILD = 'visual-20260804-9';
  const CONTEXT = Object.freeze({
    ru: ['ОПТОВАЯ ТОРГОВЛЯ', 'Листы коллекций', 'Ассортимент, покупатели, статусы публикации и коммерческие материалы в едином рабочем реестре.'],
    en: ['WHOLESALE COMMERCE', 'Linesheets', 'Assortment, buyers, publication statuses and commercial materials in one working registry.'],
  });

  const AUDIT_ROOTS = Object.freeze([
    '.ls9-tabs',
    '.ls9-metrics',
    '.ls9-commandbar',
    '.ls9-table thead',
    '.ls9-table-footer',
    '.ls9-inspector',
  ]);

  function locale() {
    return I18N.getLocale() === 'en' ? 'en' : 'ru';
  }

  function text(index) {
    return CONTEXT[locale()][index];
  }

  function normalizeRoot(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const original = node.nodeValue;
      if (original?.trim()) {
        const translated = I18N.translate(original);
        if (translated !== original) node.nodeValue = translated;
      }
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

  function applyLinesheetContext() {
    if (state.view !== 'linesheets') return;
    const breadcrumb = document.querySelector('.breadcrumb');
    const parts = breadcrumb?.querySelectorAll('.breadcrumb-muted');
    if (parts?.[1]) parts[1].textContent = text(0);
    const current = breadcrumb?.querySelector('strong');
    if (current) current.textContent = text(1);

    const search = document.querySelector('.global-search input');
    if (search) {
      search.placeholder = locale() === 'en'
        ? 'Search linesheets, collections, products and buyers...'
        : 'Поиск листов, коллекций, товаров и покупателей…';
      search.setAttribute('aria-label', search.placeholder);
    }
  }

  function applyBuild() {
    document.body.classList.add('omnidata-v9');
    document.body.dataset.synthaVisual = BUILD;
    const footer = document.querySelector('.od-v7-system-footer');
    const version = footer?.querySelector('span:last-child');
    if (version) version.textContent = BUILD;
  }

  function audit() {
    document.querySelectorAll(AUDIT_ROOTS.join(',')).forEach(normalizeRoot);
  }

  function apply() {
    applyBuild();
    applyLinesheetContext();
    audit();
  }

  const previousRenderApp = renderApp;
  renderApp = (...args) => {
    const result = previousRenderApp(...args);
    apply();
    return result;
  };

  global.SynthaOmnidataV9 = Object.freeze({ build: BUILD, apply, audit, context: CONTEXT });
})(window);
