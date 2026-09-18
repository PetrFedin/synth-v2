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



function odFidelityCommandBars() {
  document.querySelectorAll('.od-commandbar').forEach((bar) => {
    if (!OD_FIDELITY.enhancedBars.has(bar)) {
      OD_FIDELITY.enhancedBars.add(bar);
      const search = bar.querySelector('.od-search');
      if (search) search.after(odFidelityFilterButton());
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
  odFidelityInspectors();
}

const odFidelityRenderApp = renderApp;
renderApp = (...args) => {
  const result = odFidelityRenderApp(...args);
  applyOmnidataVisualFidelity();
  return result;
};
