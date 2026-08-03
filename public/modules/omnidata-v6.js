const OD_V6 = window.SynthaOmnidataV6 || (window.SynthaOmnidataV6 = {
  applied: 0,
});

function odV6Text(ru, en) {
  return localText(ru, en);
}

function odV6RemoveV5Additions() {
  document.querySelectorAll('.od-v5-page-context, .od-v5-sidebar-search, .od-v5-command-title, .od-v5-inspector-section-title')
    .forEach((node) => node.remove());
}

function odV6Topbar() {
  const search = document.querySelector('.global-search input');
  if (search) {
    search.placeholder = odV6Text(
      '\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u043f\u043b\u0430\u0442\u0444\u043e\u0440\u043c\u0435: \u0444\u0443\u043d\u043a\u0446\u0438\u0438, \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b, \u0437\u0430\u043a\u0430\u0437\u044b, \u0431\u0430\u0439\u0435\u0440\u044b\u2026',
      'Search platform: features, materials, orders, buyers...',
    );
  }
}

function odV6StatusTones() {
  document.querySelectorAll('.od-status-card').forEach((card, index) => {
    card.classList.remove('success', 'warning', 'info');
    if (index === 1) card.classList.add('success');
    if (index === 2) card.classList.add('warning');
    if (index === 3) card.classList.add('info');
  });
}

function odV6Inspector() {
  document.querySelectorAll('.od-inspector').forEach((inspector) => {
    inspector.querySelectorAll('.od-v5-inspector-section-title').forEach((node) => node.remove());
    const tabs = inspector.querySelector('.od-inspector-tabs');
    if (tabs && tabs.children.length < 5) {
      const labels = [
        odV6Text('\u041e\u0431\u0437\u043e\u0440', 'Overview'),
        odV6Text('\u0422\u043e\u0432\u0430\u0440\u044b', 'Products'),
        odV6Text('\u041f\u0430\u0440\u0442\u043d\u0435\u0440\u044b', 'Partners'),
        odV6Text('\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430', 'Statistics'),
        odV6Text('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History'),
      ];
      tabs.replaceChildren(...labels.map((label, index) => el('span', {
        className: index === 0 ? 'active' : '',
        rawText: label,
      })));
    }
  });
}

function odV6SystemFooter() {
  document.querySelectorAll('.od-v6-system-footer').forEach((node) => node.remove());
  const shell = document.querySelector('.shell');
  if (!shell) return;
  const footer = el('footer', { className: 'od-v6-system-footer' });
  footer.append(
    el('span', { rawText: odV6Text('\u0412\u0440\u0435\u043c\u044f \u0441\u0435\u0440\u0432\u0435\u0440\u0430: UTC+3', 'Server time: UTC+3') }),
    el('strong', { rawText: 'Syntha Fashion Operating System' }),
    el('span', { rawText: 'visual-20260803-6' }),
  );
  shell.append(footer);
}

function applyOmnidataV6() {
  document.body.classList.add('omnidata-v6');
  odV6RemoveV5Additions();
  odV6Topbar();
  odV6StatusTones();
  odV6Inspector();
  odV6SystemFooter();
  OD_V6.applied += 1;
}

const odV6RenderApp = renderApp;
renderApp = (...args) => {
  const result = odV6RenderApp(...args);
  applyOmnidataV6();
  return result;
};
