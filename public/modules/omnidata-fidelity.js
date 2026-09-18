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
  // This used to move focus into the status select and call that filtering. It opens the attribute
  // filter panel for the registry on screen, and carries the number of filters currently applied.
  const scope = typeof OD_UI !== 'undefined' && OD_UI.registry ? Object.keys(OD_UI.registry).at(-1) : null;
  const applied = scope && typeof odActiveFilterCount === 'function' ? odActiveFilterCount(scope) : 0;
  if (applied > 0) {
    button.classList.add('od-filter-button-active');
    button.append(el('span', { className: 'od-filter-button-count', rawText: String(applied) }));
  }
  button.addEventListener('click', () => {
    if (!scope) return;
    OD_UI.filterPanel = OD_UI.filterPanel === scope ? null : scope;
    OD_UI.columnPanel = null;
    OD_UI.filterPanelQuery = '';
    renderApp();
  });
  return button;
}



function odFidelityColumnButton() {
  // (className, ariaLabel, visibleText) — the spoken name carries the detail, the face stays short.
  const button = odFidelityButton(
    'od-column-button',
    odFidelityText('\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u043a\u043e\u043b\u043e\u043d\u043a\u0438 \u0440\u0430\u0437\u0434\u0435\u043b\u0430', 'Choose the columns for this section'),
    odFidelityText('\u041a\u043e\u043b\u043e\u043d\u043a\u0438', 'Columns'),
  );
  const scope = typeof OD_UI !== 'undefined' && OD_UI.registry ? Object.keys(OD_UI.registry).at(-1) : null;
  const hidden = scope && typeof odHiddenColumnCount === 'function' ? odHiddenColumnCount(scope) : 0;
  if (hidden > 0) {
    button.classList.add('od-filter-button-active');
    button.append(el('span', { className: 'od-filter-button-count', rawText: String(hidden) }));
  }
  button.addEventListener('click', () => {
    if (!scope) return;
    OD_UI.columnPanel = OD_UI.columnPanel === scope ? null : scope;
    OD_UI.filterPanel = null;
    renderApp();
  });
  return button;
}

function odFidelityCommandBars() {
  document.querySelectorAll('.od-commandbar').forEach((bar) => {
    if (!OD_FIDELITY.enhancedBars.has(bar)) {
      OD_FIDELITY.enhancedBars.add(bar);
      const search = bar.querySelector('.od-search');
      // Both buttons act on the registry that sits below the bar. The dashboard has a command bar
      // but no registry, so mounting them there produced two controls that could open nothing.
      const hasRegistry = Boolean(bar.closest('.od-view')?.querySelector('.od-master .od-table'));
      if (search && hasRegistry) {
        const filters = odFidelityFilterButton();
        search.after(filters);
        filters.after(odFidelityColumnButton());
      }
      const primary = bar.querySelector(':scope > .button');
      const spacer = el('span', { className: 'od-commandbar-spacer', ariaHidden: 'true' });
      bar.append(spacer);
      if (primary) bar.append(primary);
    }
    const view = bar.closest('.od-view');
    const master = view?.querySelector('.od-master');
    if (master && bar.parentElement !== master) master.prepend(bar);
  });
}


function odFidelityNumberCell(index) {
  return el('td', { className: 'od-number-cell', rawText: String(index + 1) });
}



// Every workspace table is laid out with table-layout:fixed against one min-width, so a nine-column
// register squeezed each cell to 94px and silently clipped RFQ codes and status badges. The table
// states how many columns it has and the stylesheet gives it the width those columns need; the wrap
// scrolls when the viewport is narrower. Full values stay reachable through the cell's title.
function odFidelityTableWidths() {
  document.querySelectorAll('.od-table, .sourcing-table, .bom-table, .measurement-table, .sample-table, .ls9-table, .planning-table, .styles-table, .materials-table').forEach((table) => {
    const count = table.querySelectorAll('thead tr:first-child > th').length;
    if (!count) return;
    [...table.classList].filter((name) => name.startsWith('od-cols-')).forEach((name) => table.classList.remove(name));
    table.classList.add(`od-cols-${Math.min(Math.max(count, 3), 14)}`);
    table.querySelectorAll('tbody td').forEach((cell) => {
      const value = (cell.textContent || '').trim();
      if (value && !cell.title) cell.title = value;
    });
  });
}

function odFidelityTables() {
  document.querySelectorAll('.od-table').forEach((table) => {
    if (OD_FIDELITY.enhancedTables.has(table)) return;
    OD_FIDELITY.enhancedTables.add(table);
    const header = table.querySelector('thead tr');
    if (header) {
      header.prepend(el('th', { className: 'od-number-cell', rawText: '\u2116' }));
    }
    const rows = [...table.querySelectorAll('tbody tr')];
    rows.forEach((row, index) => { row.prepend(odFidelityNumberCell(index)); });
  });
}


function odFidelityDescription(text) {
  const section = el('section', { className: 'od-inspector-description' });
  section.append(
    el('h4', { rawText: odFidelityText('\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435', 'Description') }),
    el('p', { rawText: text || odFidelityText('\u041a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0430\u044f \u0438 \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u0430\u044f \u0438\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044f \u043f\u043e \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u043c\u0443 \u043e\u0431\u044a\u0435\u043a\u0442\u0443.', 'Commercial and operational information for the selected object.') }),
  );
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
      // Hard-truncating to 12 characters produced labels like "\u0412\u042b\u0411\u0415\u0420\u0418\u0422\u0415 \u0417\u0410\u041f"; the full text is kept and CSS decides where it ends.
      const code = el('span', { className: 'od-inspector-code', rawText: String(heading).toUpperCase() });
      code.title = String(heading);
      const kicker = title.querySelector('.od-inspector-kicker');
      kicker?.after(code);
      main.append(title);
      const badge = head.querySelector('.badge');
      if (badge) {
        const statusLine = el('div', { className: 'od-inspector-status-line' });
        statusLine.append(badge);
        main.append(statusLine);
      }
      head.append(main);
    }
    const tabs = inspector.querySelector(':scope > .od-inspector-tabs');
    const description = odFidelityDescription(subtitle);
    if (tabs) tabs.before(description);
    else head?.after(description);
  });
}


function applyOmnidataVisualFidelity() {
  document.body.classList.add('omnidata-fidelity');
  odFidelityStatusStrip();
  odFidelityCommandBars();
  odFidelityTables();
  odFidelityTableWidths();
  odFidelityInspectors();
}

const odFidelityRenderApp = renderApp;
renderApp = (...args) => {
  const result = odFidelityRenderApp(...args);
  applyOmnidataVisualFidelity();
  return result;
};
