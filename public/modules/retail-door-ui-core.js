(function initRetailDoorUiCore(global) {
  function invariant(condition, code) {
    if (!condition) throw new Error(code);
  }

  function activeDoorsForSelection(selection, doorsByShop = {}) {
    if (!selection?.shopId) return [];
    const doors = Array.isArray(doorsByShop[selection.shopId]) ? doorsByShop[selection.shopId] : [];
    return doors.filter(door => door?.status === 'active' && door.shopId === selection.shopId);
  }

  // Заказ наследует торговую точку подборки, и сервер отвергает любую другую («должна совпадать с
  // торговой точкой выбора»). Поэтому по умолчанию подставляется точка подборки, если она ещё
  // активна; иначе — пусто, и список сам предложит первую из доступных.
  function defaultDoorIdForSelection(selection, doorsByShop = {}) {
    const doorId = selection?.retailDoorId;
    if (!doorId) return '';
    return activeDoorsForSelection(selection, doorsByShop).some(door => door.id === doorId) ? doorId : '';
  }

  function buildOrderPayload({ selectionId, retailDoorId, terms }, selections = [], doorsByShop = {}) {
    const selection = selections.find(item => item?.id === selectionId);
    invariant(selection, 'ORDER_SELECTION_INVALID');
    const door = activeDoorsForSelection(selection, doorsByShop).find(item => item.id === retailDoorId);
    invariant(door, 'ORDER_RETAIL_DOOR_INVALID');
    invariant(terms && typeof terms === 'object' && !Array.isArray(terms), 'ORDER_TERMS_INVALID');
    return Object.freeze({ selectionId: selection.id, retailDoorId: door.id, terms });
  }

  global.SynthaRetailDoorUi = Object.freeze({ activeDoorsForSelection, defaultDoorIdForSelection, buildOrderPayload });
})(window);
