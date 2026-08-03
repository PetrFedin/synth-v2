(function installPlanningWorkspaceV6() {
  'use strict';

  const core = window.SynthaPlanningCore;
  if (!core) throw new Error('SynthaPlanningCore must load before planning.js');
  const nav = OD_V5_GROUPS.flatMap((group) => group.items).find((item) => item.en === 'Line Plan' || item.en === 'Planning');
  if (nav) { nav.view = 'planning'; nav.ru = '\u041f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435'; nav.en = 'Planning'; nav.planned = false; }

  function text(ru, en) { return localText(ru, en); }
  function riskLabel(code) {
    const labels = {
      INVALID_OR_MISSING_TIMELINE: ['\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0435 \u0438\u043b\u0438 \u043d\u0435\u043f\u043e\u043b\u043d\u044b\u0435 \u0434\u0430\u0442\u044b', 'Missing or invalid dates'],
      NO_COLLECTIONS: ['\u041d\u0435\u0442 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0439', 'No collections'],
      NO_PUBLISHED_COLLECTION: ['\u041d\u0435\u0442 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u043e\u0439 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'No published collection'],
      NO_ASSORTMENT: ['\u041d\u0435\u0442 SKU', 'No SKU'],
      DRAFT_SKUS_REMAIN: ['\u041e\u0441\u0442\u0430\u043b\u0438\u0441\u044c \u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u0438 SKU', 'Draft SKU remain'],
      NO_LINE_SHEET: ['\u041d\u0435\u0442 linesheet', 'No linesheet'],
      LINE_SHEET_NOT_OPEN: ['Linesheet \u043d\u0435 \u043e\u0442\u043a\u0440\u044b\u0442', 'Linesheet is not open'],
      NO_COMMERCIAL_EXECUTION: ['\u041d\u0435\u0442 \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u043e\u0433\u043e \u0437\u0430\u043f\u0443\u0441\u043a\u0430', 'No commercial execution'],
      CAMPAIGN_OVERDUE: ['\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f \u043f\u0440\u043e\u0441\u0440\u043e\u0447\u0435\u043d\u0430', 'Campaign overdue'],
    };
    const pair = labels[code] || [code, code];
    return text(pair[0], pair[1]);
  }
  function readiness(item) {
    const node = el('div', { className: 'industrial-readiness' });
    const bar = el('span', { className: 'industrial-readiness-bar', ariaHidden: 'true' });
    const fill = el('span', { className: 'industrial-readiness-fill', ariaHidden: 'true' });
    fill.style.width = `${item.readiness}%`;
    bar.append(fill);
    node.append(bar, el('strong', { rawText: `${item.readiness}%` }));
    return node;
  }
  function riskBadge(item) {
    return el('span', { className: `badge industrial-risk ${item.highestRisk}`, rawText: item.risks.length ? riskLabel(item.risks[0].code) : text('\u0413\u043e\u0442\u043e\u0432', 'Ready') });
  }
  function inspector(item) {
    const risks = item.risks.length
      ? odMiniTable([text('\u041e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u0438\u0435', 'Exception'), text('\u0423\u0440\u043e\u0432\u0435\u043d\u044c', 'Severity')], item.risks.map((risk) => [riskLabel(risk.code), statusBadge(risk.severity)]))
      : notice(text('\u041a\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0445 \u043e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u0438\u0439 \u043d\u0435\u0442', 'No critical exceptions'), 'success');
    return odInspector({
      title: item.campaign.name || item.campaign.id,
      subtitle: `${orgName(item.campaign.brandId)} - ${item.campaign.season || '-'}`,
      status: item.campaign.status,
      tabs: [text('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'), text('\u0420\u0438\u0441\u043a\u0438', 'Risks'), text('\u0421\u0432\u044f\u0437\u0438', 'Dependencies')],
      fields: [
        { label: text('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'), value: `${item.readiness}%` },
        { label: text('\u041f\u0435\u0440\u0438\u043e\u0434', 'Period'), value: `${formatDate(item.campaign.startsAt)} - ${formatDate(item.campaign.endsAt)}` },
        { label: text('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collections'), value: `${item.counts.publishedCollections}/${item.counts.collections}` },
        { label: 'SKU', value: `${item.counts.publishedSkus}/${item.counts.skus}` },
        { label: 'Linesheets', value: `${item.counts.openShowrooms}/${item.counts.showrooms}` },
        { label: text('\u041e\u0442\u0431\u043e\u0440\u044b', 'Selections'), value: item.counts.selections },
        { label: text('\u0417\u0430\u043a\u0430\u0437\u044b', 'Orders'), value: item.counts.orders },
      ],
      content: [risks],
      actions: [odCampaignAction(item.campaign)],
    });
  }
  function renderPlanning() {
    const portfolio = core.buildPortfolio(state.workspace, new Date());
    const caps = window.SynthaUiCapabilities;
    const header = odHeader('planning', [
      { id: 'portfolio', label: text('\u041f\u043e\u0440\u0442\u0444\u0435\u043b\u044c', 'Portfolio') },
      { id: 'timeline', label: text('\u0422\u0430\u0439\u043c\u043b\u0430\u0439\u043d', 'Timeline') },
      { id: 'exceptions', label: text('\u0418\u0441\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f', 'Exceptions') },
    ], [
      { label: text('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438', 'Campaigns'), value: portfolio.summary.total, detail: `${portfolio.summary.active} ${text('\u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445', 'active')}` },
      { label: text('\u0421\u0440\u0435\u0434\u043d\u044f\u044f \u0433\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Average readiness'), value: `${portfolio.summary.averageReadiness}%`, detail: text('\u043f\u043e \u043f\u043e\u0440\u0442\u0444\u0435\u043b\u044e', 'portfolio') },
      { label: text('\u041a\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435', 'Critical'), value: portfolio.summary.criticalCampaigns, detail: `${portfolio.summary.riskCount} ${text('\u0440\u0438\u0441\u043a\u043e\u0432', 'risks')}` },
      { label: text('\u041f\u0440\u043e\u0441\u0440\u043e\u0447\u0435\u043d\u044b', 'Overdue'), value: portfolio.summary.overdueCampaigns, detail: text('\u0442\u0440\u0435\u0431\u0443\u044e\u0442 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f', 'need action') },
      { label: text('\u0421\u0442\u0430\u0440\u0442 \u0434\u043e 30 \u0434\u043d\u0435\u0439', 'Starts within 30 days'), value: portfolio.summary.upcoming30Days, detail: text('\u0431\u043b\u0438\u0436\u0430\u0439\u0448\u0438\u0435', 'upcoming') },
    ], ['draft', 'open', 'closed', 'cancelled'], text('\u041f\u043e\u0438\u0441\u043a \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0438 \u0438\u043b\u0438 \u0441\u0435\u0437\u043e\u043d\u0430', 'Search campaign or season'), caps.hasAny(state.workspace, caps.CAPABILITIES.CAMPAIGN_MANAGE, 'brand') ? odAction(text('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e', 'Create campaign'), campaignForm) : null);
    let rows = portfolio.campaigns;
    if (header.active === 'timeline') rows = [...rows].sort((left, right) => String(left.campaign.startsAt || '').localeCompare(String(right.campaign.startsAt || '')));
    if (header.active === 'exceptions') rows = rows.filter((item) => item.risks.length);
    const registry = odRegistry({
      scope: 'od-planning', filterScope: 'planning', rows, rowKey: (item) => item.campaign.id,
      statusAccessor: (item) => item.campaign.status,
      columns: [
        { label: text('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f', 'Campaign'), value: (item) => item.campaign.name || item.campaign.id },
        { label: text('\u0421\u0435\u0437\u043e\u043d', 'Season'), value: (item) => item.campaign.season || '-' },
        { label: text('\u041f\u0435\u0440\u0438\u043e\u0434', 'Period'), value: (item) => `${formatDate(item.campaign.startsAt)} - ${formatDate(item.campaign.endsAt)}` },
        { label: text('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'), render: readiness },
        { label: text('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collections'), value: (item) => `${item.counts.publishedCollections}/${item.counts.collections}` },
        { label: 'SKU', value: (item) => `${item.counts.publishedSkus}/${item.counts.skus}` },
        { label: text('\u0420\u0438\u0441\u043a', 'Risk'), render: riskBadge },
        { label: text('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: (item) => statusBadge(item.campaign.status) },
      ],
      inspector,
    });
    return odPage(text('\u041f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0439', 'Collection planning'), header, registry);
  }

  const previousRenderView = renderView;
  renderView = function renderPlanningView() { return state.view === 'planning' ? renderPlanning() : previousRenderView(); };
  const previousViewTitle = viewTitle;
  viewTitle = function planningViewTitle(view) { return view === 'planning' ? text('\u041f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435', 'Planning') : previousViewTitle(view); };
  const previousViewSectionName = viewSectionName;
  viewSectionName = function planningSection(view) { return view === 'planning' ? 'PLM / Planning' : previousViewSectionName(view); };
})();
