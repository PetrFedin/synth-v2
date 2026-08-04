(function installOmnidataV10(global) {
  'use strict';

  const BUILD = 'visual-20260804-10';
  const AUDIT_ROOTS = Object.freeze([
    '.sidebar',
    '.topbar',
    '.breadcrumb',
    '.global-search',
    '.od-tabs',
    '.od-metrics',
    '.od-status-strip',
    '.od-commandbar',
    '.od-table',
    '.od-table-footer',
    '.od-inspector',
    '.ls9-tabs',
    '.ls9-metrics',
    '.ls9-commandbar',
    '.ls9-table',
    '.ls9-table-footer',
    '.ls9-inspector',
    '.planning-page',
    '.styles-page',
    '.materials-page',
    '.bom-page',
    '.measurement-page',
    '.card',
    '.section',
    '.notice',
    'dialog',
    '.form-shell',
  ]);

  function locale() {
    return I18N.getLocale() === 'en' ? 'en' : 'ru';
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
        const current = element.getAttribute?.(attribute);
        if (!current) continue;
        const translated = I18N.translate(current);
        if (translated !== current) element.setAttribute(attribute, translated);
      }
      if (element.tagName === 'OPTION') {
        const current = element.textContent;
        const translated = I18N.translate(current);
        if (translated !== current) element.textContent = translated;
      }
    });
  }

  function normalizeGlobalShell() {
    document.documentElement.lang = locale();
    document.body.dataset.locale = locale();
    document.body.dataset.synthaVisual = BUILD;
    document.body.classList.add('omnidata-v10');

    const brandTagline = document.querySelector('.brand-copy small');
    if (brandTagline) brandTagline.textContent = locale() === 'en'
      ? 'Fashion Operating System'
      : 'Операционная система моды';

    const search = document.querySelector('.global-search input');
    if (search && state.view !== 'linesheets') {
      const placeholder = locale() === 'en'
        ? 'Search current section'
        : 'Поиск в текущем разделе';
      search.placeholder = placeholder;
      search.setAttribute('aria-label', placeholder);
    }

    const footer = document.querySelector('.od-v7-system-footer');
    const footerParts = footer?.querySelectorAll('span');
    if (footerParts?.[0]) footerParts[0].textContent = locale() === 'en'
      ? 'Server time: UTC+3'
      : 'Время сервера: UTC+3';
    const footerTitle = footer?.querySelector('strong');
    if (footerTitle) footerTitle.textContent = locale() === 'en'
      ? 'Syntha Fashion Operating System'
      : 'Syntha — операционная система моды';
    if (footerParts?.length) footerParts[footerParts.length - 1].textContent = BUILD;

    document.title = locale() === 'en'
      ? 'Syntha — Fashion Operating System'
      : 'Syntha — операционная система моды';
  }

  function audit() {
    document.querySelectorAll(AUDIT_ROOTS.join(',')).forEach(normalizeRoot);
  }

  function apply() {
    normalizeGlobalShell();
    audit();
  }

  const previousRenderApp = renderApp;
  renderApp = (...args) => {
    const result = previousRenderApp(...args);
    apply();
    return result;
  };

  global.SynthaOmnidataV10 = Object.freeze({ build: BUILD, apply, audit });
})(window);
