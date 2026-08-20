(function installBuyerOrderHandoff(global) {
  'use strict';

  const Continuity = global.SynthaBuyerWorkspaceContinuity;
  if (!Continuity) throw new Error('BUYER_WORKSPACE_CONTINUITY_REQUIRED: buyer continuity core must load before buyer order handoff');

  function list(input) { return Array.isArray(input) ? input : []; }
  function value(input) { return String(input ?? '').trim(); }
  function text(ru, en) { return typeof localText === 'function' ? localText(ru, en) : (I18N?.getLocale?.() === 'en' ? en : ru); }
  function locale() { return I18N?.getLocale?.() === 'en' ? 'en' : 'ru'; }
  function workspace() { return state.workspace || {}; }

  function currentContext() {
    const linesheets = global.SynthaLinesheets;
    if (!linesheets || linesheets.mode !== 'buyer') return null;
    const cycle = linesheets.cycleId ? list(workspace().cycles).find(item => item.id === linesheets.cycleId) || null : null;
    const selection = cycle ? list(workspace().selections).find(item => item.cycleId === cycle.id) || null : null;
    const order = selection ? list(workspace().orders).find(item => item.selectionId === selection.id) || null : null;
    const mutableDoor = !selection?.retailDoorId
      ? list(linesheets.buyerDoors).find(item => item.id === linesheets.buyerDoorId) || null
      : null;
    const journey = Continuity.buildBuyerJourneyState({
      catalog: linesheets.buyerCatalog || null,
      retailDoor: mutableDoor,
      selection,
      order,
      cycle,
    }, locale());
    return Object.freeze({ cycle, selection, order, journey });
  }

  function canCreateOrder(context) {
    const caps = global.SynthaUiCapabilities;
    return Boolean(context.selection)
      && context.selection.status === 'submitted'
      && context.cycle?.stage === 'order-builder'
      && !context.order
      && Boolean(caps?.hasForOrganisation?.(workspace(), context.selection.shopId, caps.CAPABILITIES.ORDER_WRITE));
  }

  function localizedDetail(stage, journey) {
    if (stage.code === 'catalog') return journey.catalog ? text('Готов к выбору', 'Ready to select') : text('Ожидается', 'Pending');
    if (stage.code === 'retail-door') {
      if (!journey.retailDoor) return text('Выберите точку', 'Select door');
      return journey.retailDoorPinned ? text('Зафиксирована', 'Pinned') : text('Выбрана', 'Selected');
    }
    if (stage.code === 'selection') {
      if (stage.detail === 'draft') return text('Черновик', 'Draft');
      if (stage.detail === 'submitted') return text('Отправлен', 'Submitted');
      return text('Ожидается', 'Pending');
    }
    if (stage.code === 'order') {
      if (!stage.detail) return text('Ожидается', 'Pending');
      const labels = {
        draft: text('Черновик', 'Draft'),
        proposed: text('На согласовании', 'Proposed'),
        accepted: text('Согласован', 'Accepted'),
        attached: text('Зафиксирован', 'Attached'),
        cancelled: text('Отменён', 'Cancelled'),
      };
      return labels[stage.detail] || stage.detail;
    }
    if (stage.code === 'deal') return stage.state === 'complete' ? text('Открыта', 'Open') : text('Ожидается', 'Pending');
    return stage.detail || text('Ожидается', 'Pending');
  }

  function journeyRail(context) {
    const journey = context.journey;
    const card = el('section', {
      className: 'card buyer-journey',
      'data-od14-component': 'card',
      'data-ods-role': 'card',
      'data-ods-part': 'surface',
      'data-buyer-order-handoff': 'true',
      ariaLabel: text('Коммерческий путь покупателя', 'Buyer commercial journey'),
    });
    const head = el('div', { className: 'buyer-journey-head', 'data-od14-component': 'section-head' });
    const copy = el('div');
    copy.append(
      el('span', { className: 'ls9-eyebrow', rawText: text('Единый коммерческий контекст', 'Unified commercial context') }),
      el('h3', { rawText: text('От каталога до сделки', 'From catalog to deal') }),
      el('p', { className: 'muted', rawText: text('Продолжайте работу в одном пространстве: выбранная торговая точка фиксируется в подборе и без повторного выбора наследуется заказом и сделкой.', 'Continue in one workspace: the selected Retail Door is pinned in Selection and inherited by the order and deal without another choice.') }),
    );
    head.append(copy);
    if (journey.retailDoorPinned) head.append(el('span', { className: 'badge complete', rawText: text('Контекст зафиксирован', 'Context pinned') }));
    card.append(head);

    const rail = el('ol', { className: 'buyer-journey-rail', 'data-od14-component': 'progress', ariaLabel: text('Этапы коммерческого пути', 'Commercial journey stages') });
    journey.stages.forEach((stage, index) => {
      const item = el('li', {
        className: `buyer-journey-step ${stage.state}`.trim(),
        'data-journey-stage': stage.code,
        'data-journey-state': stage.state,
      });
      const marker = el('span', { className: 'buyer-journey-marker', rawText: stage.state === 'complete' ? '✓' : String(index + 1), ariaHidden: 'true' });
      const copyBlock = el('span', { className: 'buyer-journey-copy' });
      copyBlock.append(
        el('strong', { rawText: stage.label }),
        el('small', { className: 'muted', rawText: localizedDetail(stage, journey) }),
      );
      item.append(marker, copyBlock);
      rail.append(item);
    });
    card.append(rail);

    const contextStrip = el('div', { className: 'buyer-journey-context', 'data-od14-component': 'metrics' });
    if (journey.catalog) contextStrip.append(contextItem(text('Каталог', 'Catalog'), value(journey.catalog.id) || '—'));
    if (journey.retailDoor) contextStrip.append(contextItem(text('Точка продаж', 'Retail Door'), Continuity.doorLabel(journey.retailDoor) || '—'));
    if (journey.selection) contextStrip.append(contextItem(text('Подбор', 'Selection'), value(journey.selection.id) || '—'));
    if (journey.order) contextStrip.append(contextItem(text('Заказ', 'Order'), value(journey.order.id) || '—'));
    if (contextStrip.childElementCount) card.append(contextStrip);

    const actions = el('div', { className: 'toolbar buyer-journey-actions', 'data-ods-part': 'actions' });
    if (canCreateOrder(context)) {
      const create = el('button', { className: 'button primary', type: 'button', rawText: text('Продолжить к заказу', 'Continue to order') });
      create.addEventListener('click', () => runAction(() => global.orderForm(context.selection.id), create));
      actions.append(create);
    }
    if (context.order && typeof global.odOrderActions === 'function') {
      global.odOrderActions(context.order).forEach(action => actions.append(action));
    }
    if (context.cycle && typeof global.SynthaCommercialCycleActions?.actionsFor === 'function') {
      global.SynthaCommercialCycleActions.actionsFor({ ...context.cycle, order: context.order }).forEach(action => actions.append(action));
    }
    if (actions.childElementCount) card.append(actions);
    return card;
  }

  function contextItem(label, content) {
    const item = el('div', { className: 'buyer-journey-context-item' });
    item.append(el('span', { className: 'muted', rawText: label }), el('strong', { rawText: content }));
    return item;
  }

  function decorate(view) {
    if (state.view !== 'linesheets' || global.SynthaLinesheets?.mode !== 'buyer' || !view) return view;
    const context = currentContext();
    if (!context) return view;
    view.querySelector('[data-buyer-order-handoff="true"]')?.remove();
    const card = journeyRail(context);
    const metrics = view.querySelector('.ls9-metrics');
    if (metrics) metrics.before(card);
    else {
      const tabs = view.querySelector('.ls9-tabs');
      if (tabs) tabs.after(card); else view.prepend(card);
    }
    return view;
  }

  const previousRenderView = renderView;
  renderView = function renderViewWithBuyerOrderHandoff() {
    return decorate(previousRenderView());
  };

  global.SynthaBuyerOrderHandoff = Object.freeze({ currentContext, canCreateOrder, journeyRail });
})(window);
