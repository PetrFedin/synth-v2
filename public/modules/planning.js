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
    const bar = el('progress', { className: 'industrial-readiness-bar' });
    bar.max = 100;
    bar.value = Math.max(0, Math.min(100, Number(item.readiness) || 0));
    bar.setAttribute('aria-label', text('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'));
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
      tabs: [
        {
          label: text('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'),
          fields: [
            { label: text('\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness'), value: `${item.readiness}%` },
            { label: text('\u041f\u0435\u0440\u0438\u043e\u0434', 'Period'), value: `${formatDate(item.campaign.startsAt)} \u2014 ${formatDate(item.campaign.endsAt)}` },
            { label: text('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collections'), value: `${item.counts.publishedCollections}/${item.counts.collections}` },
            { label: text('SKU \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043e', 'SKU published'), value: `${item.counts.publishedSkus}/${item.counts.skus}` },
          ],
        },
        {
          label: text('\u0420\u0438\u0441\u043a\u0438', 'Risks'),
          content: [risks],
        },
        {
          label: text('\u0421\u0432\u044f\u0437\u0438', 'Dependencies'),
          fields: [
            { label: text('\u041b\u0438\u043d\u0448\u0438\u0442\u044b', 'Linesheets'), value: `${item.counts.openShowrooms}/${item.counts.showrooms}` },
            { label: text('\u041e\u0442\u0431\u043e\u0440\u044b', 'Selections'), value: item.counts.selections },
            { label: text('\u0417\u0430\u043a\u0430\u0437\u044b', 'Orders'), value: item.counts.orders },
          ],
        },
      ],
      actions: [odCampaignAction(item.campaign)],
    });
  }
  // The line plan. A placeholder states what the season intends to contain and earn; the styles linked
  // to it state what it became. Both sides are read from one projection, so the plan can be compared
  // with the fact instead of being admired on its own.
  function placeholderName(item) {
    return I18N.getLocale?.() === 'en' ? (item.nameEn || item.nameRu) : (item.nameRu || item.nameEn);
  }
  function dimensionName(item, key) {
    const value = I18N.getLocale?.() === 'en' ? item[`${key}NameEn`] : item[`${key}NameRu`];
    return value || item[`${key}Code`] || '\u2014';
  }
  function minorMoney(value, currency) {
    if (value === null || value === undefined) return '\u2014';
    return `${money(value / 100)} ${currency || ''}`.trim();
  }
  function percentFromBasisPoints(value) {
    // toFixed always writes a dot, so a Russian screen showed «71.4%» beside «189,00 €».
    return value === null || value === undefined
      ? '\u2014'
      : `${I18N.formatNumber(value / 100, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }
  // The variance is the reason the plan is worth keeping: a slot that is being developed more
  // expensively than it was planned for is visible while there is still time to act on it.
  function marginVariance(item) {
    if (item.plannedMarginBasisPoints === null || item.plannedMarginBasisPoints === undefined) return null;
    if (item.actualMarginBasisPoints === null || item.actualMarginBasisPoints === undefined) return null;
    return item.actualMarginBasisPoints - item.plannedMarginBasisPoints;
  }
  function varianceCell(item) {
    const variance = marginVariance(item);
    if (variance === null) return el('span', { className: 'muted', rawText: text('\u041d\u0435\u0442 \u0444\u0430\u043a\u0442\u0430', 'No fact yet') });
    // A plan the fact beats by thirty points was not a triumph, it was a wrong plan: a variance that
    // large in either direction says the two sides are not comparable and needs looking at.
    const tone = variance < -200 || variance > 1000 ? 'danger' : variance < 0 || variance > 300 ? 'warning' : 'success';
    const sign = variance > 0 ? '+' : '';
    return el('span', { className: `badge ${tone}`, rawText: `${sign}${(variance / 100).toFixed(1)} \u043f.\u043f.` });
  }
  function placeholderInspector(item) {
    return odInspector({
      title: placeholderName(item),
      subtitle: item.placeholderCode,
      status: item.status,
      tabs: [
        {
          label: text('\u041f\u043b\u0430\u043d', 'Plan'),
          fields: [
            { label: text('\u0420\u043e\u0437\u043d\u0438\u0447\u043d\u0430\u044f \u0446\u0435\u043d\u0430', 'Retail price'), value: minorMoney(item.recommendedRetailPriceMinor, item.currency) },
            { label: text('\u041f\u043b\u0430\u043d\u043e\u0432\u0430\u044f \u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c', 'Planned unit cost'), value: minorMoney(item.plannedUnitCostMinor, item.currency) },
            { label: text('\u041f\u043b\u0430\u043d\u043e\u0432\u0430\u044f \u043c\u0430\u0440\u0436\u0430', 'Planned margin'), value: percentFromBasisPoints(item.plannedMarginBasisPoints) },
            { label: text('\u041f\u043b\u0430\u043d, \u0448\u0442', 'Planned units'), value: item.plannedQuantity ?? '\u2014' },
            { label: text('\u0426\u0432\u0435\u0442\u043e\u043c\u043e\u0434\u0435\u043b\u0435\u0439', 'Colourways'), value: item.colourwayCount ?? '\u2014' },
            { label: text('\u0414\u0430\u0442\u0430 \u0432\u0432\u043e\u0434\u0430', 'Launch'), value: item.launchAt ? formatDate(item.launchAt) : '\u2014' },
          ],
        },
        {
          label: text('\u0424\u0430\u043a\u0442', 'Fact'),
          fields: [
            { label: text('\u041c\u043e\u0434\u0435\u043b\u0435\u0439 \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u0430\u043d\u043e', 'Styles developed'), value: item.linkedStyleCount ?? 0 },
            { label: text('\u0418\u0437 \u043d\u0438\u0445 \u0441 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u043e\u0439 BOM', 'With a published BOM'), value: item.costedStyleCount ?? 0 },
            { label: text('\u0424\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c', 'Actual unit cost'), value: minorMoney(item.actualUnitCostMinor, item.currency) },
            { label: text('\u0424\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u043c\u0430\u0440\u0436\u0430', 'Actual margin'), value: percentFromBasisPoints(item.actualMarginBasisPoints) },
          ],
          content: [
            item.costedStyleCount
              ? notice(text('\u0424\u0430\u043a\u0442 \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044f \u043f\u043e \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u044b\u043c \u0441\u043f\u0435\u0446\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u044f\u043c \u0441\u0432\u044f\u0437\u0430\u043d\u043d\u044b\u0445 \u043c\u043e\u0434\u0435\u043b\u0435\u0439 \u0438 \u0442\u043e\u043b\u044c\u043a\u043e \u0432 \u0442\u043e\u0439 \u0436\u0435 \u0432\u0430\u043b\u044e\u0442\u0435.', 'The fact is taken from the published BOMs of the linked styles, and only in the same currency.'), 'success')
              : notice(text('\u0421\u0432\u044f\u0436\u0438\u0442\u0435 \u043c\u043e\u0434\u0435\u043b\u044c \u0441 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u043e\u0439 \u0441\u043f\u0435\u0446\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u0435\u0439, \u0447\u0442\u043e\u0431\u044b \u0443\u0432\u0438\u0434\u0435\u0442\u044c \u0444\u0430\u043a\u0442.', 'Link a style with a published BOM to see the fact.')),
          ],
        },
        {
          label: text('\u0417\u0430\u043a\u0443\u043f\u043a\u0430', 'Purchase'),
          fields: [
            { label: text('\u041f\u043b\u0430\u043d\u043e\u0432\u0430\u044f \u043d\u0430\u0446\u0435\u043d\u043a\u0430', 'Planned markup'), value: markup(seasonSlot(item)?.plannedMarkup ?? null) },
            { label: text('\u0426\u0435\u043b\u0435\u0432\u0430\u044f \u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c \u043d\u0430 \u0441\u043a\u043b\u0430\u0434\u0435', 'Target landed cost'), value: minorMoney(seasonSlot(item)?.targetLandedMinor ?? null, item.currency) },
            { label: text('\u0424\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u0430\u044f, \u043f\u0440\u0438\u0432\u0435\u0434\u0451\u043d\u043d\u0430\u044f \u043a \u0440\u043e\u0437\u043d\u0438\u0446\u0435', 'Actual, brought to retail currency'), value: minorMoney(seasonSlot(item)?.actualLandedMinor ?? null, item.currency) },
            { label: text('\u0426\u0435\u043b\u044c \u2192 \u0444\u0430\u043a\u0442', 'Target to actual'), value: minorMoney(seasonSlot(item)?.targetToActualMinor ?? null, item.currency) },
            { label: text('\u041c\u0430\u0440\u0436\u0430 \u043f\u043e \u0444\u0430\u043a\u0442\u0443 \u0437\u0430\u043a\u0443\u043f\u043a\u0438', 'Margin at the agreed price'), value: percentFromBasisPoints(seasonSlot(item)?.actualMarginBasisPoints ?? null) },
            { label: text('\u0417\u0430\u043a\u0430\u0437\u0430\u043d\u043e, \u0448\u0442', 'Ordered units'), value: seasonSlot(item)?.orderedQuantity ?? '\u2014' },
          ],
          content: [
            seasonSlot(item)?.actualLandedMinor !== null && seasonSlot(item)?.actualLandedMinor !== undefined
              ? notice(text(
                '\u0424\u0430\u043a\u0442 \u2014 \u0446\u0435\u043d\u0430 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d\u043d\u043e\u0433\u043e \u0437\u0430\u043a\u0430\u0437\u0430, \u043f\u043e\u0434\u043d\u044f\u0442\u0430\u044f \u0434\u043e \u0441\u043a\u043b\u0430\u0434\u0430 \u043a\u0443\u0440\u0441\u043e\u043c \u0438 \u043b\u043e\u0433\u0438\u0441\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u043c\u0438 \u043a\u043e\u044d\u0444\u0444\u0438\u0446\u0438\u0435\u043d\u0442\u0430\u043c\u0438 \u0446\u0435\u043b\u0435\u0432\u043e\u0439 \u0446\u0435\u043d\u044b. \u042d\u0442\u043e \u043d\u0435 \u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c \u043f\u043e \u0432\u0435\u0434\u043e\u043c\u043e\u0441\u0442\u0438: \u044d\u0442\u043e \u0442\u043e, \u043e \u0447\u0451\u043c \u0434\u043e\u0433\u043e\u0432\u043e\u0440\u0438\u043b\u0438\u0441\u044c \u0441 \u0444\u0430\u0431\u0440\u0438\u043a\u043e\u0439.',
                'The fact is the confirmed order price, raised to landed cost by the target price\u2019s rate and logistics coefficients. It is not the bill of materials: it is what was agreed with the factory.'), 'success')
              : notice(text(
                '\u0427\u0442\u043e\u0431\u044b \u0443\u0432\u0438\u0434\u0435\u0442\u044c \u0444\u0430\u043a\u0442 \u0437\u0430\u043a\u0443\u043f\u043a\u0438, \u0441\u043b\u043e\u0442\u0443 \u043d\u0443\u0436\u043d\u044b \u0441\u0432\u044f\u0437\u0430\u043d\u043d\u0430\u044f \u043c\u043e\u0434\u0435\u043b\u044c, \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u0430\u044f \u0446\u0435\u043b\u0435\u0432\u0430\u044f \u0446\u0435\u043d\u0430 \u0438 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d\u043d\u044b\u0439 \u0437\u0430\u043a\u0430\u0437.',
                'To see the purchase fact a slot needs a linked style, a published target price and a confirmed order.')),
          ],
        },
        {
          label: text('\u0410\u0442\u0440\u0438\u0431\u0443\u0442\u044b', 'Attributes'),
          fields: [
            { label: text('\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f', 'Category'), value: dimensionName(item, 'category') },
            { label: text('\u041f\u043e\u043b', 'Gender'), value: dimensionName(item, 'gender') },
            { label: text('\u0412\u043e\u0437\u0440\u0430\u0441\u0442', 'Age group'), value: dimensionName(item, 'ageGroup') },
            { label: text('\u041f\u043e\u0441\u0430\u0434\u043a\u0430', 'Fit'), value: dimensionName(item, 'fit') },
            { label: text('\u041d\u043e\u0432\u0438\u0437\u043d\u0430', 'Novelty'), value: dimensionName(item, 'novelty') },
            { label: text('\u0421\u0435\u0437\u043e\u043d\u043d\u043e\u0441\u0442\u044c', 'Seasonality'), value: dimensionName(item, 'seasonality') },
            { label: text('\u041a\u0430\u043f\u0441\u0443\u043b\u0430', 'Capsule'), value: item.capsule || '\u2014' },
            { label: text('\u0414\u0440\u043e\u043f', 'Drop'), value: item.drop || '\u2014' },
          ],
        },
      ],
    });
  }
  // A tab called Таймлайн that re-sorted the same table by a date both campaigns share rendered the
  // portfolio again, byte for byte. A timeline shows when things happen against each other.
  function renderTimeline(portfolio) {
    const rows = [...portfolio.campaigns]
      .filter((item) => item.campaign.startsAt && item.campaign.endsAt)
      .sort((left, right) => String(left.campaign.startsAt).localeCompare(String(right.campaign.startsAt)));
    if (!rows.length) {
      return notice(text('Ни у одной кампании не заданы даты начала и конца, поэтому таймлайн пуст.', 'No campaign has a start and an end date, so the timeline is empty.'));
    }
    const starts = rows.map((item) => Date.parse(item.campaign.startsAt));
    const ends = rows.map((item) => Date.parse(item.campaign.endsAt));
    const first = Math.min(...starts);
    const last = Math.max(...ends);
    const span = Math.max(last - first, 1);
    const board = el('section', { className: 'od-timeline-board' });
    rows.forEach((item) => {
      const row = el('article', { className: 'od-timeline-line' });
      const label = el('div', { className: 'od-timeline-label' });
      label.append(
        el('strong', { rawText: item.campaign.name || item.campaign.id }),
        el('small', { rawText: `${formatDate(item.campaign.startsAt)} — ${formatDate(item.campaign.endsAt)}` }),
      );
      const track = el('div', { className: 'od-timeline-track' });
      const start = Date.parse(item.campaign.startsAt);
      const end = Date.parse(item.campaign.endsAt);
      // The bar is positioned with an SVG so the runtime writes no inline styles.
      const bar = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      bar.setAttribute('class', 'od-timeline-bar');
      bar.setAttribute('viewBox', '0 0 1000 18');
      bar.setAttribute('preserveAspectRatio', 'none');
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', `${formatDate(item.campaign.startsAt)} — ${formatDate(item.campaign.endsAt)}`);
      const base = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      base.setAttribute('x', '0'); base.setAttribute('y', '7');
      base.setAttribute('width', '1000'); base.setAttribute('height', '4');
      base.setAttribute('fill', '#EEF0F3');
      const span1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const x = Math.round(((start - first) / span) * 1000);
      const width = Math.max(Math.round(((end - start) / span) * 1000), 6);
      span1.setAttribute('x', String(x)); span1.setAttribute('y', '2');
      span1.setAttribute('width', String(Math.min(width, 1000 - x))); span1.setAttribute('height', '14');
      span1.setAttribute('rx', '3');
      span1.setAttribute('fill', item.risks.length ? '#F79009' : '#12B76A');
      bar.append(base, span1);
      track.append(bar);
      row.append(label, track, el('span', { className: 'od-timeline-readiness', rawText: `${item.readiness}%` }));
      board.append(row);
    });
    const scale = el('div', { className: 'od-timeline-scale' });
    scale.append(
      el('small', { rawText: formatDate(new Date(first).toISOString()) }),
      el('small', { rawText: formatDate(new Date(last).toISOString()) }),
    );
    board.append(scale);
    return board;
  }


  // \u041f\u043b\u0430\u043d\u043e\u0432\u0430\u044f \u044d\u043a\u043e\u043d\u043e\u043c\u0438\u043a\u0430 \u0441\u0435\u0437\u043e\u043d\u0430.
  //
  // \u0422\u0440\u0438 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430 \u043e\u0442\u0432\u0435\u0447\u0430\u044e\u0442 \u043d\u0430 \u0432\u043e\u043f\u0440\u043e\u0441 \u00ab\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0441\u0442\u043e\u0438\u0442 \u0432\u0435\u0449\u044c\u00bb \u0441 \u0440\u0430\u0437\u043d\u044b\u0445 \u0441\u0442\u043e\u0440\u043e\u043d: \u0441\u043b\u043e\u0442 \u043b\u0438\u043d\u0435\u0439\u043d\u043e\u0433\u043e \u043f\u043b\u0430\u043d\u0430 \u2014
  // \u0447\u0442\u043e \u0437\u0430\u043b\u043e\u0436\u0438\u043b \u043f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0449\u0438\u043a, \u0446\u0435\u043b\u0435\u0432\u0430\u044f \u0446\u0435\u043d\u0430 \u2014 \u0441\u043a\u043e\u043b\u044c\u043a\u043e \u043d\u0430\u043c \u043c\u043e\u0436\u043d\u043e \u0437\u0430\u043f\u043b\u0430\u0442\u0438\u0442\u044c, \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d\u043d\u044b\u0439 \u0437\u0430\u043a\u0430\u0437 \u2014
  // \u0441\u043a\u043e\u043b\u044c\u043a\u043e \u043c\u044b \u0437\u0430\u043f\u043b\u0430\u0442\u0438\u043b\u0438. \u0421\u0432\u043e\u0434 \u0441\u0442\u0430\u0432\u0438\u0442 \u0438\u0445 \u0440\u044f\u0434\u043e\u043c \u0438 \u043f\u0440\u0438\u0432\u043e\u0434\u0438\u0442 \u043a\u043e\u0442\u0438\u0440\u043e\u0432\u043a\u0443 \u0444\u0430\u0431\u0440\u0438\u043a\u0438 \u043a \u0440\u043e\u0437\u043d\u0438\u0446\u0435 \u0442\u0435\u043c \u0436\u0435
  // \u043a\u0443\u0440\u0441\u043e\u043c \u0438 \u0442\u0435\u043c\u0438 \u0436\u0435 \u043a\u043e\u044d\u0444\u0444\u0438\u0446\u0438\u0435\u043d\u0442\u0430\u043c\u0438, \u043a\u043e\u0442\u043e\u0440\u044b\u043c\u0438 \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044f \u0446\u0435\u043b\u044c; \u043f\u043e\u0441\u0447\u0438\u0442\u0430\u0442\u044c \u0444\u0430\u043a\u0442 \u0434\u0440\u0443\u0433\u043e\u0439 \u043b\u0438\u043d\u0435\u0439\u043a\u043e\u0439
  // \u0437\u043d\u0430\u0447\u0438\u043b\u043e \u0431\u044b \u043f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0440\u0430\u0441\u0445\u043e\u0436\u0434\u0435\u043d\u0438\u0435, \u043a\u043e\u0442\u043e\u0440\u043e\u0433\u043e \u0432 \u0434\u0435\u043d\u044c\u0433\u0430\u0445 \u043d\u0435\u0442.
  //
  // \u041d\u0438\u0447\u0435\u0433\u043e \u0438\u0437 \u043f\u043e\u043a\u0430\u0437\u0430\u043d\u043d\u043e\u0433\u043e \u043d\u0435 \u0445\u0440\u0430\u043d\u0438\u0442\u0441\u044f: \u0432\u0441\u0435 \u0447\u0438\u0441\u043b\u0430 \u0432\u044b\u0432\u043e\u0434\u044f\u0442\u0441\u044f \u043f\u0440\u0438 \u0447\u0442\u0435\u043d\u0438\u0438.
  const seasonState = window.SynthaSeasonEconomicsState
    || (window.SynthaSeasonEconomicsState = { data: {}, loading: {}, failed: {} });

  function loadSeason(campaignId) {
    if (seasonState.data[campaignId] || seasonState.loading[campaignId] || seasonState.failed[campaignId]) return;
    seasonState.loading[campaignId] = true;
    api(`/v2/campaigns/${encodeURIComponent(campaignId)}/season-economics`)
      .then((value) => { seasonState.data[campaignId] = value; })
      .catch(() => { seasonState.failed[campaignId] = true; })
      .finally(() => {
        seasonState.loading[campaignId] = false;
        if (state.view === 'planning') renderApp();
      });
  }

  function seasonSlot(item) {
    const view = seasonState.data[item.campaignId];
    if (!view || !Array.isArray(view.placeholders)) return null;
    return view.placeholders.find((slot) => slot.placeholderId === item.id) || null;
  }

  // Наценка печатается через тот же форматтер, что и деньги: голый JSON-номер пишет точку, и
  // «2.7» встало бы рядом с «9 576,92» на одном экране.
  function markup(value) {
    return value === null || value === undefined
      ? '\u2014'
      : I18N.formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 4 });
  }

  function signedPoints(value) {
    if (value === null || value === undefined) return '\u2014';
    const sign = value > 0 ? '+' : '';
    return `${sign}${I18N.formatNumber(value / 100, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} \u043f.\u043f.`;
  }

  function seasonCard(campaignId, campaignName) {
    loadSeason(campaignId);
    const view = seasonState.data[campaignId];
    const card = el('section', { className: 'od-season-economics' });
    card.append(el('h3', { rawText: `${text('\u041f\u043b\u0430\u043d\u043e\u0432\u0430\u044f \u044d\u043a\u043e\u043d\u043e\u043c\u0438\u043a\u0430 \u0441\u0435\u0437\u043e\u043d\u0430', 'Season economics')} \u2014 ${campaignName}` }));
    if (seasonState.failed[campaignId]) {
      card.append(el('p', { className: 'muted', rawText: text(
        '\u0421\u0432\u043e\u0434 \u043f\u043e \u0441\u0435\u0437\u043e\u043d\u0443 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d: \u043d\u0435\u0442 \u043f\u0440\u0430\u0432\u0430 \u0447\u0438\u0442\u0430\u0442\u044c \u043c\u0430\u0440\u0436\u0443.',
        'The season roll-up is unavailable: reading margin is not permitted.') }));
      return card;
    }
    if (!view) {
      card.append(el('p', { className: 'muted', rawText: text('\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026', 'Loading\u2026') }));
      return card;
    }
    const season = view.season;
    if (season.plannedRevenueMinor === null) {
      card.append(el('p', { className: 'muted', rawText: text(
        '\u041d\u0438 \u0432 \u043e\u0434\u043d\u043e\u043c \u0441\u043b\u043e\u0442\u0435 \u043d\u0435 \u0437\u0430\u0434\u0430\u043d\u044b \u0440\u043e\u0437\u043d\u0438\u0447\u043d\u0430\u044f \u0446\u0435\u043d\u0430 \u0438 \u043f\u043b\u0430\u043d\u043e\u0432\u043e\u0435 \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u0441\u0435\u0437\u043e\u043d \u043f\u043e\u0441\u0447\u0438\u0442\u0430\u0442\u044c \u043d\u0435 \u0438\u0437 \u0447\u0435\u0433\u043e.',
        'No slot states both a retail price and a planned quantity, so there is nothing to total.') }));
      return card;
    }
    const currency = season.currency;
    card.append(el('p', { rawText: text(
      `\u041f\u043b\u0430\u043d\u0438\u0440\u0443\u0435\u043c\u0430\u044f \u0432\u044b\u0440\u0443\u0447\u043a\u0430 ${minorMoney(season.plannedRevenueMinor, currency)} \u043f\u0440\u0438 \u043f\u043b\u0430\u043d\u043e\u0432\u043e\u0439 \u043c\u0430\u0440\u0436\u0435 ${percentFromBasisPoints(season.plannedMarginBasisPoints)} \u2014 \u044d\u0442\u043e ${minorMoney(season.plannedGrossMarginMinor, currency)} \u0432\u0430\u043b\u043e\u0432\u043e\u0439 \u043f\u0440\u0438\u0431\u044b\u043b\u0438 \u043f\u043e ${season.quantifiedSlotCount} \u0441\u043b\u043e\u0442\u0430\u043c.`,
      `Planned revenue ${minorMoney(season.plannedRevenueMinor, currency)} at a planned margin of ${percentFromBasisPoints(season.plannedMarginBasisPoints)} \u2014 ${minorMoney(season.plannedGrossMarginMinor, currency)} of gross profit across ${season.quantifiedSlotCount} slots.`) }));

    if (season.confirmedSlotCount === 0) {
      card.append(el('p', { className: 'muted', rawText: text(
        '\u041d\u0438 \u043e\u0434\u0438\u043d \u0441\u043b\u043e\u0442 \u043f\u043e\u043a\u0430 \u043d\u0435 \u0437\u0430\u043a\u0443\u043f\u043b\u0435\u043d, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u0444\u0430\u043a\u0442\u0430 \u043f\u043e \u0441\u0435\u0437\u043e\u043d\u0443 \u043d\u0435\u0442. \u041e\u043d \u043f\u043e\u044f\u0432\u0438\u0442\u0441\u044f, \u043a\u043e\u0433\u0434\u0430 \u043f\u043e\u0434 \u0441\u043b\u043e\u0442 \u0431\u0443\u0434\u0435\u0442 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d \u0437\u0430\u043a\u0430\u0437 \u0438 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0430 \u0446\u0435\u043b\u0435\u0432\u0430\u044f \u0446\u0435\u043d\u0430.',
        'No slot has been bought yet, so the season has no fact. It appears once a slot has a confirmed order and a target price.') }));
      return card;
    }

    // \u0414\u043e\u043b\u044f \u0432\u0430\u0436\u043d\u0435\u0435 \u0441\u0430\u043c\u043e\u0433\u043e \u0447\u0438\u0441\u043b\u0430: \u043c\u0430\u0440\u0436\u0430, \u043f\u043e\u0441\u0447\u0438\u0442\u0430\u043d\u043d\u0430\u044f \u043f\u043e \u043f\u043e\u043b\u043e\u0432\u0438\u043d\u0435 \u0441\u0435\u0437\u043e\u043d\u0430, \u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044f \u043a\u0430\u043a \u043c\u0430\u0440\u0436\u0430 \u0441\u0435\u0437\u043e\u043d\u0430
    // \u0438 \u043e\u0431\u043c\u0430\u043d\u044b\u0432\u0430\u0435\u0442 \u0440\u043e\u0432\u043d\u043e \u043d\u0430\u0441\u0442\u043e\u043b\u044c\u043a\u043e, \u043d\u0430\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0447\u0438\u0442\u0430\u0442\u0435\u043b\u044c \u0435\u0439 \u0432\u0435\u0440\u0438\u0442.
    card.append(el('p', { rawText: text(
      `\u0417\u0430\u043a\u0443\u043f\u043b\u0435\u043d\u043e ${season.confirmedSlotCount} \u0438\u0437 ${season.quantifiedSlotCount} \u0441\u043b\u043e\u0442\u043e\u0432 \u2014 ${percentFromBasisPoints(season.confirmedRevenueShareBasisPoints)} \u043f\u043b\u0430\u043d\u0438\u0440\u0443\u0435\u043c\u043e\u0439 \u0432\u044b\u0440\u0443\u0447\u043a\u0438.`,
      `Bought: ${season.confirmedSlotCount} of ${season.quantifiedSlotCount} slots \u2014 ${percentFromBasisPoints(season.confirmedRevenueShareBasisPoints)} of planned revenue.`) }));
    card.append(el('p', { rawText: text(
      `\u041f\u043e \u044d\u0442\u0438\u043c \u0441\u043b\u043e\u0442\u0430\u043c \u043c\u0430\u0440\u0436\u0430 ${percentFromBasisPoints(season.actualMarginBasisPoints)} \u043f\u0440\u043e\u0442\u0438\u0432 \u043f\u043b\u0430\u043d\u043e\u0432\u044b\u0445 ${percentFromBasisPoints(season.plannedMarginOfConfirmedBasisPoints)}.`,
      `Across those slots the margin is ${percentFromBasisPoints(season.actualMarginBasisPoints)} against a planned ${percentFromBasisPoints(season.plannedMarginOfConfirmedBasisPoints)}.`) }));
    const variance = season.marginVarianceBasisPoints;
    const tone = variance === null ? 'muted' : variance < 0 ? 'danger' : 'success';
    const badge = el('span', { className: `badge ${tone}`, rawText: signedPoints(variance) });
    const line = el('p', {});
    line.append(el('strong', { rawText: `${text('\u041e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u0438\u0435 \u043c\u0430\u0440\u0436\u0438', 'Margin variance')}: ` }), badge);
    card.append(line);
    card.append(el('p', { className: 'muted', rawText: text(
      '\u041f\u043b\u0430\u043d \u0438 \u0444\u0430\u043a\u0442 \u0441\u0440\u0430\u0432\u043d\u0438\u0432\u0430\u044e\u0442\u0441\u044f \u043f\u043e \u043e\u0434\u043d\u0438\u043c \u0438 \u0442\u0435\u043c \u0436\u0435 \u0441\u043b\u043e\u0442\u0430\u043c: \u0441\u0440\u0430\u0432\u043d\u0435\u043d\u0438\u0435 \u0447\u0430\u0441\u0442\u0438\u0447\u043d\u043e\u0433\u043e \u0444\u0430\u043a\u0442\u0430 \u0441 \u0432\u044b\u0440\u0443\u0447\u043a\u043e\u0439 \u0432\u0441\u0435\u0433\u043e \u0441\u0435\u0437\u043e\u043d\u0430 \u0437\u0430\u043d\u0438\u0437\u0438\u043b\u043e \u0431\u044b \u0437\u0430\u0442\u0440\u0430\u0442\u044b.',
      'Plan and fact are compared across the same slots: measuring a partial fact against the whole season would understate cost.') }));
    return card;
  }

  function renderLinePlan() {
    const rows = Array.isArray(state.workspace.placeholders) ? state.workspace.placeholders : [];
    // The workspace stops at a page, and placeholders are not one of the sections that can be paged
    // further yet. A register that quietly shows the first two hundred of a thousand-slot season is
    // worse than one that shows nothing: the count looks like the plan. Until placeholders can be
    // paged, the screen says what it is holding back.
    const truncated = state.workspace.pageInfo?.truncatedSections?.includes('placeholders');
    if (!rows.length) {
      return notice(text(
        '\u0412 \u044d\u0442\u043e\u043c \u043f\u043e\u0440\u0442\u0444\u0435\u043b\u0435 \u0435\u0449\u0451 \u043d\u0435\u0442 \u043f\u043b\u0435\u0439\u0441\u0445\u043e\u043b\u0434\u0435\u0440\u043e\u0432. \u041f\u043b\u0435\u0439\u0441\u0445\u043e\u043b\u0434\u0435\u0440 \u2014 \u044d\u0442\u043e \u0437\u0430\u043f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u043e\u0435 \u043c\u0435\u0441\u0442\u043e \u0432 \u0430\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442\u0435: \u0435\u0433\u043e \u0437\u0430\u0432\u043e\u0434\u044f\u0442 \u0434\u043e \u0442\u043e\u0433\u043e, \u043a\u0430\u043a \u043f\u043e\u044f\u0432\u0438\u0442\u0441\u044f \u043c\u043e\u0434\u0435\u043b\u044c.',
        'This portfolio has no placeholders yet. A placeholder is a planned slot in the assortment: it is created before any style exists.',
      ));
    }
    const registry = odRegistry({
      scope: 'od-line-plan', filterScope: 'linePlan', rows, rowKey: (item) => item.id,
      statusAccessor: (item) => item.status,
      columns: [
        { key: 'code', label: text('\u041a\u043e\u0434', 'Code'), value: (item) => item.placeholderCode },
        { key: 'name', label: text('\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435', 'Name'), value: (item) => placeholderName(item) },
        { key: 'category', label: text('\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f', 'Category'), value: (item) => dimensionName(item, 'category') },
        { key: 'gender', label: text('\u041f\u043e\u043b', 'Gender'), value: (item) => dimensionName(item, 'gender') },
        { key: 'ageGroup', label: text('\u0412\u043e\u0437\u0440\u0430\u0441\u0442', 'Age group'), value: (item) => dimensionName(item, 'ageGroup') },
        { key: 'fit', label: text('\u041f\u043e\u0441\u0430\u0434\u043a\u0430', 'Fit'), value: (item) => dimensionName(item, 'fit') },
        { key: 'novelty', label: text('\u041d\u043e\u0432\u0438\u0437\u043d\u0430', 'Novelty'), value: (item) => dimensionName(item, 'novelty') },
        { key: 'seasonality', label: text('\u0421\u0435\u0437\u043e\u043d\u043d\u043e\u0441\u0442\u044c', 'Seasonality'), value: (item) => dimensionName(item, 'seasonality') },
        { key: 'colourways', label: text('\u0426\u0432\u0435\u0442\u043e\u043c\u043e\u0434\u0435\u043b\u0435\u0439', 'Colourways'), value: (item) => item.colourwayCount ?? '\u2014' },
        { key: 'plannedQuantity', label: text('\u041f\u043b\u0430\u043d, \u0448\u0442', 'Planned units'), value: (item) => item.plannedQuantity ?? '\u2014' },
        { key: 'retailPrice', label: text('\u0420\u043e\u0437\u043d\u0438\u0447\u043d\u0430\u044f \u0446\u0435\u043d\u0430', 'Retail price'), value: (item) => minorMoney(item.recommendedRetailPriceMinor, item.currency) },
        { key: 'plannedCost', label: text('\u041f\u043b\u0430\u043d \u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u0438', 'Planned cost'), value: (item) => minorMoney(item.plannedUnitCostMinor, item.currency) },
        { key: 'plannedMargin', label: text('\u041f\u043b\u0430\u043d \u043c\u0430\u0440\u0436\u0438', 'Planned margin'), value: (item) => percentFromBasisPoints(item.plannedMarginBasisPoints) },
        { key: 'styles', label: text('\u041c\u043e\u0434\u0435\u043b\u0435\u0439', 'Styles'), value: (item) => `${item.costedStyleCount ?? 0}/${item.linkedStyleCount ?? 0}` },
        { key: 'actualCost', label: text('\u0424\u0430\u043a\u0442 \u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u0438', 'Actual cost'), value: (item) => minorMoney(item.actualUnitCostMinor, item.currency) },
        { key: 'actualMargin', label: text('\u0424\u0430\u043a\u0442 \u043c\u0430\u0440\u0436\u0438', 'Actual margin'), value: (item) => percentFromBasisPoints(item.actualMarginBasisPoints) },
        { key: 'variance', label: text('\u041e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u0438\u0435', 'Variance'), render: varianceCell },
        { key: 'status', label: text('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: (item) => statusBadge(item.status) },
      ],
      inspector: placeholderInspector,
    });
    // \u0421\u0432\u043e\u0434 \u0438\u0434\u0451\u0442 \u043f\u0435\u0440\u0435\u0434 \u0440\u0435\u0435\u0441\u0442\u0440\u043e\u043c: \u0441\u0435\u0437\u043e\u043d \u0447\u0438\u0442\u0430\u044e\u0442 \u0441\u0432\u0435\u0440\u0445\u0443 \u0432\u043d\u0438\u0437 \u2014 \u0441\u043d\u0430\u0447\u0430\u043b\u0430 \u00ab\u0441\u0445\u043e\u0434\u0438\u0442\u0441\u044f \u043b\u0438 \u043e\u043d\u00bb, \u043f\u043e\u0442\u043e\u043c
    // \u00ab\u043a\u0430\u043a\u043e\u0439 \u0441\u043b\u043e\u0442 \u0435\u0433\u043e \u0442\u044f\u043d\u0435\u0442\u00bb. \u041a\u0430\u0440\u0442\u043e\u0447\u043a\u0430 \u043d\u0430 \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e, \u043f\u043e\u0442\u043e\u043c\u0443 \u0447\u0442\u043e \u043c\u0430\u0440\u0436\u0430 \u0440\u0430\u0437\u043d\u044b\u0445 \u0441\u0435\u0437\u043e\u043d\u043e\u0432 \u043d\u0435 \u0441\u0443\u043c\u043c\u0438\u0440\u0443\u0435\u0442\u0441\u044f.
    const campaigns = [];
    for (const item of rows) {
      if (!item.campaignId || campaigns.some((entry) => entry.id === item.campaignId)) continue;
      const campaign = (state.workspace.campaigns || []).find((entry) => entry.id === item.campaignId);
      campaigns.push({ id: item.campaignId, name: campaign?.name || campaign?.season || item.campaignId });
    }
    const summary = document.createDocumentFragment();
    for (const campaign of campaigns) summary.append(seasonCard(campaign.id, campaign.name));

    if (!truncated) {
      const page = document.createDocumentFragment();
      page.append(summary, registry);
      return page;
    }
    const panel = document.createDocumentFragment();
    panel.append(notice(text(
      `Показаны первые ${rows.length} слотов — в кампании их больше. Сузьте фильтр или откройте конкретную кампанию.`,
      `Showing the first ${rows.length} slots — the campaign holds more. Narrow the filter or open one campaign.`,
    )), summary, registry);
    return panel;
  }

  // The command bar's action belongs to the tab a person is looking at. On the line plan, the thing
  // they came to do is load the season they already planned elsewhere, not create another campaign.
  function planningAction(caps) {
    const manage = caps.hasAny(state.workspace, caps.CAPABILITIES.CAMPAIGN_MANAGE, 'brand');
    if (!manage) return null;
    const onLinePlan = (OD_UI.tabs.planning || 'portfolio') === 'line-plan';
    const importer = window.SynthaPlaceholderImport;
    if (onLinePlan && importer?.open) {
      return odAction(text('\u0418\u043c\u043f\u043e\u0440\u0442 \u043f\u043b\u0435\u0439\u0441\u0445\u043e\u043b\u0434\u0435\u0440\u043e\u0432', 'Import placeholders'), () => importer.open());
    }
    return odAction(text('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e', 'Create campaign'), campaignForm);
  }

  function renderPlanning() {
    const portfolio = core.buildPortfolio(state.workspace, new Date());
    const caps = window.SynthaUiCapabilities;
    const header = odHeader('planning', [
      { id: 'portfolio', label: text('\u041f\u043e\u0440\u0442\u0444\u0435\u043b\u044c', 'Portfolio') },
      { id: 'timeline', label: text('\u0422\u0430\u0439\u043c\u043b\u0430\u0439\u043d', 'Timeline') },
      { id: 'exceptions', label: text('\u0418\u0441\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f', 'Exceptions') },
      { id: 'line-plan', label: text('\u041b\u0438\u043d\u0435\u0439\u043d\u044b\u0439 \u043f\u043b\u0430\u043d', 'Line plan') },
    ], [
      { label: text('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438', 'Campaigns'), value: portfolio.summary.total, detail: `${portfolio.summary.active} ${text('\u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445', 'active')}` },
      { label: text('\u0421\u0440\u0435\u0434\u043d\u044f\u044f \u0433\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Average readiness'), value: `${portfolio.summary.averageReadiness}%`, detail: text('\u043f\u043e \u043f\u043e\u0440\u0442\u0444\u0435\u043b\u044e', 'portfolio') },
      { label: text('\u041a\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435', 'Critical'), value: portfolio.summary.criticalCampaigns, detail: `${portfolio.summary.riskCount} ${text('\u0440\u0438\u0441\u043a\u043e\u0432', 'risks')}` },
      { label: text('\u041f\u0440\u043e\u0441\u0440\u043e\u0447\u0435\u043d\u044b', 'Overdue'), value: portfolio.summary.overdueCampaigns, detail: text('\u0442\u0440\u0435\u0431\u0443\u044e\u0442 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f', 'need action') },
      { label: text('\u0421\u0442\u0430\u0440\u0442 \u0434\u043e 30 \u0434\u043d\u0435\u0439', 'Starts within 30 days'), value: portfolio.summary.upcoming30Days, detail: text('\u0431\u043b\u0438\u0436\u0430\u0439\u0448\u0438\u0435', 'upcoming') },
    ], ['draft', 'open', 'closed', 'cancelled'], text('\u041f\u043e\u0438\u0441\u043a \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0438 \u0438\u043b\u0438 \u0441\u0435\u0437\u043e\u043d\u0430', 'Search campaign or season'), planningAction(caps));
    if (header.active === 'line-plan') return odPage(text('\u041f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u0430\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442\u0430', 'Assortment planning'), header, renderLinePlan());
    let rows = portfolio.campaigns;
    if (header.active === 'timeline') {
      return odPage(text('\u041f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0439', 'Collection planning'), header, renderTimeline(portfolio));
    }
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
