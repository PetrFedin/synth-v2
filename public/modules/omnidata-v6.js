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

  // A colour on a counter is a claim about the number, so it follows the number.
  //
  // The tone used to be assigned by position: the second chip green, the third amber, the fourth
  // blue, on every screen in the product, whatever they counted. So «Черновики 0» was painted as
  // a warning — an alarm about an empty bucket — while a real backlog three chips along was grey.
  // Now a count of nothing is calm, a bucket that wants somebody's attention is amber only when
  // it holds something, and a bucket that means the work is done is green.
  const OD6_ATTENTION = /(\u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a|\u043e\u0436\u0438\u0434\u0430|\u0442\u0440\u0435\u0431\u0443|\u0437\u0430\u0431\u043b\u043e\u043a\u0438\u0440|\u043f\u0440\u043e\u0441\u0440\u043e\u0447|\u043d\u0435 \u043f\u0440\u043e\u0447\u0438\u0442|\u043e\u0442\u043a\u043b\u043e\u043d|\u0440\u0438\u0441\u043a|draft|pending|awaiting|blocked|overdue|unread|rejected|risk)/i;
  const OD6_SETTLED = /(\u043e\u0442\u043a\u0440\u044b\u0442|\u0433\u043e\u0442\u043e\u0432|\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434|\u0430\u043a\u0442\u0438\u0432\u043d|\u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432|\u0432\u044b\u043f\u0443\u0449|\u0434\u043e\u043f\u0443\u0449|open|ready|confirmed|active|published|released|accepted)/i;
  function od6StatusToneFor(card) {
    const label = (card.textContent || '').replace(/\s+/g, ' ').trim();
    const digits = label.match(/(\d[\d\u00a0\u202f ]*)\s*$/);
    const count = digits ? Number(digits[1].replace(/[^\d]/g, '')) : null;
    if (count === 0) return '';
    if (OD6_ATTENTION.test(label)) return 'warning';
    if (OD6_SETTLED.test(label)) return 'success';
    return '';
  }

function odV6StatusTones() {
  document.querySelectorAll('.od-status-card').forEach((card) => {
    card.classList.remove('success', 'warning', 'info');
    const tone = od6StatusToneFor(card);
    if (tone) card.classList.add(tone);
  });
}

function odV6Inspector() {
  // Tab labels belong to the module that built the inspector, and each tab switches a real panel,
  // so this layer only strips the leftover v5 section titles.
  document.querySelectorAll('.od-inspector').forEach((inspector) => {
    inspector.querySelectorAll('.od-v5-inspector-section-title').forEach((node) => node.remove());
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
