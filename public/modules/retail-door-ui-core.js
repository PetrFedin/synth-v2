(function initRetailDoorUiCore(global) {
  function invariant(condition, code) {
    if (!condition) throw new Error(code);
  }

  function activeDoorsForSelection(selection, doorsByShop = {}) {
    if (!selection?.shopId) return [];
    const doors = Array.isArray(doorsByShop[selection.shopId]) ? doorsByShop[selection.shopId] : [];
    return doors.filter(door => door?.status === 'active' && door.shopId === selection.shopId);
  }

  function buildOrderPayload({ selectionId, retailDoorId, terms }, selections = [], doorsByShop = {}) {
    const selection = selections.find(item => item?.id === selectionId);
    invariant(selection, 'ORDER_SELECTION_INVALID');
    const door = activeDoorsForSelection(selection, doorsByShop).find(item => item.id === retailDoorId);
    invariant(door, 'ORDER_RETAIL_DOOR_INVALID');
    invariant(terms && typeof terms === 'object' && !Array.isArray(terms), 'ORDER_TERMS_INVALID');
    return Object.freeze({ selectionId: selection.id, retailDoorId: door.id, terms });
  }

  global.SynthaRetailDoorUi = Object.freeze({ activeDoorsForSelection, buildOrderPayload });
})(window);
