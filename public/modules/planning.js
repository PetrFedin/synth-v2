(function installPlanningModule() {
  'use strict';

  const core = window.SynthaPlanningCore;
  if (!core) throw new Error('SynthaPlanningCore must load before planning.js');

  const usesV5Navigation = typeof OD_V5_GROUPS !== 'undefined';
  const navigationGroups = usesV5Navigation ? OD_V5_GROUPS : OD_V4_GROUPS;
  const planningNav = navigationGroups
    .flatMap((group) => group.items)
    .find((item) => item.en === 'Line Plan' || item.en === 'Planning');
  if (planningNav) {
    if (usesV5Navigation) planningNav.view = 'planning';
    else planningNav.id = 'planning';
    planningNav.ru = '\u041f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435';
    planningNav.en = 'Planning';
    planningNav.planned = false;
  }

  function planningText(ru, en) {
    return localText(ru, en);
  }

  function planningRiskLabel(code) {
    const labels = {
      INVALID_OR_MISSING_TIMELINE: [
        '\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0435 \u0438\u043b\u0438 \u043d\u0435\u043f\u043e\u043b\u043d\u044b\u0435 \u0434\u0430\u0442\u044b',
        'Missing or invalid dates',
      ],
      NO_COLLECTIONS: ['\u041d\u0435\u0442 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0439', 'No collections'],
      NO_PUBLISHED_COLLECTION: ['\u041d\u0435\u0442 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u043e\u0439 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'No published collection'],
      NO_ASSORTMENT: ['\u041d\u0435\u0442 SKU', 'No SKU'],
      DRAFT_SKUS_REMAIN: ['\u041e\u0441\u0442\u0430\u043b\u0438\u0441\u044c \u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u0438 SKU', 'Draft SKU remain'],
      NO_LINE_SHEET: ['\u041d\u0435\u0442 linesheet', 'No linesheet'],
      LINE_SHEET_NOT_OPEN: ['Linesheet \u043d\u0435 \u043e\u0442\u043a\u0440\u044b\u0442', 'Linesheet is not open'],
      NO_COMMERCIAL_EXECUTION: ['\u041d\u0435\u0442 \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u043e\u0433\u043e \u0446\u0438\u043a\u043b\u0430 \u0438\u043b\u0438 \u0437\u0430\u043a\u0430\u0437\u0430', 'No commercial cycle or order'],
      CAMPAIGN_OVERDUE: ['\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f \u043f\u0440\u043e\u0441\u0440\u043e\u0447\u0435\u043d\u0430', 'Campaign overdue'],
    };
    const pair = labels[code] || [code, code];
    return planningText(pair[0], pair[1]);
  }

  function readinessBadge(value) {
    const tone = value >= 80 ? 'success' : value >= 55 ? 'warning' : 'danger';
    return el('span', { className: `planning-readiness ${tone}`, rawText: `${value}%` });
  }

  function gateRow(label, value, maximum) {
    const row = el('div', { className: 'planning-gate-row' });
    const percent = maximum ? Math.round((value / maximum) * 100) : 0;
    const track = el('span', { className: 'planning-gate-track' });
    track.append(el('span', { className: 'planning-gate-fill', style: `width:${percent}%` }));
    row.append(
      el('span', { rawText: label }),
      track,
      el('strong', { rawText: `${value}/${maximum}` }),
    );
    return row;
  }

  function riskList(item) {
    const list = el('div', { className: 'planning-risk-list' });
    if (!item.risks.length) {
      list.append(el('div', { className: 'planning-risk-empty', rawText: planningText('\u041a\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0445 \u043e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u0438\u0439 \u043d\u0435\u0442', 'No critical exceptions') }));
      return list;
    }
    item.risks.forEach((risk) => {
      const row = el('div', { className: `planning-risk ${risk.severity}` });
      row.append(
        el('span', { className: 'planning-risk-severity', rawText: statusLabel(risk.severity) }),
        el('strong', { rawText: planningRiskLabel(risk.code) }),
      );
      list.append(row);
    });
    return list;
  }

  function planningInspector(item) {
    const gates = el('section', { className: 'planning-gates' });
    gates.append(
      gateRow(planningText('\u0421\u0440\u043e\u043a\u0438', 'Timeline'), item.gateScores.timeline, 15),
      gateRow(planningText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collections'), item.gateScores.collection, 10),
      gateRow(planningText('\u041f\u0443\u0431\u043b\u0438\u043a\u0430\u0446\u0438\u044f', 'Publishing'), item.gateScores.publishedCollection, 15),
      gateRow(planningText('\u0410\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442', 'Assortment'), item.gateScores.assortment, 25),
      gateRow('Linesheet', item.gateScores.showroom, 20),
      gateRow(planningText('\u041a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0439 \u0446\u0438\u043a\u043b', 'Commercial execution'), item.gateScores.commercialExecution, 15),
    );

    return odInspector({
      title: item.campaign.name || item.campaign.id,
      subtitle: `${orgName(item.campaign.brandId)} \u00b7 ${item.campaign.season || '\u2014'}`,
      status: item.campaign.status,
      tabs: [planningText('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'), planningText('\u0420\u0438\u0441\u043a\u0438', 'Risks'), planningText('\u0421\u0432\u044f\u0437\u0438', 'Dependencies')],
      fields: [
        { label: planningText('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'), value: `${item.readiness}%` },
        { label: planningText('\u041d\u0430\u0447\u0430\u043b\u043e', 'Starts'), value: formatDate(item.campaign.startsAt) },
        { label: planningText('\u041e\u043a\u043e\u043d\u0447\u0430\u043d\u0438\u0435', 'Ends'), value: formatDate(item.campaign.endsAt) },
        { label: planningText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collections'), value: item.counts.collections },
        { label: 'SKU', value: `${item.counts.publishedSkus}/${item.counts.skus}` },
        { label: 'Linesheet', value: `${item.counts.openShowrooms}/${item.counts.showrooms}` },
        { label: planningText('\u0426\u0438\u043a\u043b\u044b', 'Cycles'), value: item.counts.cycles },
        { label: planningText('\u0417\u0430\u043a\u0430\u0437\u044b', 'Orders'), value: item.counts.orders },
      ],
      content: [gates, riskList(item)],
    });
  }

  function portfolioRegistry(portfolio) {
    return odRegistry({
      scope: 'planning-portfolio',
      filterScope: 'planning',
      rows: portfolio.campaigns,
      rowKey: (item) => item.campaign.id,
      statusAccessor: (item) => item.campaign.status,
      columns: [
        { label: planningText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f', 'Campaign'), value: (item) => item.campaign.name || item.campaign.id },
        { label: planningText('\u0411\u0440\u0435\u043d\u0434', 'Brand'), value: (item) => orgName(item.campaign.brandId) },
        { label: planningText('\u0421\u0435\u0437\u043e\u043d', 'Season'), value: (item) => item.campaign.season || '\u2014' },
        { label: planningText('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'), render: (item) => readinessBadge(item.readiness) },
        { label: planningText('\u0420\u0438\u0441\u043a\u0438', 'Risks'), value: (item) => item.risks.length },
        { label: planningText('\u041e\u043a\u043e\u043d\u0447\u0430\u043d\u0438\u0435', 'Ends'), value: (item) => formatDate(item.campaign.endsAt) },
        { label: planningText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: (item) => statusBadge(item.campaign.status) },
      ],
      inspector: planningInspector,
    });
  }

  function timelineView(portfolio) {
    const host = el('section', { className: 'planning-timeline' });
    if (!portfolio.campaigns.length) {
      host.append(el('div', { className: 'od-empty', rawText: planningText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438 \u0435\u0449\u0451 \u043d\u0435 \u0441\u043e\u0437\u0434\u0430\u043d\u044b', 'No campaigns created') }));
      return host;
    }
    portfolio.campaigns.forEach((item) => {
      const row = el('article', { className: 'planning-timeline-row' });
      const progress = el('div', { className: 'planning-timeline-progress' });
      progress.append(el('span', { style: `width:${item.readiness}%` }));
      const copy = el('div', { className: 'planning-timeline-copy' });
      copy.append(
        el('strong', { rawText: item.campaign.name || item.campaign.id }),
        el('span', { rawText: `${formatDate(item.campaign.startsAt)} \u2192 ${formatDate(item.campaign.endsAt)}` }),
      );
      row.append(copy, progress, readinessBadge(item.readiness));
      host.append(row);
    });
    return host;
  }

  function riskView(portfolio) {
    const rows = portfolio.campaigns.flatMap((item) => item.risks.map((risk) => ({ item, risk })));
    return odTable('planning-risks', rows, [
      { label: planningText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f', 'Campaign'), value: (row) => row.item.campaign.name || row.item.campaign.id },
      { label: planningText('\u0423\u0440\u043e\u0432\u0435\u043d\u044c', 'Severity'), render: (row) => statusBadge(row.risk.severity) },
      { label: planningText('\u041e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u0438\u0435', 'Exception'), value: (row) => planningRiskLabel(row.risk.code) },
      { label: planningText('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'), render: (row) => readinessBadge(row.item.readiness) },
    ], (row) => `${row.item.campaign.id}:${row.risk.code}`).node;
  }

  function renderPlanning() {
    const portfolio = core.buildPortfolio(state.workspace, new Date());
    const caps = window.SynthaUiCapabilities;
    const canCreate = caps?.hasAny?.(state.workspace, caps.CAPABILITIES.CAMPAIGN_MANAGE, 'brand');
    const header = odHeader('planning', [
      { id: 'portfolio', label: planningText('\u041f\u043e\u0440\u0442\u0444\u0435\u043b\u044c', 'Portfolio') },
      { id: 'timeline', label: planningText('\u0422\u0430\u0439\u043c\u043b\u0430\u0439\u043d', 'Timeline') },
      { id: 'risks', label: planningText('\u0420\u0438\u0441\u043a\u0438', 'Risks') },
    ], [
      { label: planningText('\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0438', 'Active campaigns'), value: portfolio.summary.active, detail: `${portfolio.summary.total} ${planningText('\u0432\u0441\u0435\u0433\u043e', 'total')}` },
      { label: planningText('\u0421\u0440\u0435\u0434\u043d\u044f\u044f \u0433\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Average readiness'), value: `${portfolio.summary.averageReadiness}%`, detail: planningText('\u043f\u043e \u0432\u0441\u0435\u043c \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044f\u043c', 'across all campaigns') },
      { label: planningText('\u041a\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435', 'Critical'), value: portfolio.summary.criticalCampaigns, detail: planningText('\u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0438 \u0441 \u0431\u043b\u043e\u043a\u0435\u0440\u0430\u043c\u0438', 'campaigns with blockers'), tone: portfolio.summary.criticalCampaigns ? 'warning' : 'success' },
      { label: planningText('\u041f\u0440\u043e\u0441\u0440\u043e\u0447\u0435\u043d\u043e', 'Overdue'), value: portfolio.summary.overdueCampaigns, detail: planningText('\u043d\u0435 \u0437\u0430\u043a\u0440\u044b\u0442\u043e \u0432 \u0441\u0440\u043e\u043a', 'not closed on time'), tone: portfolio.summary.overdueCampaigns ? 'warning' : 'success' },
      { label: planningText('\u0421\u0442\u0430\u0440\u0442 \u0432 30 \u0434\u043d\u0435\u0439', 'Starts in 30 days'), value: portfolio.summary.upcoming30Days, detail: planningText('\u0431\u043b\u0438\u0436\u0430\u0439\u0448\u0438\u0435 \u0437\u0430\u043f\u0443\u0441\u043a\u0438', 'upcoming launches') },
    ], ['draft', 'open', 'closed'], planningText('\u041f\u043e\u0438\u0441\u043a \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0438, \u0441\u0435\u0437\u043e\u043d\u0430 \u0438\u043b\u0438 \u0431\u0440\u0435\u043d\u0434\u0430', 'Search campaign, season or brand'), canCreate ? odAction(planningText('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e', 'Create campaign'), campaignForm) : null);

    const content = header.active === 'timeline'
      ? timelineView(portfolio)
      : header.active === 'risks'
        ? riskView(portfolio)
        : portfolioRegistry(portfolio);
    return odPage(planningText('\u041f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0439', 'Collection planning'), header, content);
  }

  const baseRenderView = renderView;
  renderView = function renderIndustrialView() {
    return state.view === 'planning' ? renderPlanning() : baseRenderView();
  };

  const baseViewTitle = viewTitle;
  viewTitle = function industrialViewTitle(view) {
    return view === 'planning' ? planningText('\u041f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435', 'Planning') : baseViewTitle(view);
  };

  const baseViewSectionName = viewSectionName;
  viewSectionName = function industrialViewSectionName(view) {
    return view === 'planning' ? planningText('\u0420\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0430', 'Development') : baseViewSectionName(view);
  };

  function applyPlanningV5Context() {
    if (state.view !== 'planning') return;
    const context = document.querySelector('.od-v5-page-context');
    const copy = context?.querySelector('.od-v5-context-copy');
    if (!copy) return;
    const kicker = copy.querySelector('.od-v5-context-kicker');
    const title = copy.querySelector('h2');
    const description = copy.querySelector('p');
    if (kicker) kicker.textContent = planningText('PRODUCT DEVELOPMENT / \u041f\u043b\u0430\u043d', 'PRODUCT DEVELOPMENT / Planning');
    if (title) title.textContent = planningText('\u041f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0439', 'Collection planning');
    if (description) description.textContent = planningText(
      '\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0439, \u043a\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435 \u0437\u0430\u0432\u0438\u0441\u0438\u043c\u043e\u0441\u0442\u0438, \u0441\u0440\u043e\u043a\u0438 \u0438 \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u043e\u0435 \u0438\u0441\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u0435 \u0432 \u043e\u0434\u043d\u043e\u043c \u043a\u043e\u043d\u0442\u0443\u0440\u0435.',
      'Campaign readiness, critical dependencies, deadlines and commercial execution in one governed view.',
    );
  }

  const baseRenderApp = renderApp;
  renderApp = (...args) => {
    const result = baseRenderApp(...args);
    applyPlanningV5Context();
    return result;
  };
})();
