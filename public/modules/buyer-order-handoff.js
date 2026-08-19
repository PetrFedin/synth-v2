(function installBuyerOrderHandoff(global) {
  'use strict';

  function list(input) { return Array.isArray(input) ? input : []; }
  function text(ru, en) { return typeof localText === 'function' ? localText(ru, en) : (I18N?.getLocale?.() === 'en' ? en : ru); }
  function workspace() { return state.workspace || {}; }

  function currentContext() {
    const linesheets = global.SynthaLinesheets;
    if (!linesheets || linesheets.mode !== 'buyer' || !linesheets.cycleId) return null;
    const cycle = list(workspace().cycles).find(item => item.id === linesheets.cycleId) || null;
    if (!cycle) return null;
    const selection = list(workspace().selections).find(item => item.cycleId === cycle.id) || null;
    if (!selection) return null;
    const order = list(workspace().orders).find(item => item.selectionId === selection.id) || null;
    return Object.freeze({ cycle, selection, order });
  }

  function canCreateOrder(context) {
    const caps = global.SynthaUiCapabilities;
    return context.selection.status === 'submitted'
      && context.cycle.stage === 'order-builder'
      && !context.order
      && Boolean(caps?.hasForOrganisation?.(workspace(), context.selection.shopId, caps.CAPABILITIES.ORDER_WRITE));
  }

  function progressState(context) {
    const order = context.order;
    const cycleStage = context.cycle.stage;
    return [
      Object.freeze({ label: text('Подборка', 'Selection'), state: context.selection.status === 'submitted' ? 'complete' : 'active', detail: context.selection.status }),
      Object.freeze({ label: text('Заказ', 'Order'), state: order ? (order.status === 'attached' ? 'complete' : 'active') : 'pending', detail: order?.status || text('Не создан', 'Not created') }),
      Object.freeze({ label: text('Подтверждение', 'Confirmation'), state: cycleStage === 'deal-space' ? 'complete' : (cycleStage === 'order' && order?.status === 'attached' ? 'active' : 'pending'), detail: cycleStage === 'deal-space' ? text('Подтверждено', 'Confirmed') : text('Ожидается', 'Pending') }),
      Object.freeze({ label: 'DealSpace', state: cycleStage === 'deal-space' ? 'complete' : 'pending', detail: cycleStage === 'deal-space' ? text('Открыт', 'Open') : text('Ожидается', 'Pending') }),
    ];
  }

  function progressCard(context) {
    const card = el('section', {
      className: 'card',
      'data-ods-role': 'card',
      'data-ods-part': 'surface',
      'data-buyer-order-handoff': 'true',
    });
    const head = el('div', { className: 'toolbar', 'data-ods-part': 'section-head' });
    const copy = el('div');
    copy.append(
      el('span', { className: 'muted', rawText: text('Единый коммерческий путь', 'Unified commercial journey') }),
      el('h3', { rawText: text('От матрицы к подтверждённому заказу', 'From matrix to confirmed order') }),
      el('p', { className: 'muted', rawText: text('Продолжайте работу здесь: заказ, двустороннее согласование и DealSpace используют тот же зафиксированный коммерческий контекст.', 'Continue here: order creation, bilateral approval and DealSpace use the same pinned commercial context.') }),
    );
    head.append(copy);
    card.append(head);

    const progress = el('div', { className: 'stack', 'data-ods-part': 'progress' });
    progressState(context).forEach(step => {
      const row = el('div', { className: 'toolbar', 'data-ods-part': 'progress-step' });
      row.append(
        el('strong', { rawText: step.label }),
        el('span', { className: `badge ${step.state}`.trim(), rawText: step.detail }),
      );
      progress.append(row);
    });
    card.append(progress);

    const actions = el('div', { className: 'toolbar', 'data-ods-part': 'actions' });
    if (canCreateOrder(context)) {
      const create = el('button', { className: 'button primary', type: 'button', rawText: text('Создать заказ из этой подборки', 'Create order from this selection') });
      create.addEventListener('click', () => runAction(() => global.orderForm(context.selection.id), create));
      actions.append(create);
    }

    if (context.order && typeof global.odOrderActions === 'function') {
      global.odOrderActions(context.order).forEach(action => actions.append(action));
    }

    if (typeof global.SynthaCommercialCycleActions?.actionsFor === 'function') {
      global.SynthaCommercialCycleActions.actionsFor({ ...context.cycle, order: context.order }).forEach(action => actions.append(action));
    }

    if (actions.childElementCount) card.append(actions);
    return card;
  }

  function decorate(view) {
    if (state.view !== 'linesheets' || global.SynthaLinesheets?.mode !== 'buyer' || !view) return view;
    const context = currentContext();
    if (!context || (context.selection.status !== 'submitted' && !context.order)) return view;
    view.querySelector('[data-buyer-order-handoff="true"]')?.remove();
    view.append(progressCard(context));
    return view;
  }

  const previousRenderView = renderView;
  renderView = function renderViewWithBuyerOrderHandoff() {
    return decorate(previousRenderView());
  };

  global.SynthaBuyerOrderHandoff = Object.freeze({ currentContext, canCreateOrder, progressState });
})(window);
