(function installBuyerWorkspaceContinuityCore(global) {
  'use strict';

  const STAGES = Object.freeze(['catalog', 'retail-door', 'selection', 'order', 'deal']);
  const LABELS = Object.freeze({
    ru: Object.freeze({
      catalog: 'Каталог',
      'retail-door': 'Точка продаж',
      selection: 'Подбор',
      order: 'Заказ',
      deal: 'Сделка',
    }),
    en: Object.freeze({
      catalog: 'Catalog',
      'retail-door': 'Retail Door',
      selection: 'Selection',
      order: 'Order',
      deal: 'Deal',
    }),
  });

  function list(value) { return Array.isArray(value) ? value : []; }
  function text(value) { return String(value ?? '').trim(); }
  function locale(value) { return value === 'en' ? 'en' : 'ru'; }

  function pinnedDoor(selection) {
    if (!selection?.retailDoorId || !selection?.buyerCommercialSnapshot) return null;
    const snapshot = selection.buyerCommercialSnapshot;
    return Object.freeze({
      id: selection.retailDoorId,
      version: selection.retailDoorVersion ?? null,
      code: text(snapshot.doorCode),
      name: text(snapshot.doorName),
      city: text(snapshot.shipToAddress?.city),
      pinned: true,
    });
  }

  function mutableDoor(input) {
    if (!input?.id) return null;
    return Object.freeze({
      id: input.id,
      version: input.version ?? null,
      code: text(input.code),
      name: text(input.name),
      city: text(input.shipToAddress?.city),
      pinned: false,
    });
  }

  function doorLabel(door) {
    if (!door) return '';
    return [door.code, door.name, door.city].map(text).filter(Boolean).join(' · ') || text(door.id);
  }

  function orderForSelection(orders, selection) {
    if (!selection?.id) return null;
    return list(orders).find(order => order?.selectionId === selection.id) || null;
  }

  function stageState({ code, catalog, door, selection, order, cycleStage, labels }) {
    if (code === 'catalog') {
      return step(code, labels[code], catalog ? 'complete' : 'active', catalog?.id || '');
    }
    if (code === 'retail-door') {
      if (door?.pinned) return step(code, labels[code], 'complete', doorLabel(door), true);
      return step(code, labels[code], door ? 'active' : 'pending', doorLabel(door));
    }
    if (code === 'selection') {
      const status = text(selection?.status);
      if (!selection) return step(code, labels[code], 'pending', '');
      return step(code, labels[code], status === 'submitted' ? 'complete' : 'active', status);
    }
    if (code === 'order') {
      const status = text(order?.status);
      if (!order) return step(code, labels[code], 'pending', '');
      const complete = status === 'attached' || cycleStage === 'order' || cycleStage === 'confirmation' || cycleStage === 'deal-space';
      return step(code, labels[code], complete ? 'complete' : 'active', status);
    }
    if (code === 'deal') {
      const open = cycleStage === 'deal-space';
      return step(code, labels[code], open ? 'complete' : 'pending', open ? 'open' : '');
    }
    return step(code, labels[code] || code, 'pending', '');
  }

  function step(code, label, state, detail, pinned = false) {
    return Object.freeze({ code, label, state, detail: text(detail), pinned: Boolean(pinned) });
  }

  function buildBuyerJourneyState(input = {}, requestedLocale = 'ru') {
    const lang = locale(requestedLocale);
    const selection = input.selection || null;
    const order = input.order || orderForSelection(input.orders, selection);
    const frozenDoor = pinnedDoor(selection);
    const door = frozenDoor || mutableDoor(input.retailDoor);
    const catalog = input.catalog || null;
    const cycleStage = text(input.cycle?.stage || input.cycleStage);
    const labels = LABELS[lang];
    const stages = Object.freeze(STAGES.map(code => stageState({ code, catalog, door, selection, order, cycleStage, labels })));
    const activeIndex = Math.max(0, stages.findIndex(stage => stage.state === 'active'));
    const completed = stages.filter(stage => stage.state === 'complete').length;

    return Object.freeze({
      locale: lang,
      catalog,
      retailDoor: door,
      selection,
      order,
      cycleStage,
      stages,
      activeStage: stages[activeIndex] || stages[0],
      completed,
      total: stages.length,
      retailDoorPinned: Boolean(frozenDoor),
    });
  }

  global.SynthaBuyerWorkspaceContinuity = Object.freeze({
    STAGES,
    LABELS,
    pinnedDoor,
    doorLabel,
    orderForSelection,
    buildBuyerJourneyState,
  });
})(typeof window === 'undefined' ? globalThis : window);
