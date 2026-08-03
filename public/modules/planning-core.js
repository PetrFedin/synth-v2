(function installPlanningCore(root) {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;
  const RISK_RANK = Object.freeze({ critical: 4, high: 3, medium: 2, low: 1 });

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function validDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function ratio(numerator, denominator) {
    return denominator > 0 ? clamp(numerator / denominator, 0, 1) : 0;
  }

  function addRisk(risks, code, severity, details) {
    risks.push(Object.freeze({ code, severity, details }));
  }

  function assessCampaign(workspace, campaign, now = new Date()) {
    const collections = list(workspace.collections).filter((item) => item.campaignId === campaign.id);
    const collectionIds = new Set(collections.map((item) => item.id));
    const skus = list(workspace.catalogSkus).filter((item) => collectionIds.has(item.collectionId));
    const showrooms = list(workspace.showrooms).filter((item) => collectionIds.has(item.collectionId));
    const cycles = list(workspace.cycles).filter((item) => item.campaignId === campaign.id || collectionIds.has(item.collectionId));
    const showroomIds = new Set(showrooms.map((item) => item.id));
    const selections = list(workspace.selections).filter((item) => showroomIds.has(item.showroomId));
    const selectionIds = new Set(selections.map((item) => item.id));
    const orders = list(workspace.orders).filter((item) => (
      item.campaignId === campaign.id
      || collectionIds.has(item.collectionId)
      || showroomIds.has(item.showroomId)
      || selectionIds.has(item.selectionId)
      || cycles.some((cycle) => cycle.id === item.cycleId)
    ));

    const startsAt = validDate(campaign.startsAt);
    const endsAt = validDate(campaign.endsAt);
    const timelineValid = Boolean(startsAt && endsAt && startsAt <= endsAt);
    const publishedCollections = collections.filter((item) => item.status === 'published');
    const publishedSkus = skus.filter((item) => item.status === 'published');
    const openShowrooms = showrooms.filter((item) => item.status === 'open');
    const activeCycles = cycles.filter((item) => !['cancelled', 'closed'].includes(item.status));
    const liveOrders = orders.filter((item) => !['cancelled'].includes(item.status));

    const gateScores = Object.freeze({
      timeline: timelineValid ? 15 : 0,
      collection: collections.length ? 10 : 0,
      publishedCollection: publishedCollections.length ? 15 : 0,
      assortment: Math.round(25 * ratio(publishedSkus.length, Math.max(skus.length, 1))),
      showroom: showrooms.length ? (openShowrooms.length ? 20 : 10) : 0,
      commercialExecution: activeCycles.length || liveOrders.length ? 15 : 0,
    });
    const readiness = Object.values(gateScores).reduce((sum, value) => sum + value, 0);
    const risks = [];

    if (!timelineValid) addRisk(risks, 'INVALID_OR_MISSING_TIMELINE', 'high', { startsAt: campaign.startsAt, endsAt: campaign.endsAt });
    if (!collections.length) addRisk(risks, 'NO_COLLECTIONS', 'critical', {});
    else if (!publishedCollections.length) addRisk(risks, 'NO_PUBLISHED_COLLECTION', 'high', { collections: collections.length });
    if (!skus.length) addRisk(risks, 'NO_ASSORTMENT', 'critical', {});
    else if (publishedSkus.length < skus.length) addRisk(risks, 'DRAFT_SKUS_REMAIN', 'medium', { draft: skus.length - publishedSkus.length, total: skus.length });
    if (!showrooms.length) addRisk(risks, 'NO_LINE_SHEET', 'high', {});
    else if (!openShowrooms.length) addRisk(risks, 'LINE_SHEET_NOT_OPEN', 'medium', { showrooms: showrooms.length });
    if (!activeCycles.length && !liveOrders.length) addRisk(risks, 'NO_COMMERCIAL_EXECUTION', 'medium', {});

    const nowDate = validDate(now) || new Date();
    const overdue = Boolean(endsAt && endsAt < nowDate && !['closed', 'cancelled'].includes(campaign.status));
    if (overdue) addRisk(risks, 'CAMPAIGN_OVERDUE', 'critical', { days: Math.ceil((nowDate - endsAt) / DAY_MS) });

    risks.sort((a, b) => (RISK_RANK[b.severity] - RISK_RANK[a.severity]) || a.code.localeCompare(b.code));
    const highestRisk = risks[0]?.severity || 'low';
    const daysToStart = startsAt ? Math.ceil((startsAt - nowDate) / DAY_MS) : null;
    const daysToEnd = endsAt ? Math.ceil((endsAt - nowDate) / DAY_MS) : null;

    return Object.freeze({
      campaign,
      collections,
      skus,
      showrooms,
      cycles,
      selections,
      orders,
      counts: Object.freeze({
        collections: collections.length,
        publishedCollections: publishedCollections.length,
        skus: skus.length,
        publishedSkus: publishedSkus.length,
        showrooms: showrooms.length,
        openShowrooms: openShowrooms.length,
        cycles: cycles.length,
        selections: selections.length,
        orders: orders.length,
      }),
      gateScores,
      readiness,
      risks: Object.freeze(risks),
      highestRisk,
      overdue,
      daysToStart,
      daysToEnd,
    });
  }

  function buildPortfolio(workspace = {}, now = new Date()) {
    const campaigns = list(workspace.campaigns).map((campaign) => assessCampaign(workspace, campaign, now));
    campaigns.sort((a, b) => {
      const riskDelta = RISK_RANK[b.highestRisk] - RISK_RANK[a.highestRisk];
      if (riskDelta) return riskDelta;
      const readinessDelta = a.readiness - b.readiness;
      if (readinessDelta) return readinessDelta;
      return String(a.campaign.name || a.campaign.id).localeCompare(String(b.campaign.name || b.campaign.id));
    });

    const total = campaigns.length;
    const active = campaigns.filter((item) => !['closed', 'cancelled'].includes(item.campaign.status)).length;
    const averageReadiness = total ? Math.round(campaigns.reduce((sum, item) => sum + item.readiness, 0) / total) : 0;
    const criticalCampaigns = campaigns.filter((item) => item.highestRisk === 'critical').length;
    const overdueCampaigns = campaigns.filter((item) => item.overdue).length;
    const upcoming30Days = campaigns.filter((item) => item.daysToStart !== null && item.daysToStart >= 0 && item.daysToStart <= 30).length;
    const riskCount = campaigns.reduce((sum, item) => sum + item.risks.length, 0);

    return Object.freeze({
      campaigns: Object.freeze(campaigns),
      summary: Object.freeze({ total, active, averageReadiness, criticalCampaigns, overdueCampaigns, upcoming30Days, riskCount }),
    });
  }

  root.SynthaPlanningCore = Object.freeze({ assessCampaign, buildPortfolio });
})(typeof window === 'undefined' ? globalThis : window);
