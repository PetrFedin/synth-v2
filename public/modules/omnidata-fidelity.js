const OD_FIDELITY = window.SynthaOmnidataFidelity || (window.SynthaOmnidataFidelity = {
  enhancedTables: new WeakSet(),
  enhancedInspectors: new WeakSet(),
  enhancedBars: new WeakSet(),
});

function odFidelityText(ru, en) {
  return localText(ru, en);
}

function odFidelityButton(className, label, text = '') {
  return el('button', {
    className,
    type: 'button',
    ariaLabel: label,
    rawText: text,
  });
}

function odFidelityStatusStrip() {
  document.querySelectorAll('.od-metrics').forEach((metrics) => {
    if (metrics.classList.contains('od-status-strip')) return;
    metrics.classList.add('od-status-strip');
    metrics.querySelectorAll('.od-metric').forEach((metric, index) => {
      metric.classList.remove('od-metric');
      metric.classList.add('od-status-card');
      if (index === 0) metric.classList.add('active');
      const dot = el('span', { className: 'od-status-dot', ariaHidden: 'true' });
      metric.prepend(dot);
      const label = metric.querySelector('.od-metric-label');
      const value = metric.querySelector('.od-metric-value');
      const detail = metric.querySelector('.od-metric-detail');
      if (label) label.className = 'od-status-label';
      if (value) value.className = 'od-status-value';
      detail?.remove();
    });
  });
}

function odFidelityFilterButton() {
  const button = odFidelityButton(
    'od-filter-button',
    odFidelityText('\u0424\u0438\u043b\u044c\u0442\u0440\u044b', 'Filters'),
    odFidelityText('\u0424\u0438\u043b\u044c\u0442\u0440\u044b', 'Filters'),
  );
  button.addEventListener('click', () => {
    const firstSelect = button.parentElement?.querySelector('.od-filter select');
    firstSelect?.focus();
  });
  return button;
}

function odFidelityViewGlyph(type) {
  return el('span', { className: `od-view-glyph ${type}`, ariaHidden: 'true' });
}

function odFidelityViewToggle() {
  const group = el('div', {
    className: 'od-view-toggle',
    role: 'group',
    ariaLabel: odFidelityText('\u0420\u0435\u0436\u0438\u043c \u043e\u0442\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u044f', 'View mode'),
  });
  const list = odFidelityButton('od-view-button active', odFidelityText('\u0421\u043f\u0438\u0441\u043e\u043a', 'List'));
  const grid = odFidelityButton('od-view-button', odFidelityText('\u0421\u0435\u0442\u043a\u0430', 'Grid'));
  list.append(odFidelityViewGlyph('list'));
  grid.append(odFidelityViewGlyph('grid'));
  const activate = (active, passive) => {
    active.classList.add('active');
    passive.classList.remove('active');
  };
  list.addEventListener('click', () => activate(list, grid));
  grid.addEventListener('click', () => activate(grid, list));
  group.append(list, grid);
  return group;
}

function odFidelityCommandBars() {
  document.querySelectorAll('.od-commandbar').forEach((bar) => {
    if (!OD_FIDELITY.enhancedBars.has(bar)) {
      OD_FIDELITY.enhancedBars.add(bar);
      const search = bar.querySelector('.od-search');
      if (search) search.after(odFidelityFilterButton());
      const more = odFidelityButton(
        'od-more-button',
        odFidelityText('\u0414\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f', 'More actions'),
        '\u2026',
      );
      const primary = bar.querySelector(':scope > .button');
      const spacer = el('span', { className: 'od-commandbar-spacer', ariaHidden: 'true' });
      bar.append(more, spacer, odFidelityViewToggle());
      if (primary) bar.append(primary);
    }
    const view = bar.closest('.od-view');
    const master = view?.querySelector('.od-master');
    if (master && bar.parentElement !== master) master.prepend(bar);
  });
}

function odFidelitySelectCell(all = false) {
  const cell = el(all ? 'th' : 'td', { className: 'od-select-cell' });
  const input = el('input', {
    className: 'od-select-control',
    type: 'checkbox',
    ariaLabel: all
      ? odFidelityText('\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0432\u0441\u0435', 'Select all')
      : odFidelityText('\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0441\u0442\u0440\u043e\u043a\u0443', 'Select row'),
  });
  input.addEventListener('click', (event) => event.stopPropagation());
  cell.append(input);
  return cell;
}

function odFidelityNumberCell(index) {
  return el('td', { className: 'od-number-cell', rawText: String(index + 1) });
}

function odFidelityMenuCell() {
  const cell = el('td', { className: 'od-action-cell' });
  const button = odFidelityButton(
    'od-row-menu',
    odFidelityText('\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044f \u0441\u0442\u0440\u043e\u043a\u0438', 'Row actions'),
    '\u2026',
  );
  button.addEventListener('click', (event) => event.stopPropagation());
  cell.append(button);
  return cell;
}

function odFidelityFooter(count) {
  const footer = el('footer', { className: 'od-table-footer' });
  const summary = el('span', {
    rawText: count
      ? `${odFidelityText('\u041f\u043e\u043a\u0430\u0437\u0430\u043d\u043e', 'Shown')} 1\u2013${count} ${odFidelityText('\u0438\u0437', 'of')} ${count}`
      : odFidelityText('\u041d\u0435\u0442 \u0437\u0430\u043f\u0438\u0441\u0435\u0439', 'No records'),
  });
  const pages = el('nav', {
    className: 'od-pagination',
    ariaLabel: odFidelityText('\u041f\u0430\u0433\u0438\u043d\u0430\u0446\u0438\u044f', 'Pagination'),
  });
  const previous = odFidelityButton('od-page-button', odFidelityText('\u041f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0430\u044f \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0430', 'Previous page'), '\u2039');
  previous.disabled = true;
  const current = odFidelityButton('od-page-button active', odFidelityText('\u0421\u0442\u0440\u0430\u043d\u0438\u0446\u0430 1', 'Page 1'), '1');
  const second = odFidelityButton('od-page-button', odFidelityText('\u0421\u0442\u0440\u0430\u043d\u0438\u0446\u0430 2', 'Page 2'), '2');
  const third = odFidelityButton('od-page-button', odFidelityText('\u0421\u0442\u0440\u0430\u043d\u0438\u0446\u0430 3', 'Page 3'), '3');
  const next = odFidelityButton('od-page-button', odFidelityText('\u0421\u043b\u0435\u0434\u0443\u044e\u0449\u0430\u044f \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0430', 'Next page'), '\u203a');
  if (count <= 10) {
    second.disabled = true;
    third.disabled = true;
    next.disabled = true;
  }
  pages.append(previous, current, second, third, next);
  const pageSize = el('select', {
    className: 'od-page-size',
    ariaLabel: odFidelityText('\u0417\u0430\u043f\u0438\u0441\u0435\u0439 \u043d\u0430 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0435', 'Rows per page'),
  });
  [10, 25, 50].forEach((value) => pageSize.append(el('option', {
    value,
    rawText: `${value} ${odFidelityText('\u043d\u0430 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0435', 'per page')}`,
  })));
  footer.append(summary, pages, pageSize);
  return footer;
}

function odFidelityTables() {
  document.querySelectorAll('.od-table').forEach((table) => {
    if (OD_FIDELITY.enhancedTables.has(table)) return;
    OD_FIDELITY.enhancedTables.add(table);
    const header = table.querySelector('thead tr');
    if (header) {
      header.prepend(odFidelitySelectCell(true), el('th', { className: 'od-number-cell', rawText: '\u2116' }));
      header.append(el('th', {
        className: 'od-action-cell',
        rawText: odFidelityText('\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044f', 'Actions'),
      }));
      const selectAll = header.querySelector('.od-select-control');
      selectAll?.addEventListener('change', () => {
        table.querySelectorAll('tbody .od-select-control').forEach((checkbox) => {
          checkbox.checked = selectAll.checked;
        });
      });
    }
    const rows = [...table.querySelectorAll('tbody tr')];
    rows.forEach((row, index) => {
      row.prepend(odFidelitySelectCell(false), odFidelityNumberCell(index));
      row.append(odFidelityMenuCell());
      const checkbox = row.querySelector('.od-select-control');
      checkbox?.addEventListener('change', () => row.classList.toggle('checked', checkbox.checked));
    });
    const master = table.closest('.od-master');
    if (master && !master.querySelector(':scope > .od-table-footer')) master.append(odFidelityFooter(rows.length));
  });
}

function odFidelityGallery(title, subtitle) {
  const gallery = el('section', {
    className: 'od-preview-gallery',
    ariaLabel: odFidelityText('\u0413\u0430\u043b\u0435\u0440\u0435\u044f', 'Gallery'),
  });
  const labels = [title, subtitle, title, subtitle, title].filter(Boolean);
  labels.slice(0, 5).forEach((label, index) => gallery.append(odPreview(label, `${index + 1}`)));
  gallery.append(el('span', { className: 'od-preview-more', rawText: '+10' }));
  return gallery;
}

function odFidelityDescription(text) {
  const section = el('section', { className: 'od-inspector-description' });
  section.append(
    el('h4', { rawText: odFidelityText('\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435', 'Description') }),
    el('p', { rawText: text || odFidelityText('\u041a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0430\u044f \u0438 \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u0430\u044f \u0438\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044f \u043f\u043e \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u043c\u0443 \u043e\u0431\u044a\u0435\u043a\u0442\u0443.', 'Commercial and operational information for the selected object.') }),
  );
  return section;
}

function odFidelityRelatedData(inspector) {
  const values = [...inspector.querySelectorAll('.od-definition-item dd')]
    .map((node) => node.textContent.trim())
    .filter((value) => value && value !== '\u2014')
    .slice(0, 3);
  const section = el('section', { className: 'od-related-data' });
  section.append(el('h4', { rawText: odFidelityText('\u0421\u0432\u044f\u0437\u0430\u043d\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b', 'Related data') }));
  const tags = el('div', { className: 'od-related-tags' });
  (values.length ? values : ['Syntha', 'Omnidata']).forEach((value) => tags.append(el('span', { className: 'od-related-tag', rawText: value })));
  section.append(tags);
  return section;
}

function odFidelityInspectors() {
  document.querySelectorAll('.od-inspector').forEach((inspector) => {
    if (OD_FIDELITY.enhancedInspectors.has(inspector)) return;
    OD_FIDELITY.enhancedInspectors.add(inspector);
    const head = inspector.querySelector(':scope > .od-inspector-head');
    const title = head?.querySelector('.od-inspector-title');
    const heading = title?.querySelector('h3')?.textContent.trim() || odFidelityText('\u041e\u0431\u044a\u0435\u043a\u0442', 'Object');
    const subtitle = title?.querySelector('p')?.textContent.trim() || '';
    if (head && title) {
      const main = el('div', { className: 'od-inspector-head-main' });
      const code = el('span', { className: 'od-inspector-code', rawText: String(heading).slice(0, 12).toUpperCase() });
      const kicker = title.querySelector('.od-inspector-kicker');
      kicker?.after(code);
      main.append(title);
      const badge = head.querySelector('.badge');
      if (badge) {
        const statusLine = el('div', { className: 'od-inspector-status-line' });
        statusLine.append(badge);
        main.append(statusLine);
      }
      const tools = el('div', { className: 'od-inspector-tools' });
      tools.append(
        odFidelityButton('od-inspector-tool', odFidelityText('\u0415\u0449\u0435', 'More'), '\u2026'),
        odFidelityButton('od-inspector-tool', odFidelityText('\u0417\u0430\u043a\u0440\u044b\u0442\u044c', 'Close'), '\u00d7'),
      );
      head.append(main, tools);
    }
    const preview = inspector.querySelector(':scope > .od-preview');
    if (preview) preview.replaceWith(odFidelityGallery(heading, subtitle));
    const tabs = inspector.querySelector(':scope > .od-inspector-tabs');
    const description = odFidelityDescription(subtitle);
    if (tabs) tabs.before(description);
    else head?.after(description);
    const definitions = inspector.querySelector(':scope > .od-definition-grid');
    if (definitions) definitions.after(odFidelityRelatedData(inspector));
  });
}

function odFidelitySystemFooter() {
  const main = document.querySelector('.main');
  if (!main || main.querySelector(':scope > .od-system-footer')) return;
  const now = new Date();
  const time = now.toLocaleTimeString(I18N.getLocale() === 'en' ? 'en-GB' : 'ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const footer = el('footer', { className: 'od-system-footer' });
  footer.append(
    el('span', { rawText: `${odFidelityText('\u0412\u0440\u0435\u043c\u044f \u0441\u0435\u0440\u0432\u0435\u0440\u0430', 'Server time')}: ${time}` }),
    el('strong', { rawText: 'Syntha Fashion Operating System 2026' }),
    el('span', { rawText: 'v2.1.0' }),
  );
  main.append(footer);
}

function applyOmnidataVisualFidelity() {
  document.body.classList.add('omnidata-fidelity');
  odFidelityStatusStrip();
  odFidelityCommandBars();
  odFidelityTables();
  odFidelityInspectors();
  odFidelitySystemFooter();
}

const odFidelityRenderApp = renderApp;
renderApp = (...args) => {
  const result = odFidelityRenderApp(...args);
  applyOmnidataVisualFidelity();
  return result;
};
