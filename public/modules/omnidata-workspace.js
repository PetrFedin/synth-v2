const OD_UI = window.SynthaOmnidataUi || (window.SynthaOmnidataUi = {
  tabs: Object.create(null),
  selected: Object.create(null),
  filters: Object.create(null),
  // Which columns each registry hides. Kept per section and remembered between visits: a person who
  // works in sourcing every day should not have to hide the same four columns each morning.
  hiddenColumns: Object.create(null),
  // \u041f\u043e\u0440\u044f\u0434\u043e\u043a \u043a\u043e\u043b\u043e\u043d\u043e\u043a \u0438 \u0433\u0440\u0430\u043d\u0438\u0446\u0430 \u0437\u0430\u043a\u0440\u0435\u043f\u043b\u0435\u043d\u0438\u044f \u2014 \u0442\u0430\u043c \u0436\u0435, \u0433\u0434\u0435 \u0438\u0445 \u0432\u0438\u0434\u0438\u043c\u043e\u0441\u0442\u044c: \u044d\u0442\u043e \u043e\u0434\u043d\u043e \u0440\u0435\u0448\u0435\u043d\u0438\u0435 \u0447\u0438\u0442\u0430\u0442\u0435\u043b\u044f \u043e
  // \u0442\u043e\u043c, \u043a\u0430\u043a \u0432\u044b\u0433\u043b\u044f\u0434\u0438\u0442 \u0435\u0433\u043e \u0440\u0435\u0435\u0441\u0442\u0440, \u0438 \u0440\u0430\u0437\u043d\u043e\u0441\u0438\u0442\u044c \u0435\u0433\u043e \u043f\u043e \u0442\u0440\u0451\u043c \u043c\u0435\u0445\u0430\u043d\u0438\u0437\u043c\u0430\u043c \u0437\u043d\u0430\u0447\u0438\u043b\u043e \u0431\u044b \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u0442\u0440\u0438 \u043c\u0435\u0441\u0442\u0430,
  // \u043a\u043e\u0442\u043e\u0440\u044b\u0435 \u0440\u0430\u0441\u0445\u043e\u0434\u044f\u0442\u0441\u044f.
  columnOrder: Object.create(null),
  frozenColumns: Object.create(null),
  // \u0412\u0438\u0434, \u043e\u0431\u044a\u044f\u0432\u043b\u0435\u043d\u043d\u044b\u0439 \u0438\u0441\u0445\u043e\u0434\u043d\u044b\u043c \u0434\u043b\u044f \u0440\u0430\u0437\u0434\u0435\u043b\u0430. \u00ab\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c\u00bb \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u043a \u043d\u0435\u043c\u0443, \u0430 \u043d\u0435 \u043a \u0437\u0430\u0432\u043e\u0434\u0441\u043a\u043e\u043c\u0443: \u0438\u043d\u0430\u0447\u0435
  // \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043d\u043d\u044b\u0439 \u043e\u0434\u043d\u0430\u0436\u0434\u044b \u0440\u0435\u0435\u0441\u0442\u0440 \u043f\u0440\u0438\u0448\u043b\u043e\u0441\u044c \u0431\u044b \u0441\u043e\u0431\u0438\u0440\u0430\u0442\u044c \u0437\u0430\u043d\u043e\u0432\u043e \u043f\u043e\u0441\u043b\u0435 \u043a\u0430\u0436\u0434\u043e\u0433\u043e \u0441\u0431\u0440\u043e\u0441\u0430.
  defaultView: Object.create(null),
  // Иерархия раздела: по каким атрибутам реестр разложен на уровни и какая ветвь сейчас открыта.
  // Уровни — решение читателя о том, как он смотрит на раздел, и переживают визит; открытая ветвь —
  // положение внутри обхода, и переживать его не должна: вернуться в раздел и увидеть его пустым,
  // потому что месяц назад была выбрана ветвь, которой больше нет, — худший из возможных приёмов.
  hierarchy: Object.create(null),
  hierarchyPath: Object.create(null),
});
OD_UI.hierarchy = OD_UI.hierarchy || Object.create(null);
OD_UI.hierarchyPath = OD_UI.hierarchyPath || Object.create(null);

const OD_COLUMN_STORAGE_KEY = 'syntha-v2-hidden-columns';
function odLoadHiddenColumns() {
  try {
    const raw = window.localStorage?.getItem(OD_COLUMN_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      for (const [scope, labels] of Object.entries(parsed)) {
        if (Array.isArray(labels)) OD_UI.hiddenColumns[scope] = labels.filter(label => typeof label === 'string');
      }
    }
  } catch { /* a browser that refuses storage still gets every column */ }
}
function odSaveHiddenColumns() {
  try { window.localStorage?.setItem(OD_COLUMN_STORAGE_KEY, JSON.stringify(OD_UI.hiddenColumns)); }
  catch { /* the choice still holds for this session */ }
}
odLoadHiddenColumns();

// \u0412\u0438\u0434 \u0440\u0435\u0435\u0441\u0442\u0440\u0430: \u043f\u043e\u0440\u044f\u0434\u043e\u043a \u043a\u043e\u043b\u043e\u043d\u043e\u043a \u0438 \u0441\u043a\u043e\u043b\u044c\u043a\u043e \u043f\u0435\u0440\u0432\u044b\u0445 \u0438\u0437 \u043d\u0438\u0445 \u0437\u0430\u043a\u0440\u0435\u043f\u043b\u0435\u043d\u043e.
//
// \u0417\u0430\u043a\u0440\u0435\u043f\u043b\u0435\u043d\u0438\u0435 \u2014 \u044d\u0442\u043e \u043d\u0435 \u0443\u043a\u0440\u0430\u0448\u0435\u043d\u0438\u0435. \u0420\u0435\u0435\u0441\u0442\u0440 \u043c\u043e\u0434\u0435\u043b\u0435\u0439 \u043d\u0435\u0441\u0451\u0442 \u0434\u0432\u0430\u0434\u0446\u0430\u0442\u044c \u043a\u043e\u043b\u043e\u043d\u043e\u043a, \u0438 \u043f\u0440\u0438 \u0433\u043e\u0440\u0438\u0437\u043e\u043d\u0442\u0430\u043b\u044c\u043d\u043e\u0439
// \u043f\u0440\u043e\u043a\u0440\u0443\u0442\u043a\u0435 \u0434\u043e \u00ab\u0422\u0435\u0445\u043d\u043e\u043b\u043e\u0433\u0430\u00bb \u043f\u0435\u0440\u0432\u0430\u044f \u043a\u043e\u043b\u043e\u043d\u043a\u0430 \u2014 \u0430\u0440\u0442\u0438\u043a\u0443\u043b \u2014 \u0443\u0435\u0437\u0436\u0430\u0435\u0442, \u043f\u043e\u0441\u043b\u0435 \u0447\u0435\u0433\u043e \u0441\u0442\u0440\u043e\u043a\u0430 \u043f\u0435\u0440\u0435\u0441\u0442\u0430\u0451\u0442 \u0431\u044b\u0442\u044c
// \u0447\u0438\u0442\u0430\u0435\u043c\u043e\u0439: \u0432\u0438\u0434\u043d\u043e \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f, \u043d\u043e \u043d\u0435 \u0432\u0438\u0434\u043d\u043e, \u0447\u044c\u0438 \u043e\u043d\u0438. \u0417\u0430\u043a\u0440\u0435\u043f\u043b\u0451\u043d\u043d\u044b\u0435 \u043a\u043e\u043b\u043e\u043d\u043a\u0438 \u043e\u0441\u0442\u0430\u044e\u0442\u0441\u044f \u043d\u0430 \u043c\u0435\u0441\u0442\u0435.
//
// \u0413\u0440\u0430\u043d\u0438\u0446\u0430 \u0445\u0440\u0430\u043d\u0438\u0442\u0441\u044f \u0447\u0438\u0441\u043b\u043e\u043c, \u0430 \u043d\u0435 \u0441\u043f\u0438\u0441\u043a\u043e\u043c: \u0437\u0430\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u043c\u043e\u0436\u043d\u043e \u0442\u043e\u043b\u044c\u043a\u043e **\u043f\u0435\u0440\u0432\u044b\u0435** \u043a\u043e\u043b\u043e\u043d\u043a\u0438 \u043f\u043e\u0434\u0440\u044f\u0434 \u2014
// \u0437\u0430\u043a\u0440\u0435\u043f\u043b\u0451\u043d\u043d\u0430\u044f \u043a\u043e\u043b\u043e\u043d\u043a\u0430 \u043f\u043e\u0441\u0440\u0435\u0434\u0438 \u043f\u0440\u043e\u043a\u0440\u0443\u0447\u0438\u0432\u0430\u0435\u043c\u044b\u0445 \u043e\u0441\u0442\u0430\u0432\u043b\u044f\u043b\u0430 \u0431\u044b \u0440\u0430\u0437\u0440\u044b\u0432 \u0432 \u0441\u0442\u0440\u043e\u043a\u0435.
const OD_VIEW_STORAGE_KEY = 'syntha-v2-registry-view';
function odLoadRegistryView() {
  try {
    const raw = window.localStorage?.getItem(OD_VIEW_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    for (const [scope, view] of Object.entries(parsed)) {
      if (!view || typeof view !== 'object') continue;
      if (Array.isArray(view.order)) OD_UI.columnOrder[scope] = view.order.filter((key) => typeof key === 'string');
      if (Number.isInteger(view.frozen) && view.frozen >= 0) OD_UI.frozenColumns[scope] = view.frozen;
    }
  } catch { /* \u0431\u0440\u0430\u0443\u0437\u0435\u0440 \u0431\u0435\u0437 \u0445\u0440\u0430\u043d\u0438\u043b\u0438\u0449\u0430 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0440\u0435\u0435\u0441\u0442\u0440 \u0432 \u0438\u0441\u0445\u043e\u0434\u043d\u043e\u043c \u0432\u0438\u0434\u0435 */ }
}
function odSaveRegistryView() {
  try {
    const scopes = new Set([...Object.keys(OD_UI.columnOrder), ...Object.keys(OD_UI.frozenColumns)]);
    const value = {};
    for (const scope of scopes) {
      value[scope] = { order: OD_UI.columnOrder[scope] || [], frozen: OD_UI.frozenColumns[scope] ?? 0 };
    }
    window.localStorage?.setItem(OD_VIEW_STORAGE_KEY, JSON.stringify(value));
  } catch { /* \u0432\u044b\u0431\u043e\u0440 \u0432\u0441\u0451 \u0440\u0430\u0432\u043d\u043e \u0434\u0435\u0440\u0436\u0438\u0442\u0441\u044f \u043d\u0430 \u0432\u0440\u0435\u043c\u044f \u0441\u0435\u0441\u0441\u0438\u0438 */ }
}
odLoadRegistryView();

const OD_DEFAULT_VIEW_STORAGE_KEY = 'syntha-v2-registry-default-view';
function odLoadDefaultView() {
  try {
    const raw = window.localStorage?.getItem(OD_DEFAULT_VIEW_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') Object.assign(OD_UI.defaultView, parsed);
  } catch { /* \u0431\u0435\u0437 \u0445\u0440\u0430\u043d\u0438\u043b\u0438\u0449\u0430 \u0440\u0430\u0437\u0434\u0435\u043b \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u0442\u0441\u044f \u0437\u0430\u0432\u043e\u0434\u0441\u043a\u0438\u043c \u0432\u0438\u0434\u043e\u043c */ }
}
function odSaveDefaultView() {
  try { window.localStorage?.setItem(OD_DEFAULT_VIEW_STORAGE_KEY, JSON.stringify(OD_UI.defaultView)); }
  catch { /* \u0432\u044b\u0431\u043e\u0440 \u0434\u0435\u0440\u0436\u0438\u0442\u0441\u044f \u043d\u0430 \u0432\u0440\u0435\u043c\u044f \u0441\u0435\u0441\u0441\u0438\u0438 */ }
}
odLoadDefaultView();

const OD_HIERARCHY_STORAGE_KEY = 'syntha-v2-registry-hierarchy';
function odLoadHierarchy() {
  try {
    const raw = window.localStorage?.getItem(OD_HIERARCHY_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    for (const [scope, levels] of Object.entries(parsed)) {
      if (Array.isArray(levels)) OD_UI.hierarchy[scope] = levels.filter((label) => typeof label === 'string');
    }
  } catch { /* браузер без хранилища показывает раздел плоским списком */ }
}
function odSaveHierarchy() {
  try { window.localStorage?.setItem(OD_HIERARCHY_STORAGE_KEY, JSON.stringify(OD_UI.hierarchy)); }
  catch { /* уровни держатся на время сессии */ }
}
odLoadHierarchy();

/**
 * \u0412\u0435\u0440\u043d\u0443\u0442\u044c \u0440\u0430\u0437\u0434\u0435\u043b \u043a \u0435\u0433\u043e \u0438\u0441\u0445\u043e\u0434\u043d\u043e\u043c\u0443 \u0432\u0438\u0434\u0443.
 *
 * \u0415\u0441\u043b\u0438 \u0447\u0438\u0442\u0430\u0442\u0435\u043b\u044c \u0441\u0432\u043e\u0439 \u0432\u0438\u0434 \u043d\u0435 \u043e\u0431\u044a\u044f\u0432\u043b\u044f\u043b \u2014 \u043a \u0437\u0430\u0432\u043e\u0434\u0441\u043a\u043e\u043c\u0443: \u0432\u0438\u0434\u0438\u043c\u043e\u0441\u0442\u044c \u043f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e \u0440\u0430\u0437\u0434\u0435\u043b\u0430, \u043f\u043e\u0440\u044f\u0434\u043e\u043a \u043a\u0430\u043a
 * \u043e\u043d \u0437\u0430\u0434\u0430\u043d \u0432 \u0440\u0435\u0435\u0441\u0442\u0440\u0435, \u043d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u0437\u0430\u043a\u0440\u0435\u043f\u043b\u0435\u043d\u043e.
 */
function odResetToDefaultView(scope) {
  const saved = OD_UI.defaultView[scope];
  if (saved && typeof saved === 'object') {
    OD_UI.hiddenColumns[scope] = Array.isArray(saved.hidden) ? [...saved.hidden] : [];
    OD_UI.columnOrder[scope] = Array.isArray(saved.order) ? [...saved.order] : [];
    OD_UI.frozenColumns[scope] = Number.isInteger(saved.frozen) ? saved.frozen : 0;
  } else {
    delete OD_UI.hiddenColumns[scope];
    delete OD_UI.columnOrder[scope];
    delete OD_UI.frozenColumns[scope];
  }
  odSaveHiddenColumns();
  odSaveRegistryView();
}

function odFrozenCount(scope) {
  const value = OD_UI.frozenColumns[scope];
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

/**
 * \u041a\u043e\u043b\u043e\u043d\u043a\u0438 \u0432 \u0442\u043e\u043c \u043f\u043e\u0440\u044f\u0434\u043a\u0435, \u0432 \u043a\u0430\u043a\u043e\u043c \u0438\u0445 \u043f\u043e\u0441\u0442\u0430\u0432\u0438\u043b \u0447\u0438\u0442\u0430\u0442\u0435\u043b\u044c.
 *
 * \u0421\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0439 \u043f\u043e\u0440\u044f\u0434\u043e\u043a \u2014 \u044d\u0442\u043e \u0441\u043f\u0438\u0441\u043e\u043a \u043a\u043b\u044e\u0447\u0435\u0439, \u0430 \u043d\u0435 \u0441\u0430\u043c\u0438 \u043a\u043e\u043b\u043e\u043d\u043a\u0438: \u0440\u0435\u0435\u0441\u0442\u0440 \u043c\u043e\u0436\u0435\u0442 \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u043d\u043e\u0432\u0443\u044e \u043a\u043e\u043b\u043e\u043d\u043a\u0443
 * \u0432 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0439 \u0432\u0435\u0440\u0441\u0438\u0438, \u0438 \u043e\u043d\u0430 \u0432\u0441\u0442\u0430\u043d\u0435\u0442 \u0432 \u043a\u043e\u043d\u0435\u0446, \u0430 \u043d\u0435 \u043f\u043e\u0442\u0435\u0440\u044f\u0435\u0442\u0441\u044f. \u041a\u043b\u044e\u0447\u0438, \u043a\u043e\u0442\u043e\u0440\u044b\u0445 \u0432 \u0440\u0435\u0435\u0441\u0442\u0440\u0435 \u0431\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442,
 * \u043c\u043e\u043b\u0447\u0430 \u043e\u0442\u0431\u0440\u0430\u0441\u044b\u0432\u0430\u044e\u0442\u0441\u044f \u2014 \u0438\u043d\u0430\u0447\u0435 \u043f\u043e\u0440\u044f\u0434\u043e\u043a \u043b\u043e\u043c\u0430\u043b\u0441\u044f \u0431\u044b \u043f\u0440\u0438 \u043a\u0430\u0436\u0434\u043e\u043c \u043f\u0435\u0440\u0435\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0438.
 */
function odOrderedColumns(scope, columns) {
  const order = OD_UI.columnOrder[scope];
  if (!Array.isArray(order) || order.length === 0) return columns;
  const byKey = new Map(columns.map((column) => [odColumnKey(column), column]));
  const ordered = [];
  for (const key of order) {
    const column = byKey.get(key);
    if (column) { ordered.push(column); byKey.delete(key); }
  }
  // \u041d\u043e\u0432\u044b\u0435 \u043a\u043e\u043b\u043e\u043d\u043a\u0438, \u043a\u043e\u0442\u043e\u0440\u044b\u0445 \u0447\u0438\u0442\u0430\u0442\u0435\u043b\u044c \u0435\u0449\u0451 \u043d\u0435 \u0432\u0438\u0434\u0435\u043b, \u0438\u0434\u0443\u0442 \u0441\u043b\u0435\u0434\u043e\u043c \u0432 \u0438\u0445 \u0438\u0441\u0445\u043e\u0434\u043d\u043e\u043c \u043f\u043e\u0440\u044f\u0434\u043a\u0435.
  for (const column of columns) if (byKey.has(odColumnKey(column))) ordered.push(column);
  return ordered;
}

function odMoveColumn(scope, columns, key, direction) {
  const ordered = odOrderedColumns(scope, columns).map(odColumnKey);
  const from = ordered.indexOf(key);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ordered.length) return false;
  ordered.splice(to, 0, ordered.splice(from, 1)[0]);
  OD_UI.columnOrder[scope] = ordered;
  odSaveRegistryView();
  return true;
}

// A column is remembered by its key, not by its heading: a heading is translated, and keying the
// choice on it lost every hidden column the moment the reader switched language.
function odColumnKey(column) { return column.key || column.label; }
// Sections that carry more columns than anyone needs at once open with the secondary ones switched
// off. The reader turns them on in the column chooser, and that choice then wins.
const OD_COLUMN_DEFAULT_HIDDEN = Object.freeze({
  styles: Object.freeze(['gender', 'ageGroup', 'season', 'productManager', 'fabricManager', 'technologist']),
  linePlan: Object.freeze(['ageGroup', 'fit', 'seasonality', 'colourways', 'plannedCost', 'actualCost']),
});
function odHiddenColumns(scope) {
  const stored = OD_UI.hiddenColumns[scope];
  if (stored) return new Set(stored);
  return new Set(OD_COLUMN_DEFAULT_HIDDEN[scope] || []);
}
function odVisibleColumns(scope, columns) {
  const hidden = odHiddenColumns(scope);
  // Порядок применяется до скрытия: читатель расставляет все колонки, а видит те, что оставил.
  const visible = odOrderedColumns(scope, columns).filter(column => !hidden.has(odColumnKey(column)));
  // Never leave a registry with nothing to read: the first column always survives.
  return visible.length ? visible : columns.slice(0, 1);
}
function odToggleColumn(scope, key, columns) {
  const hidden = odHiddenColumns(scope);
  if (hidden.has(key)) hidden.delete(key);
  else if (odVisibleColumns(scope, columns).length > 1) hidden.add(key);
  else return false;
  OD_UI.hiddenColumns[scope] = [...hidden];
  odSaveHiddenColumns();
  return true;
}

function odText(ru, en) { return localText(ru, en); }
function odList(value) { return Array.isArray(value) ? value : []; }
function odValue(value) { return String(value ?? '').trim(); }
function odSetTab(scope, value) { OD_UI.tabs[scope] = value; renderApp(); }
function odSetFilter(scope, key, value) {
  OD_UI.filters[scope] = { ...(OD_UI.filters[scope] || {}), [key]: value };
  renderApp();
}

function odTabs(scope, items) {
  const active = OD_UI.tabs[scope] || items[0].id;
  const node = el('nav', { className: 'od-tabs', ariaLabel: odText('\u0412\u043a\u043b\u0430\u0434\u043a\u0438 \u0440\u0430\u0437\u0434\u0435\u043b\u0430', 'Section tabs') });
  items.forEach(item => {
    const button = el('button', {
      className: `od-tab ${active === item.id ? 'active' : ''}`.trim(),
      type: 'button',
      rawText: item.label,
      ariaPressed: active === item.id ? 'true' : 'false',
    });
    button.addEventListener('click', () => odSetTab(scope, item.id));
    node.append(button);
  });
  return { node, active };
}

function odMetric(label, value, detail = '', tone = '') {
  const card = el('article', { className: `od-metric ${tone}`.trim() });
  card.append(
    el('span', { className: 'od-metric-label', rawText: label }),
    el('strong', { className: 'od-metric-value', rawText: String(value) }),
    el('span', { className: 'od-metric-detail', rawText: detail }),
  );
  return card;
}

function odMetrics(items) {
  const node = el('section', { className: 'od-metrics' });
  items.forEach(item => node.append(odMetric(item.label, item.value, item.detail, item.tone)));
  return node;
}

function odSearch(scope, placeholder) {
  const field = el('label', { className: 'od-filter od-search' });
  field.append(icon('search'));
  const input = el('input', {
    type: 'search',
    value: OD_UI.filters[scope]?.query || '',
    placeholder,
    ariaLabel: placeholder,
  });
  // Filter as the reader types. Binding only change and Enter meant a search box that looked live and
  // was not, while the filter panel's own "find an attribute" box in this same file filters on input.
  // The re-render steals focus, so the caret is put back where it was.
  let debounce = 0;
  const apply = () => {
    const query = input.value.trim();
    if (query === String(OD_UI.filters[scope]?.query || '')) return;
    OD_UI.focusSearch = scope;
    odSetFilter(scope, 'query', query);
  };
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(apply, 180);
  });
  input.addEventListener('change', apply);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { clearTimeout(debounce); apply(); }
  });
  if (OD_UI.focusSearch === scope) {
    OD_UI.focusSearch = null;
    queueMicrotask(() => {
      if (!input.isConnected) return;
      input.focus();
      const end = input.value.length;
      try { input.setSelectionRange(end, end); } catch { /* a search input may refuse a range */ }
    });
  }
  field.append(input);
  return field;
}

function odStatusFilter(scope, values) {
  const field = el('label', { className: 'od-filter' });
  field.append(el('span', { className: 'od-filter-label', rawText: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status') }));
  const select = el('select');
  const current = OD_UI.filters[scope]?.status || 'all';
  [{ value: 'all', label: odText('\u0412\u0441\u0435', 'All') }, ...values.map(value => ({ value, label: statusLabel(value) }))].forEach(option => {
    const node = el('option', { value: option.value, rawText: option.label });
    if (option.value === current) node.selected = true;
    select.append(node);
  });
  select.addEventListener('change', () => odSetFilter(scope, 'status', select.value));
  field.append(select);
  return field;
}

function odAction(label, handler) {
  if (!label || typeof handler !== 'function') return null;
  const button = el('button', { className: 'button primary', type: 'button', rawText: label });
  button.addEventListener('click', handler);
  return button;
}

function odHeader(scope, tabs, metrics, statuses, placeholder, action) {
  const tabState = odTabs(scope, tabs);
  const fragment = document.createDocumentFragment();
  fragment.append(tabState.node, odMetrics(metrics));
  const bar = el('section', { className: 'od-commandbar' });
  // A section with no register has nothing for a search box to filter. The dashboard carried one
  // anyway, three hundred pixels from the topbar search that does work, and it did nothing at all.
  if (placeholder) bar.append(odSearch(scope, placeholder));
  if (statuses.length) bar.append(odStatusFilter(scope, statuses));
  if (action) bar.append(action);
  fragment.append(bar);
  return { fragment, active: tabState.active };
}

// Whether anything is narrowing this register right now: a search, a status other than "all", or a
// chosen attribute value.
function odFilterIsActive(scope) {
  // Открытая ветвь иерархии сужает реестр так же, как фильтр, и живёт отдельно от `filters` —
  // поэтому проверяется до выхода по их отсутствию.
  if ((OD_UI.hierarchyPath[scope] || []).length) return true;
  const filters = OD_UI.filters?.[scope];
  if (!filters) return false;
  if (String(filters.query || '').trim()) return true;
  if (filters.status && filters.status !== 'all') return true;
  return Object.values(filters.attributes || {}).some(values => Array.isArray(values) && values.length);
}

/**
 * Отобрать строки реестра по всему, что его сейчас сужает.
 *
 * `includeBranch` выключается ровно в одном месте — при построении дерева иерархии: дерево должно
 * показывать и соседние ветви с их количествами, иначе из выбранной ветви некуда перейти.
 *
 * @param {any[]} items
 * @param {string} scope
 * @param {(item: any) => any} [statusAccessor]
 * @param {boolean} [includeBranch]
 */
function odFilter(items, scope, statusAccessor = item => item.status, includeBranch = true) {
  const query = String(OD_UI.filters[scope]?.query || '').trim().toLocaleLowerCase();
  const status = OD_UI.filters[scope]?.status || 'all';
  const attributes = OD_UI.filters[scope]?.attributes || {};
  const columns = OD_UI.registry?.[scope]?.columns || [];
  const chosen = Object.entries(attributes).filter(([, values]) => Array.isArray(values) && values.length);
  const branch = includeBranch ? odHierarchyBranch(scope) : [];
  return items.filter(item => {
    if (status !== 'all' && String(statusAccessor(item) || '') !== status) return false;
    for (const step of branch) {
      if (odHierarchyValue(step.column, item) !== step.value) return false;
    }
    for (const [label, values] of chosen) {
      const column = columns.find(candidate => candidate.label === label);
      if (!column) continue;
      if (!values.includes(odAttributeValue(column, item))) return false;
    }
    return !query || odSearchHaystack(item).includes(query);
  });
}

// What the search box actually searches: the values in a row, never the names of its fields.
// Matching the serialised object meant a query could land inside a key — "tee" sits inside
// "categoryAttributeExpected" — and quietly return every row while looking like it had filtered.
const OD_SEARCH_HAYSTACK = new WeakMap();
function odSearchHaystack(item) {
  if (item === null || typeof item !== 'object') return String(item ?? '').toLocaleLowerCase();
  const cached = OD_SEARCH_HAYSTACK.get(item);
  if (cached !== undefined) return cached;
  const parts = [];
  const seen = new Set();
  const walk = (value, depth) => {
    if (depth > 6 || parts.length > 400) return;
    if (value === null || value === undefined) return;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      parts.push(String(value));
      return;
    }
    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) { value.forEach((entry) => walk(entry, depth + 1)); return; }
    Object.values(value).forEach((entry) => walk(entry, depth + 1));
  };
  walk(item, 0);
  const haystack = parts.join(' ').toLocaleLowerCase();
  OD_SEARCH_HAYSTACK.set(item, haystack);
  return haystack;
}

// A column is filterable when its cell reads as a single value. Rendered cells (badges, progress
// bars, nested tables) are shown, not compared.
function odAttributeValue(column, item) {
  if (typeof column?.value !== 'function') return '';
  let raw;
  try { raw = column.value(item); } catch { return ''; }
  if (raw instanceof Node || raw === null || raw === undefined) return '';
  if (typeof raw === 'object') return '';
  return String(raw).trim();
}

// The column chooser. A registry carries more columns than most people need at once; this decides
// which ones the section shows, per section, and remembers it between visits.
function odColumnPanel(scope) {
  const registry = OD_UI.registry?.[scope];
  const columns = registry?.columns || [];
  const panel = el('aside', { className: 'od-filter-panel od-column-panel', role: 'dialog', ariaLabel: 'Freeze Line' });
  const head = el('header', { className: 'od-filter-panel-head' });
  // \u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0432\u0437\u044f\u0442\u043e \u0438\u0437 \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u043d\u043e\u0439 \u043e\u0431\u043b\u0430\u0441\u0442\u0438, \u0430 \u043d\u0435 \u043f\u0435\u0440\u0435\u0432\u0435\u0434\u0435\u043d\u043e: \u00abFreeze Line\u00bb \u2014 \u044d\u0442\u043e \u043b\u0438\u043d\u0438\u044f, \u0432\u044b\u0448\u0435 \u043a\u043e\u0442\u043e\u0440\u043e\u0439
  // \u043a\u043e\u043b\u043e\u043d\u043a\u0438 \u0437\u0430\u043a\u0440\u0435\u043f\u043b\u0435\u043d\u044b, \u0438 \u043e\u043d\u0430 \u0436\u0435 \u0443\u043f\u0440\u0430\u0432\u043b\u044f\u0435\u0442 \u0432\u0438\u0434\u0438\u043c\u043e\u0441\u0442\u044c\u044e \u0438 \u043f\u043e\u0440\u044f\u0434\u043a\u043e\u043c. \u041f\u0435\u0440\u0435\u0432\u043e\u0434 \u00ab\u041b\u0438\u043d\u0438\u044f \u0437\u0430\u043a\u0440\u0435\u043f\u043b\u0435\u043d\u0438\u044f\u00bb
  // \u043e\u043f\u0438\u0441\u044b\u0432\u0430\u043b \u0431\u044b \u0442\u043e\u043b\u044c\u043a\u043e \u043e\u0434\u043d\u0443 \u0438\u0437 \u0442\u0440\u0451\u0445 \u0435\u0451 \u0440\u0430\u0431\u043e\u0442.
  head.append(el('h2', { className: 'od-filter-panel-title', rawText: 'Freeze Line' }));
  const close = el('button', { className: 'od-filter-panel-close', type: 'button', ariaLabel: odText('\u0417\u0430\u043a\u0440\u044b\u0442\u044c', 'Close') });
  close.append(el('span', { className: 'od-filter-panel-close-mark', rawText: '\u00d7' }));
  close.addEventListener('click', () => { OD_UI.columnPanel = null; renderApp(); });
  head.append(close);
  panel.append(head);

  const body = el('div', { className: 'od-filter-panel-body' });
  const hidden = odHiddenColumns(scope);
  const visibleCount = odVisibleColumns(scope, columns).length;
  const ordered = odOrderedColumns(scope, columns).filter(column => String(column.label || '').trim());
  const frozen = Math.min(odFrozenCount(scope), Math.max(ordered.length - 1, 0));

  ordered.forEach((column, index) => {
    const key = odColumnKey(column);
    // Классы уже существующей строки выбора сохранены: оформление и роль для них в дизайн-системе
    // определены, а новый собственный класс панель раскладывала бы по правилам filterbar — в
    // строку, и все двадцать колонок уезжали за её край.
    const row = el('label', { className: 'od-filter-option od-column-option od-column-row' });

    const box = el('input', { type: 'checkbox', ariaLabel: column.label });
    box.checked = !hidden.has(key);
    // \u041f\u043e\u0441\u043b\u0435\u0434\u043d\u044e\u044e \u043e\u0441\u0442\u0430\u0432\u0448\u0443\u044e\u0441\u044f \u043a\u043e\u043b\u043e\u043d\u043a\u0443 \u0432\u044b\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u043d\u0435\u043b\u044c\u0437\u044f, \u0438 \u044d\u043b\u0435\u043c\u0435\u043d\u0442 \u0433\u043e\u0432\u043e\u0440\u0438\u0442 \u043e\u0431 \u044d\u0442\u043e\u043c, \u0430 \u043d\u0435 \u043e\u0442\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u043c\u043e\u043b\u0447\u0430.
    if (box.checked && visibleCount <= 1) {
      box.disabled = true;
      row.title = odText('\u041e\u0434\u043d\u0430 \u043a\u043e\u043b\u043e\u043d\u043a\u0430 \u0434\u043e\u043b\u0436\u043d\u0430 \u043e\u0441\u0442\u0430\u0442\u044c\u0441\u044f', 'One column must remain');
    }
    box.addEventListener('change', () => { odToggleColumn(scope, key, columns); renderApp(); });

    const label = el('span', { className: 'od-filter-option-label', rawText: column.label });

    // \u041f\u043e\u0440\u044f\u0434\u043e\u043a \u043c\u0435\u043d\u044f\u0435\u0442\u0441\u044f \u043a\u043d\u043e\u043f\u043a\u0430\u043c\u0438, \u0430 \u043d\u0435 \u043f\u0435\u0440\u0435\u0442\u0430\u0441\u043a\u0438\u0432\u0430\u043d\u0438\u0435\u043c \u043c\u044b\u0448\u044c\u044e: \u043f\u0435\u0440\u0435\u0442\u0430\u0441\u043a\u0438\u0432\u0430\u043d\u0438\u0435 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e \u0441 \u043a\u043b\u0430\u0432\u0438\u0430\u0442\u0443\u0440\u044b,
    // \u0430 \u0440\u0435\u0435\u0441\u0442\u0440\u043e\u043c \u043f\u043e\u043b\u044c\u0437\u0443\u044e\u0442\u0441\u044f \u0438 \u0442\u0435, \u043a\u0442\u043e \u043c\u044b\u0448\u044c\u044e \u043d\u0435 \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442. \u041a\u043d\u043e\u043f\u043a\u0438 \u0434\u0435\u043b\u0430\u044e\u0442 \u0442\u0443 \u0436\u0435 \u0440\u0430\u0431\u043e\u0442\u0443 \u0438 \u0447\u0438\u0442\u0430\u044e\u0442\u0441\u044f
    // \u0432\u0441\u043f\u043e\u043c\u043e\u0433\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u043c\u0438 \u0442\u0435\u0445\u043d\u043e\u043b\u043e\u0433\u0438\u044f\u043c\u0438.
    const moveUp = el('button', { className: 'od-column-move', type: 'button', rawText: '\u2191', ariaLabel: odText(`\u041f\u043e\u0434\u043d\u044f\u0442\u044c \u00ab${column.label}\u00bb`, `Move \u00ab${column.label}\u00bb up`) });
    moveUp.disabled = index === 0;
    moveUp.addEventListener('click', () => { if (odMoveColumn(scope, columns, key, -1)) renderApp(); });
    const moveDown = el('button', { className: 'od-column-move', type: 'button', rawText: '\u2193', ariaLabel: odText(`\u041e\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u00ab${column.label}\u00bb`, `Move \u00ab${column.label}\u00bb down`) });
    moveDown.disabled = index === ordered.length - 1;
    moveDown.addEventListener('click', () => { if (odMoveColumn(scope, columns, key, 1)) renderApp(); });

    row.append(box, label, moveUp, moveDown);
    if (index < frozen) row.classList.add('od-column-frozen');
    body.append(row);

    // \u0421\u0430\u043c\u0430 \u043b\u0438\u043d\u0438\u044f: \u0432\u0441\u0451, \u0447\u0442\u043e \u0432\u044b\u0448\u0435 \u043d\u0435\u0451, \u043e\u0441\u0442\u0430\u0451\u0442\u0441\u044f \u043d\u0430 \u043c\u0435\u0441\u0442\u0435 \u043f\u0440\u0438 \u0433\u043e\u0440\u0438\u0437\u043e\u043d\u0442\u0430\u043b\u044c\u043d\u043e\u0439 \u043f\u0440\u043e\u043a\u0440\u0443\u0442\u043a\u0435.
    const boundary = el('div', { className: `od-filter-option od-freeze-line ${index + 1 === frozen ? 'active' : ''}`.trim() });
    const set = el('button', {
      className: 'od-freeze-line-handle', type: 'button',
      rawText: index + 1 === frozen ? odText('\u041b\u0438\u043d\u0438\u044f \u0437\u0430\u043a\u0440\u0435\u043f\u043b\u0435\u043d\u0438\u044f', 'Freeze line') : odText('\u0417\u0430\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u043f\u043e \u044d\u0442\u0443 \u0441\u0442\u0440\u043e\u043a\u0443', 'Freeze up to here'),
    });
    set.addEventListener('click', () => {
      OD_UI.frozenColumns[scope] = index + 1 === frozen ? 0 : index + 1;
      odSaveRegistryView();
      renderApp();
    });
    boundary.append(set);
    body.append(boundary);
  });
  panel.append(body);

  const footer = el('footer', { className: 'od-filter-panel-foot' });
  const all = el('button', { className: 'button', type: 'button', rawText: odText('\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0432\u0441\u0435', 'Show all') });
  // \u042f\u0432\u043d\u044b\u0439 \u043f\u0443\u0441\u0442\u043e\u0439 \u0441\u043f\u0438\u0441\u043e\u043a, \u0430 \u043d\u0435 \u0443\u0434\u0430\u043b\u0435\u043d\u0438\u0435 \u0437\u0430\u043f\u0438\u0441\u0438: \u0443\u0434\u0430\u043b\u0435\u043d\u0438\u0435 \u0432\u0435\u0440\u043d\u0443\u043b\u043e \u0431\u044b \u043a\u043e\u043b\u043e\u043d\u043a\u0438, \u0441\u043a\u0440\u044b\u0442\u044b\u0435 \u0440\u0430\u0437\u0434\u0435\u043b\u043e\u043c \u043f\u043e
  // \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e, \u0442\u043e \u0435\u0441\u0442\u044c \u043e\u0431\u0440\u0430\u0442\u043d\u043e\u0435 \u0442\u043e\u043c\u0443, \u043e \u0447\u0451\u043c \u043f\u0440\u043e\u0441\u044f\u0442.
  all.addEventListener('click', () => { OD_UI.hiddenColumns[scope] = []; odSaveHiddenColumns(); renderApp(); });

  // \u00ab\u0423\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u0432\u0438\u0434 \u043f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e\u00bb \u2014 \u044d\u0442\u043e \u043e\u0442\u0432\u0435\u0442 \u043d\u0430 \u0432\u043e\u043f\u0440\u043e\u0441 \u00ab\u043a \u0447\u0435\u043c\u0443 \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c\u00bb. \u0411\u0435\u0437 \u043d\u0435\u0433\u043e
  // \u0441\u0431\u0440\u043e\u0441 \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0430\u043b \u0431\u044b \u043a \u0442\u043e\u043c\u0443, \u0441 \u0447\u0435\u043c \u0440\u0430\u0437\u0434\u0435\u043b \u0432\u044b\u0448\u0435\u043b \u0441 \u0437\u0430\u0432\u043e\u0434\u0430, \u0438 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043d\u043d\u044b\u0439 \u0432\u0438\u0434 \u0442\u0435\u0440\u044f\u043b\u0441\u044f \u0431\u044b \u043a\u0430\u0436\u0434\u044b\u0439 \u0440\u0430\u0437.
  const asDefault = el('button', { className: 'button', type: 'button', rawText: odText('\u0423\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u0432\u0438\u0434 \u043f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e', 'Set as default view') });
  asDefault.addEventListener('click', () => {
    OD_UI.defaultView[scope] = {
      hidden: [...odHiddenColumns(scope)],
      order: odOrderedColumns(scope, columns).map(odColumnKey),
      frozen: odFrozenCount(scope),
    };
    odSaveDefaultView();
    toast(odText('\u0412\u0438\u0434 \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d \u043a\u0430\u043a \u0438\u0441\u0445\u043e\u0434\u043d\u044b\u0439 \u0434\u043b\u044f \u044d\u0442\u043e\u0433\u043e \u0440\u0430\u0437\u0434\u0435\u043b\u0430.', 'Saved as this section\'s default view.'));
  });

  const reset = el('button', { className: 'button', type: 'button', rawText: odText('\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c', 'Reset') });
  reset.addEventListener('click', () => { odResetToDefaultView(scope); renderApp(); });

  const done = el('button', { className: 'button primary', type: 'button', rawText: odText('\u0413\u043e\u0442\u043e\u0432\u043e', 'Done') });
  done.addEventListener('click', () => { OD_UI.columnPanel = null; renderApp(); });
  footer.append(all, asDefault, reset, done);
  panel.append(footer);
  return panel;
}

// What the badge on «Колонки» counts is what *this person* put away, not what the section
// ships with. Several registries hide a handful of specialist columns by default, and counting
// those made a freshly opened Models registry announce "-6" before anyone had touched it —
// an alarm about a state nobody chose. An untouched section counts zero.
function odHiddenColumnCount(scope) {
  const columns = OD_UI.registry?.[scope]?.columns || [];
  const stored = OD_UI.hiddenColumns[scope];
  if (!stored) return 0;
  const shipped = new Set(OD_COLUMN_DEFAULT_HIDDEN[scope] || []);
  const hidden = new Set(stored);
  return columns.filter((column) => {
    const key = odColumnKey(column);
    return hidden.has(key) && !shipped.has(key);
  }).length;
}

// The filter panel. Omnidata lists the attribute names and asks you to pick one; this lists each
// attribute with its values and how many rows carry each, so a choice takes one step instead of two
// and you can see what the filter will do before applying it.
function odFilterPanel(scope) {
  const panel = el('aside', { className: 'od-filter-panel', role: 'dialog', ariaLabel: odText('\u0424\u0438\u043b\u044c\u0442\u0440\u044b', 'Filters') });
  const head = el('header', { className: 'od-filter-panel-head' });
  head.append(el('h2', { className: 'od-filter-panel-title', rawText: odText('\u0424\u0438\u043b\u044c\u0442\u0440\u044b', 'Filters') }));
  // The icon set has no close glyph, and asking for one it does not have renders whichever icon the
  // fallback happens to return. A multiplication sign is unambiguous and matches the filter chips.
  const close = el('button', { className: 'od-filter-panel-close', type: 'button', ariaLabel: odText('\u0417\u0430\u043a\u0440\u044b\u0442\u044c', 'Close') });
  close.append(el('span', { className: 'od-filter-panel-close-mark', rawText: '\u00d7' }));
  close.addEventListener('click', () => { OD_UI.filterPanel = null; renderApp(); });
  head.append(close);
  panel.append(head);

  const search = el('label', { className: 'od-filter-panel-search' });
  search.append(icon('search'));
  const searchInput = el('input', {
    type: 'search',
    value: OD_UI.filterPanelQuery || '',
    placeholder: odText('\u041d\u0430\u0439\u0442\u0438 \u0430\u0442\u0440\u0438\u0431\u0443\u0442', 'Find an attribute'),
    ariaLabel: odText('\u041d\u0430\u0439\u0442\u0438 \u0430\u0442\u0440\u0438\u0431\u0443\u0442', 'Find an attribute'),
  });
  searchInput.addEventListener('input', () => { OD_UI.filterPanelQuery = searchInput.value; renderApp(); });
  search.append(searchInput);
  panel.append(search);

  const needle = String(OD_UI.filterPanelQuery || '').trim().toLocaleLowerCase();
  const attributes = odFilterableAttributes(scope)
    .filter(attribute => !needle || attribute.label.toLocaleLowerCase().includes(needle)
      || attribute.values.some(entry => String(entry.value).toLocaleLowerCase().includes(needle)));

  const body = el('div', { className: 'od-filter-panel-body' });
  if (!attributes.length) {
    body.append(el('p', { className: 'od-empty', rawText: needle
      ? odText('\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e', 'Nothing found')
      : odText('\u0412 \u044d\u0442\u043e\u043c \u0440\u0430\u0437\u0434\u0435\u043b\u0435 \u043d\u0435\u0447\u0435\u0433\u043e \u0444\u0438\u043b\u044c\u0442\u0440\u043e\u0432\u0430\u0442\u044c', 'Nothing to filter in this section') }));
  }
  const chosen = OD_UI.filters[scope]?.attributes || {};
  attributes.forEach(attribute => {
    const group = el('section', { className: 'od-filter-group' });
    group.append(el('h3', { className: 'od-filter-group-title', rawText: attribute.label }));
    attribute.values.forEach(entry => {
      const row = el('label', { className: 'od-filter-option' });
      const box = el('input', { type: 'checkbox' });
      box.checked = (chosen[attribute.label] || []).includes(entry.value);
      box.addEventListener('change', () => { odToggleAttribute(scope, attribute.label, entry.value); renderApp(); });
      row.append(box, el('span', { className: 'od-filter-option-label', rawText: entry.value }));
      row.append(el('span', { className: 'od-filter-option-count', rawText: String(entry.count) }));
      group.append(row);
    });
    body.append(group);
  });
  panel.append(body);

  const footer = el('footer', { className: 'od-filter-panel-foot' });
  const reset = el('button', { className: 'button', type: 'button', rawText: odText('\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c', 'Reset') });
  reset.addEventListener('click', () => { odSetFilter(scope, 'attributes', {}); renderApp(); });
  const apply = el('button', { className: 'button primary', type: 'button', rawText: odText('\u041f\u0440\u0438\u043c\u0435\u043d\u0438\u0442\u044c', 'Apply') });
  // Choices already apply as they are made, so the rows behind the panel update live; this closes it.
  apply.addEventListener('click', () => { OD_UI.filterPanel = null; renderApp(); });
  footer.append(reset, apply);
  panel.append(footer);
  return panel;
}

// Applied filters stay visible and removable outside the panel, so nobody wonders why a registry
// looks empty. Omnidata hides them once the panel closes.
function odFilterChips(scope) {
  const chosen = OD_UI.filters[scope]?.attributes || {};
  const entries = Object.entries(chosen).flatMap(([label, values]) => (values || []).map(value => ({ label, value })));
  if (!entries.length) return null;
  const strip = el('div', { className: 'od-filter-chips' });
  entries.forEach(entry => {
    const chip = el('button', { className: 'od-filter-chip', type: 'button',
      ariaLabel: `${odText('\u0423\u0431\u0440\u0430\u0442\u044c \u0444\u0438\u043b\u044c\u0442\u0440', 'Remove filter')}: ${entry.label} — ${entry.value}` });
    chip.append(el('span', { className: 'od-filter-chip-label', rawText: `${entry.label}: ${entry.value}` }), el('span', { className: 'od-filter-chip-remove', rawText: '\u00d7' }));
    chip.addEventListener('click', () => { odToggleAttribute(scope, entry.label, entry.value); renderApp(); });
    strip.append(chip);
  });
  const clear = el('button', { className: 'od-filter-chip clear', type: 'button', rawText: odText('\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c \u0432\u0441\u0451', 'Clear all') });
  clear.addEventListener('click', () => { odSetFilter(scope, 'attributes', {}); renderApp(); });
  strip.append(clear);
  return strip;
}

function odFilterableAttributes(scope) {
  const registry = OD_UI.registry?.[scope];
  if (!registry) return [];
  const byLabel = new Map();
  for (const column of registry.columns || []) {
    if (typeof column.value !== 'function') continue;
    const counts = new Map();
    for (const item of registry.rows || []) {
      const value = odAttributeValue(column, item);
      if (!value) continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    // One value across every row filters nothing, and dozens of unique values is a search, not a
    // filter. A column whose values are nearly all distinct is an identifier — a code, a title, a
    // price — and belongs in the search box, not here.
    const rowCount = (registry.rows || []).length;
    if (counts.size < 2 || counts.size > 40) continue;
    if (rowCount >= 4 && counts.size > rowCount * 0.7) continue;
    byLabel.set(column.label, [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
      .map(([value, count]) => ({ value, count })));
  }
  return [...byLabel.entries()].map(([label, values]) => ({ label, values }));
}

function odActiveFilterCount(scope) {
  const attributes = OD_UI.filters[scope]?.attributes || {};
  return Object.values(attributes).reduce((total, values) => total + (Array.isArray(values) ? values.length : 0), 0);
}

function odToggleAttribute(scope, label, value) {
  const current = { ...(OD_UI.filters[scope]?.attributes || {}) };
  const chosen = new Set(current[label] || []);
  if (chosen.has(value)) chosen.delete(value); else chosen.add(value);
  if (chosen.size) current[label] = [...chosen]; else delete current[label];
  odSetFilter(scope, 'attributes', current);
}

// —— Иерархия раздела ——
//
// Фильтр отвечает на вопрос «покажи только это». Иерархия отвечает на другой: «из чего вообще
// состоит этот раздел». Поэтому дерево строится по строкам без учёта открытой ветви: иначе после
// первого же выбора соседние ветви исчезли бы и из неё некуда было бы вернуться.
//
// Остальные сужения — поиск, статус, выбранные атрибуты — дерево учитывает: его количества
// должны совпадать с тем, что человек увидит в таблице, если перейдёт в ветвь.

// Значение атрибута для узла дерева. Строка без значения — тоже ветвь: пропустить её значило бы,
// что сумма ветвей не сошлась бы с числом экземпляров, а часть строк стала бы недостижима обходом.
const OD_HIERARCHY_BLANK = '\u2014';
function odHierarchyValue(column, item) {
  return odAttributeValue(column, item) || OD_HIERARCHY_BLANK;
}

function odHierarchyLevels(scope) {
  const stored = OD_UI.hierarchy[scope];
  return Array.isArray(stored) ? stored : [];
}

// Уровни, разрешённые в колонки того реестра, который на экране сейчас. Уровень, колонки
// которого больше нет, обрывает цепочку: всё, что ниже него, описывает разбиение, которого уже не существует.
function odHierarchyColumns(scope) {
  const columns = OD_UI.registry?.[scope]?.columns || [];
  const resolved = [];
  for (const label of odHierarchyLevels(scope)) {
    const column = columns.find(candidate => candidate.label === label && typeof candidate.value === 'function');
    if (!column) break;
    resolved.push(column);
  }
  return resolved;
}

// Открытая ветвь как список шагов «колонка → значение».
function odHierarchyBranch(scope) {
  const columns = odHierarchyColumns(scope);
  const path = OD_UI.hierarchyPath[scope] || [];
  const branch = [];
  for (let index = 0; index < path.length && index < columns.length; index += 1) {
    branch.push({ column: columns[index], value: path[index] });
  }
  return branch;
}

function odHierarchyDepth(scope) {
  return odHierarchyBranch(scope).length;
}

function odSetHierarchyLevels(scope, labels) {
  OD_UI.hierarchy[scope] = [...labels];
  // Перестроенное дерево — другое дерево, и прежняя ветвь в нём ничего не значит. Оставить её
  // значило бы показать пустой реестр без видимой причины.
  OD_UI.hierarchyPath[scope] = [];
  odSaveHierarchy();
}

/**
 * Дерево раздела: узлы по уровням с числом экземпляров в каждом.
 *
 * @param {string} scope
 */
function odHierarchyTree(scope) {
  const registry = OD_UI.registry?.[scope];
  const columns = odHierarchyColumns(scope);
  const rows = registry ? odFilter(registry.rows || [], scope, registry.statusAccessor || (item => item.status), false) : [];
  const root = { value: '', count: rows.length, children: new Map() };
  if (!columns.length) return root;
  for (const item of rows) {
    let node = root;
    for (const column of columns) {
      const value = odHierarchyValue(column, item);
      let child = node.children.get(value);
      if (!child) { child = { value, count: 0, children: new Map() }; node.children.set(value, child); }
      child.count += 1;
      node = child;
    }
  }
  return root;
}

// Узел, в котором человек сейчас стоит. От него считается «Всего экземпляров».
function odHierarchyNodeAt(root, path) {
  let node = root;
  for (const value of path) {
    const child = node.children.get(value);
    if (!child) return node;
    node = child;
  }
  return node;
}

function odHierarchySortedChildren(node) {
  return [...node.children.values()]
    .sort((left, right) => right.count - left.count || String(left.value).localeCompare(String(right.value)));
}

// Навигатор по иерархии. Сверху — из чего собрана иерархия и как её пересобрать, снизу — само
// дерево с числом экземпляров в каждой ветви.
function odHierarchyPanel(scope) {
  const panel = el('aside', { className: 'od-filter-panel od-hierarchy-panel', role: 'dialog', ariaLabel: odText('\u0421\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0430 \u0438\u0435\u0440\u0430\u0440\u0445\u0438\u0438', 'Hierarchy structure') });
  const head = el('header', { className: 'od-filter-panel-head' });
  head.append(el('h2', { className: 'od-filter-panel-title', rawText: odText('\u0421\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0430 \u0438\u0435\u0440\u0430\u0440\u0445\u0438\u0438', 'Hierarchy structure') }));
  const close = el('button', { className: 'od-filter-panel-close', type: 'button', ariaLabel: odText('\u0417\u0430\u043a\u0440\u044b\u0442\u044c', 'Close') });
  close.append(el('span', { className: 'od-filter-panel-close-mark', rawText: '\u00d7' }));
  close.addEventListener('click', () => { OD_UI.hierarchyPanel = null; renderApp(); });
  head.append(close);
  panel.append(head);

  const body = el('div', { className: 'od-filter-panel-body' });
  const levels = odHierarchyLevels(scope);
  const attributes = odFilterableAttributes(scope);
  const available = attributes.filter(attribute => !levels.includes(attribute.label));

  body.append(el('h3', { className: 'od-filter-group-title', rawText: odText('\u0423\u0440\u043e\u0432\u043d\u0438', 'Levels') }));
  if (!levels.length) {
    body.append(el('p', { className: 'od-empty', rawText: odText(
      '\u0423\u0440\u043e\u0432\u043d\u0438 \u043d\u0435 \u0437\u0430\u0434\u0430\u043d\u044b \u2014 \u0440\u0430\u0437\u0434\u0435\u043b \u043f\u043e\u043a\u0430\u0437\u0430\u043d \u043f\u043b\u043e\u0441\u043a\u0438\u043c \u0441\u043f\u0438\u0441\u043a\u043e\u043c',
      'No levels chosen \u2014 the section is shown as a flat list') }));
  }
  levels.forEach((label, index) => {
    const row = el('div', { className: 'od-filter-option od-column-option od-column-row od-hierarchy-level' });
    row.append(el('span', { className: 'od-hierarchy-level-mark', rawText: String(index + 1) }));
    row.append(el('span', { className: 'od-filter-option-label', rawText: label }));
    const up = el('button', { className: 'od-column-move', type: 'button', rawText: '\u2191', ariaLabel: odText(`\u041f\u043e\u0434\u043d\u044f\u0442\u044c \u00ab${label}\u00bb`, `Move \u00ab${label}\u00bb up`) });
    up.disabled = index === 0;
    up.addEventListener('click', () => {
      const next = [...levels];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      odSetHierarchyLevels(scope, next);
      renderApp();
    });
    const down = el('button', { className: 'od-column-move', type: 'button', rawText: '\u2193', ariaLabel: odText(`\u041e\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u00ab${label}\u00bb`, `Move \u00ab${label}\u00bb down`) });
    down.disabled = index === levels.length - 1;
    down.addEventListener('click', () => {
      const next = [...levels];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      odSetHierarchyLevels(scope, next);
      renderApp();
    });
    const drop = el('button', { className: 'od-column-move', type: 'button', rawText: '\u00d7', ariaLabel: odText(`\u0423\u0431\u0440\u0430\u0442\u044c \u0443\u0440\u043e\u0432\u0435\u043d\u044c \u00ab${label}\u00bb`, `Remove level \u00ab${label}\u00bb`) });
    drop.addEventListener('click', () => {
      odSetHierarchyLevels(scope, levels.filter(entry => entry !== label));
      renderApp();
    });
    row.append(up, down, drop);
    body.append(row);
  });

  if (available.length) {
    body.append(el('h3', { className: 'od-filter-group-title', rawText: odText('\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0443\u0440\u043e\u0432\u0435\u043d\u044c', 'Add a level') }));
    available.forEach(attribute => {
      const row = el('div', { className: 'od-filter-option od-column-option od-column-row od-hierarchy-add' });
      row.append(el('span', { className: 'od-filter-option-label', rawText: attribute.label }));
      row.append(el('span', { className: 'od-filter-option-count', rawText: String(attribute.values.length) }));
      const add = el('button', { className: 'od-column-move', type: 'button', rawText: '+', ariaLabel: odText(`\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0443\u0440\u043e\u0432\u0435\u043d\u044c \u00ab${attribute.label}\u00bb`, `Add level \u00ab${attribute.label}\u00bb`) });
      add.addEventListener('click', () => { odSetHierarchyLevels(scope, [...levels, attribute.label]); renderApp(); });
      row.append(add);
      body.append(row);
    });
  }

  const columns = odHierarchyColumns(scope);
  if (columns.length) {
    const root = odHierarchyTree(scope);
    const path = (OD_UI.hierarchyPath[scope] || []).slice(0, columns.length);
    body.append(el('h3', { className: 'od-filter-group-title', rawText: odText('\u041e\u0431\u0445\u043e\u0434', 'Browse') }));

    // «Всё» — вершина дерева: с неё начинается обход и на неё же возвращаются.
    const top = el('button', { className: `od-filter-option od-hierarchy-node ${path.length ? '' : 'selected'}`.trim(), type: 'button' });
    top.append(el('span', { className: 'od-filter-option-label', rawText: odText('\u0412\u0441\u0451', 'Everything') }));
    top.append(el('span', { className: 'od-filter-option-count', rawText: String(root.count) }));
    top.addEventListener('click', () => { OD_UI.hierarchyPath[scope] = []; renderApp(); });
    body.append(top);

    // Раскрыта только выбранная ветвь и её ближайшие дети: полностью развёрнутое дерево на трёх
    // уровнях — это сотни строк в панели шириной в двести восемьдесят пикселей.
    let node = root;
    for (let depth = 0; depth < columns.length; depth += 1) {
      const children = odHierarchySortedChildren(node);
      if (!children.length) break;
      children.forEach(child => {
        const chosen = path[depth] === child.value;
        const button = el('button', {
          className: `od-filter-option od-hierarchy-node od-hierarchy-depth-${Math.min(depth + 1, 4)} ${chosen ? 'selected' : ''}`.trim(),
          type: 'button',
        });
        button.append(el('span', { className: 'od-filter-option-label', rawText: child.value }));
        button.append(el('span', { className: 'od-filter-option-count', rawText: String(child.count) }));
        button.addEventListener('click', () => {
          // Повторный щелчок по выбранному узлу закрывает его — иначе выйти на уровень выше
          // можно было бы только через «Всё».
          OD_UI.hierarchyPath[scope] = chosen ? path.slice(0, depth) : [...path.slice(0, depth), child.value];
          renderApp();
        });
        body.append(button);
      });
      const next = path[depth] !== undefined ? node.children.get(path[depth]) : undefined;
      if (!next) break;
      node = next;
    }

    const total = odHierarchyNodeAt(root, path).count;
    body.append(el('p', { className: 'od-hierarchy-total', rawText:
      `${odText('\u0412\u0441\u0435\u0433\u043e \u044d\u043a\u0437\u0435\u043c\u043f\u043b\u044f\u0440\u043e\u0432', 'Instances in total')}: ${total}` }));
  }
  panel.append(body);

  const footer = el('footer', { className: 'od-filter-panel-foot' });
  const reset = el('button', { className: 'button', type: 'button', rawText: odText('\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c', 'Reset') });
  reset.addEventListener('click', () => { odSetHierarchyLevels(scope, []); renderApp(); });
  const done = el('button', { className: 'button primary', type: 'button', rawText: odText('\u0413\u043e\u0442\u043e\u0432\u043e', 'Done') });
  done.addEventListener('click', () => { OD_UI.hierarchyPanel = null; renderApp(); });
  footer.append(reset, done);
  panel.append(footer);
  return panel;
}

// Открытая ветвь видна и снимается снаружи панели — так же, как выбранные значения фильтра.
function odHierarchyCrumbs(scope) {
  const branch = odHierarchyBranch(scope);
  if (!branch.length) return null;
  const strip = el('div', { className: 'od-filter-chips od-hierarchy-crumbs' });
  branch.forEach((step, index) => {
    const chip = el('button', { className: 'od-filter-chip', type: 'button',
      ariaLabel: `${odText('\u0412\u0435\u0440\u043d\u0443\u0442\u044c\u0441\u044f \u043a', 'Back to')}: ${step.column.label} \u2014 ${step.value}` });
    chip.append(el('span', { className: 'od-filter-chip-label', rawText: `${step.column.label}: ${step.value}` }));
    // Щелчок по крошке обрезает ветвь по неё включительно — то есть возвращает на этот уровень.
    chip.addEventListener('click', () => { OD_UI.hierarchyPath[scope] = branch.slice(0, index).map(entry => entry.value); renderApp(); });
    strip.append(chip);
  });
  const clear = el('button', { className: 'od-filter-chip clear', type: 'button', rawText: odText('\u0412\u0435\u0441\u044c \u0440\u0430\u0437\u0434\u0435\u043b', 'Whole section') });
  clear.addEventListener('click', () => { OD_UI.hierarchyPath[scope] = []; renderApp(); });
  strip.append(clear);
  return strip;
}

function odCell(value) {
  if (value instanceof Node) return value;
  return el('span', { rawText: odValue(value) || '\u2014' });
}

function odPreview(title, subtitle = '') {
  const node = el('div', { className: 'od-preview', ariaHidden: 'true' });
  node.append(
    el('span', { className: 'od-preview-mark', rawText: initials(title || 'S') }),
    el('span', { className: 'od-preview-caption', rawText: subtitle || odText('\u041f\u0440\u0435\u0432\u044c\u044e', 'Preview') }),
  );
  return node;
}

function odTable(scope, rows, columns, rowKey = item => item.id, filterScope = scope) {
  const selectedKey = OD_UI.selected[scope] || (rows[0] ? rowKey(rows[0]) : '');
  if (selectedKey && !OD_UI.selected[scope]) OD_UI.selected[scope] = selectedKey;
  const wrap = el('div', { className: 'od-table-wrap' });
  // \u041e\u0442\u0441\u0442\u0443\u043f\u044b \u0437\u0430\u043a\u0440\u0435\u043f\u043b\u0451\u043d\u043d\u044b\u0445 \u043a\u043e\u043b\u043e\u043d\u043e\u043a \u043f\u0440\u043e\u0441\u0442\u0430\u0432\u043b\u044f\u044e\u0442\u0441\u044f \u043f\u043e\u0441\u043b\u0435 \u0432\u0441\u0442\u0430\u0432\u043a\u0438 \u0432 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442: \u0434\u043e \u043d\u0435\u0451 \u0443 \u044f\u0447\u0435\u0435\u043a \u043d\u0435\u0442 \u0448\u0438\u0440\u0438\u043d\u044b,
  // \u0438 `offsetWidth` \u0432\u0435\u0440\u043d\u0443\u043b \u0431\u044b \u043d\u043e\u043b\u044c \u2014 \u0432\u0441\u0435 \u0437\u0430\u043a\u0440\u0435\u043f\u043b\u0451\u043d\u043d\u044b\u0435 \u043a\u043e\u043b\u043e\u043d\u043a\u0438 \u043b\u0435\u0433\u043b\u0438 \u0431\u044b \u0434\u0440\u0443\u0433 \u043d\u0430 \u0434\u0440\u0443\u0433\u0430.
  // \u041e\u0442\u0441\u0442\u0443\u043f\u044b \u0437\u0430\u043a\u0440\u0435\u043f\u043b\u0451\u043d\u043d\u044b\u0445 \u043a\u043e\u043b\u043e\u043d\u043e\u043a \u0437\u0430\u0434\u0430\u0451\u0442 \u0442\u0430\u0431\u043b\u0438\u0446\u0430 \u0441\u0442\u0438\u043b\u0435\u0439, \u0430 \u043d\u0435 \u0441\u043a\u0440\u0438\u043f\u0442: \u0434\u0438\u0437\u0430\u0439\u043d-\u0441\u0438\u0441\u0442\u0435\u043c\u0430 \u0437\u0430\u043f\u0440\u0435\u0449\u0430\u0435\u0442
  // \u0434\u0438\u043d\u0430\u043c\u0438\u0447\u0435\u0441\u043a\u0443\u044e \u0441\u0442\u0438\u043b\u0438\u0437\u0430\u0446\u0438\u044e \u0438\u0437 \u0440\u0430\u043d\u0442\u0430\u0439\u043c\u0430, \u0438 \u0437\u0430\u043f\u0440\u0435\u0442 \u0432\u0435\u0440\u043d\u044b\u0439 \u2014 \u043e\u0444\u043e\u0440\u043c\u043b\u0435\u043d\u0438\u0435, \u0440\u0430\u0437\u043b\u043e\u0436\u0435\u043d\u043d\u043e\u0435 \u043c\u0435\u0436\u0434\u0443 CSS \u0438
  // \u043e\u0431\u0440\u0430\u0431\u043e\u0442\u0447\u0438\u043a\u043e\u043c, \u0440\u0430\u0441\u0445\u043e\u0434\u0438\u0442\u0441\u044f \u043f\u0440\u0438 \u043f\u0435\u0440\u0432\u043e\u0439 \u043f\u0440\u0430\u0432\u043a\u0435. \u041f\u043e\u044d\u0442\u043e\u043c\u0443 \u0437\u0430\u043a\u0440\u0435\u043f\u043b\u0451\u043d\u043d\u044b\u0435 \u043a\u043e\u043b\u043e\u043d\u043a\u0438 \u0438\u043c\u0435\u044e\u0442 \u043f\u0440\u0435\u0434\u0441\u043a\u0430\u0437\u0443\u0435\u043c\u0443\u044e
  // \u0448\u0438\u0440\u0438\u043d\u0443, \u0430 \u0438\u0445 \u0441\u043c\u0435\u0449\u0435\u043d\u0438\u044f \u043f\u0435\u0440\u0435\u0447\u0438\u0441\u043b\u0435\u043d\u044b \u0432 CSS.
  const table = el('table', { className: 'od-table' });
  const thead = el('thead');
  const head = el('tr');
  // \u0417\u0430\u043a\u0440\u0435\u043f\u043b\u0451\u043d\u043d\u044b\u0435 \u043a\u043e\u043b\u043e\u043d\u043a\u0438 \u043e\u0441\u0442\u0430\u044e\u0442\u0441\u044f \u043d\u0430 \u043c\u0435\u0441\u0442\u0435 \u043f\u0440\u0438 \u0433\u043e\u0440\u0438\u0437\u043e\u043d\u0442\u0430\u043b\u044c\u043d\u043e\u0439 \u043f\u0440\u043e\u043a\u0440\u0443\u0442\u043a\u0435. \u041e\u0442\u0441\u0442\u0443\u043f \u043a\u0430\u0436\u0434\u043e\u0439 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0439
  // \u0441\u043a\u043b\u0430\u0434\u044b\u0432\u0430\u0435\u0442\u0441\u044f \u0438\u0437 \u0448\u0438\u0440\u0438\u043d \u043f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0438\u0445, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u043e\u043d \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044f \u043f\u043e\u0441\u043b\u0435 \u043e\u0442\u0440\u0438\u0441\u043e\u0432\u043a\u0438 \u2014 \u0434\u043e \u043d\u0435\u0451 \u0448\u0438\u0440\u0438\u043d\u044b \u0435\u0449\u0451 \u043d\u0435\u0442.
  // \u041d\u0435 \u0431\u043e\u043b\u044c\u0448\u0435 \u0448\u0435\u0441\u0442\u0438: \u0441\u043c\u0435\u0449\u0435\u043d\u0438\u044f \u043f\u0435\u0440\u0435\u0447\u0438\u0441\u043b\u0435\u043d\u044b \u0432 \u0442\u0430\u0431\u043b\u0438\u0446\u0435 \u0441\u0442\u0438\u043b\u0435\u0439, \u0438 \u0437\u0430\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u043f\u043e\u043b\u043e\u0432\u0438\u043d\u0443 \u0448\u0438\u0440\u043e\u043a\u043e\u0433\u043e \u0440\u0435\u0435\u0441\u0442\u0440\u0430
  // \u0432\u0441\u0451 \u0440\u0430\u0432\u043d\u043e \u0437\u043d\u0430\u0447\u0438\u043b\u043e \u0431\u044b \u043d\u0435 \u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u043c\u0435\u0441\u0442\u0430 \u043f\u0440\u043e\u043a\u0440\u0443\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0439 \u0447\u0430\u0441\u0442\u0438.
  const frozen = Math.min(odFrozenCount(filterScope), 6, Math.max(columns.length - 1, 0));
  // \u041a\u043b\u0430\u0441\u0441 \u043d\u0430 \u0442\u0430\u0431\u043b\u0438\u0446\u0435, \u0430 \u043d\u0435 \u0441\u0435\u043b\u0435\u043a\u0442\u043e\u0440 :has(): \u0434\u0438\u0437\u0430\u0439\u043d-\u0441\u0438\u0441\u0442\u0435\u043c\u0430 \u0435\u0433\u043e \u0437\u0430\u043f\u0440\u0435\u0449\u0430\u0435\u0442, \u0430 \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043a\u043b\u0430\u0441\u0441 \u0438\u0437
  // \u0440\u0430\u043d\u0442\u0430\u0439\u043c\u0430 \u043c\u043e\u0436\u043d\u043e \u2014 \u0437\u0430\u043f\u0440\u0435\u0449\u0435\u043d\u0430 \u0441\u0442\u0438\u043b\u0438\u0437\u0430\u0446\u0438\u044f, \u043d\u0435 \u0440\u0430\u0437\u043c\u0435\u0442\u043a\u0430.
  if (frozen > 0) table.classList.add('od-table-frozen');
  columns.forEach((column, index) => {
    const cell = el('th', { rawText: column.label });
    if (index < frozen) cell.classList.add('od-frozen-column');
    if (index === frozen - 1) cell.classList.add('od-frozen-edge');
    head.append(cell);
  });
  thead.append(head);
  const tbody = el('tbody');
  rows.forEach(item => {
    const key = rowKey(item);
    const row = el('tr', { className: `od-table-row ${key === selectedKey ? 'selected' : ''}`.trim(), tabindex: '0' });
    const select = () => { OD_UI.selected[scope] = key; renderApp(); };
    row.addEventListener('click', select);
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
    });
    columns.forEach((column, index) => {
      const cell = el('td', { className: column.className || '' });
      if (index < frozen) cell.classList.add('od-frozen-column');
      if (index === frozen - 1) cell.classList.add('od-frozen-edge');
      // A column may shorten what it prints and keep the full value on the cell for hovering.
      if (typeof column.title === 'function') cell.title = String(column.title(item) ?? '');
      cell.append(odCell(column.render ? column.render(item) : column.value(item)));
      row.append(cell);
    });
    tbody.append(row);
  });
  table.append(thead, tbody);
  wrap.append(table);
  // "No data matches the filters" was printed whenever the table was empty, including on a tab a
  // person had just opened with nothing filtered — which sends them to clear a filter that is not
  // there. An empty register and a filter that excluded everything are different facts.
  if (!rows.length) wrap.append(el('div', { className: 'od-empty', rawText: odFilterIsActive(filterScope || scope)
    ? odText('\u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 \u043f\u043e \u0437\u0430\u0434\u0430\u043d\u043d\u044b\u043c \u0444\u0438\u043b\u044c\u0442\u0440\u0430\u043c', 'No data matches the filters')
    : odText('\u0417\u0434\u0435\u0441\u044c \u043f\u043e\u043a\u0430 \u043f\u0443\u0441\u0442\u043e', 'Nothing here yet') }));
  return { node: wrap, selected: rows.find(item => rowKey(item) === selectedKey) || rows[0] || null };
}

function odDefinitionGrid(fields) {
  const grid = el('dl', { className: 'od-definition-grid' });
  (fields || []).filter(field => field && field.label).forEach(field => {
    const item = el('div', { className: 'od-definition-item' });
    const value = el('dd', { rawText: odValue(field.value) || '\u2014' });
    // A shortened identifier stays readable while the full value remains available on hover.
    if (field.title) value.title = String(field.title);
    item.append(el('dt', { rawText: field.label }), value);
    grid.append(item);
  });
  return grid;
}

function odInspector({ title, subtitle = '', status = '', preview = false, tabs = [], fields = [], content = [], actions = [] }) {
  const node = el('aside', { className: 'od-inspector' });
  const head = el('div', { className: 'od-inspector-head' });
  const copy = el('div', { className: 'od-inspector-title' });
  copy.append(
    el('span', { className: 'od-inspector-kicker', rawText: odText('\u0414\u0435\u0442\u0430\u043b\u0438 \u043e\u0431\u044a\u0435\u043a\u0442\u0430', 'Object details') }),
    el('h3', { rawText: title || '\u2014' }),
    el('p', { rawText: subtitle || '' }),
  );
  head.append(copy);
  if (status) head.append(statusBadge(status));
  node.append(head);
  if (preview) node.append(odPreview(title, subtitle));
  // A tab is either a bare label or { label, fields, content }. A tab strip that switches nothing
  // is decoration, so the strip is rendered only when at least one tab carries a panel of its own.
  const tabList = tabs
    .map(tab => (tab && typeof tab === 'object' ? tab : { label: tab }))
    .filter(tab => tab && tab.label);
  const panelled = tabList.filter(tab => (tab.fields || []).length || (tab.content || []).length);
  if (fields.length) node.append(odDefinitionGrid(fields));
  content.filter(Boolean).forEach(item => node.append(item));
  if (panelled.length) {
    // Which tab was open survives a re-render. It did not before: the active tab lived only in the
    // DOM, so anything that redrew the workspace — a save, a refresh, picking another row — put the
    // reader back on the first tab. Filling in a field meant losing your place every time.
    //
    // The memory is keyed on the set of tab labels, which identifies the kind of inspector without
    // needing every caller to invent a name, and it survives moving between rows of the same
    // register, which is what a person expects.
    const tabKey = panelled.map(tab => tab.label).join('|');
    OD_UI.inspectorTab = OD_UI.inspectorTab || {};
    const remembered = OD_UI.inspectorTab[tabKey];
    const activeIndex = Number.isInteger(remembered) && remembered >= 0 && remembered < panelled.length ? remembered : 0;
    const nav = el('div', { className: 'od-inspector-tabs' });
    nav.setAttribute('role', 'tablist');
    const panels = [];
    panelled.forEach((tab, index) => {
      const panel = el('div', { className: 'od-inspector-panel' });
      if ((tab.fields || []).length) panel.append(odDefinitionGrid(tab.fields));
      (tab.content || []).filter(Boolean).forEach(item => panel.append(item));
      panel.hidden = index !== activeIndex;
      panels.push(panel);
      const button = el('button', { className: index === activeIndex ? 'active' : '', type: 'button', rawText: tab.label });
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
      button.addEventListener('click', () => {
        OD_UI.inspectorTab[tabKey] = index;
        panels.forEach((item, position) => { item.hidden = position !== index; });
        Array.from(nav.children).forEach((item, position) => {
          item.classList.toggle('active', position === index);
          item.setAttribute('aria-selected', position === index ? 'true' : 'false');
        });
      });
      nav.append(button);
    });
    node.append(nav);
    panels.forEach(panel => node.append(panel));
  }
  if (actions.filter(Boolean).length) {
    const footer = el('div', { className: 'od-inspector-actions' });
    actions.filter(Boolean).forEach(action => footer.append(action));
    node.append(footer);
  }
  return node;
}

// Какой реестр каким разделом рабочего пространства продолжается — одна таблица на весь интерфейс.
// Реестры со своим источником чтения (материалы, библиотеки, портал поставщика, сводка планирования)
// сюда не входят: их продолжает их собственный модуль, а не постраничное чтение рабочего стола.
const OD_REGISTRY_SECTIONS = Object.freeze({
  'od-campaigns': 'campaigns',
  'od-collections': 'collections',
  'od-sku': 'catalogSkus',
  'od-styles': 'productStyles',
  'od-line-plan': 'placeholders',
  'od-invitations': 'invitations',
  'od-partner-invitations': 'invitations',
  'od-cycles': 'cycles',
  'od-linesheets': 'showrooms',
  'od-roles': 'memberships',
  'od-relationships': 'relationships',
  'od-selections': 'selections',
  'od-orders': 'orders',
  'od-deals': 'deals',
  'od-calendar': 'calendar',
});

// Реестр, прочитанный наполовину, опаснее пустого: счётчик выглядит как итог, а фильтр и поиск
// честно работают — но по загруженному. Полоса говорит об этом прямо и даёт дочитать: страницу или
// всё. Она собрана из готовых элементов системы (`od-filter-chips`, `od-filter-chip`), поэтому не
// заводит нового слоя стилей и не сдвигает ключ кеша.
function odContinuation(scope, shown) {
  const section = OD_REGISTRY_SECTIONS[scope];
  const paging = window.SynthaWorkspaceController;
  if (!section || !paging?.hasMore(section)) return null;
  const status = paging.status(section);
  const strip = el('div', { className: 'od-filter-chips od-continuation' });
  strip.append(el('span', { className: 'muted', rawText: status.state === 'error'
    ? odText(`\u041f\u043e\u043a\u0430\u0437\u0430\u043d\u043e ${shown} \u2014 \u0434\u043e\u0447\u0438\u0442\u0430\u0442\u044c \u043e\u0441\u0442\u0430\u043b\u044c\u043d\u043e\u0435 \u043d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c.`, `Showing ${shown} — the rest could not be read.`)
    : odText(`\u041f\u043e\u043a\u0430\u0437\u0430\u043d\u043e ${shown} \u2014 \u0440\u0435\u0435\u0441\u0442\u0440 \u043f\u0440\u043e\u0447\u0438\u0442\u0430\u043d \u043d\u0435 \u0434\u043e \u043a\u043e\u043d\u0446\u0430. \u0424\u0438\u043b\u044c\u0442\u0440 \u0438 \u043f\u043e\u0438\u0441\u043a \u0438\u0434\u0443\u0442 \u043f\u043e \u043f\u0440\u043e\u0447\u0438\u0442\u0430\u043d\u043d\u043e\u043c\u0443.`, `Showing ${shown} — the register is not read to the end. Filter and search cover what is read.`) }));
  if (status.state === 'loading') {
    strip.append(el('span', { className: 'od-filter-chip', rawText: odText('\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026', 'Loading\u2026') }));
    return strip;
  }
  const more = el('button', { className: 'od-filter-chip', type: 'button', rawText: status.state === 'error'
    ? odText('\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c', 'Retry')
    : odText('\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0435\u0449\u0451', 'Load more') });
  more.addEventListener('click', () => { void paging.loadNext(section); });
  const all = el('button', { className: 'od-filter-chip clear', type: 'button', rawText: odText('\u0414\u043e\u0447\u0438\u0442\u0430\u0442\u044c \u0432\u0441\u0451', 'Read all') });
  all.addEventListener('click', () => { void paging.drain(section); });
  strip.append(more, all);
  return strip;
}

function odRegistry({ scope, rows, columns, inspector, filterScope = scope, rowKey, statusAccessor }) {
  // Remember what this registry is showing. The filter panel is built from the registry's own
  // columns and rows, so every registry gains attribute filtering without being configured for it.
  OD_UI.registry = OD_UI.registry || {};
  OD_UI.registry[filterScope] = { rows, columns, statusAccessor };
  const filtered = odFilter(rows, filterScope, statusAccessor);
  const table = odTable(scope, filtered, odVisibleColumns(filterScope, columns), rowKey, filterScope);
  const layout = el('section', { className: 'od-master-detail' });
  const master = el('div', { className: 'od-master' });
  const crumbs = odHierarchyCrumbs(filterScope);
  if (crumbs) master.append(crumbs);
  const chips = odFilterChips(filterScope);
  if (chips) master.append(chips);
  const continuation = odContinuation(scope, filtered.length);
  if (continuation) master.append(continuation);
  if (OD_UI.filterPanel === filterScope) master.append(odFilterPanel(filterScope));
  if (OD_UI.columnPanel === filterScope) master.append(odColumnPanel(filterScope));
  if (OD_UI.hierarchyPanel === filterScope) master.append(odHierarchyPanel(filterScope));
  master.append(table.node);
  layout.append(master, table.selected ? inspector(table.selected) : odInspector({ title: odText('\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u0430\u043f\u0438\u0441\u044c', 'Select a record') }));
  return layout;
}

function odMiniTable(headers, rows) {
  const wrap = el('div', { className: 'od-mini-table-wrap' });
  const table = el('table', { className: 'od-mini-table' });
  const thead = el('thead');
  const head = el('tr');
  headers.forEach(header => head.append(el('th', { rawText: header })));
  thead.append(head);
  const tbody = el('tbody');
  rows.forEach(values => {
    const row = el('tr');
    values.forEach(value => { const cell = el('td'); cell.append(odCell(value)); row.append(cell); });
    tbody.append(row);
  });
  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

function odSection(title, child, count) {
  const node = el('section', { className: 'od-section' });
  const head = el('div', { className: 'od-section-head' });
  head.append(el('h3', { rawText: title }));
  if (count !== undefined) head.append(el('span', { className: 'section-count', rawText: String(count) }));
  node.append(head, child);
  return node;
}

function odPage(title, header, content) {
  const node = el('div', { className: 'od-view' });
  node.append(toolbar(title));
  // Заголовка может не быть: экраны справочников и портала поставщика намеренно передают сюда
  // `null` **на пути ошибки** — когда данные не пришли и шапку строить не из чего. Безусловное
  // разыменование давало TypeError и белый экран ровно в том сценарии, ради которого этот код и
  // написан: пользователь вместо сообщения об ошибке получал пустоту.
  if (header && header.fragment) node.append(header.fragment);
  if (content) node.append(content);
  return node;
}

function odProgress(stage) {
  const index = Math.max(0, STAGES.indexOf(stage));
  const node = el('div', { className: 'od-progress' });
  STAGES.forEach((item, position) => node.append(el('span', {
    className: position < index ? 'done' : position === index ? 'current' : '',
    title: stageLabel(item),
    rawText: String(position + 1),
  })));
  return node;
}

function odCampaignAction(item) {
  const caps = window.SynthaUiCapabilities;
  return item.status === 'draft' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.CAMPAIGN_MANAGE)
    ? actionButton(odText('\u041e\u0442\u043a\u0440\u044b\u0442\u044c', 'Open'), () => mutate(`/v2/campaigns/${encodeURIComponent(item.id)}/open`, {}), 'primary')
    : null;
}

function odCollectionAction(item) {
  const caps = window.SynthaUiCapabilities;
  const campaign = state.workspace.campaigns.find(candidate => candidate.id === item.campaignId);
  const manage = caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.COLLECTION_MANAGE);
  if (item.status !== 'draft' || !manage) return null;
  if (campaign?.status === 'open') {
    return actionButton(odText('\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c', 'Publish'), () => mutate(`/v2/collections/${encodeURIComponent(item.id)}/publish`, {}), 'primary');
  }
  // The season opens before anything inside it can be published. Saying so turns a missing button
  // into the next step; leaving it out left a reader with a draft they could not move.
  return el('p', { className: 'od-action-note', rawText: odText(
    `\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u043e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e \u00ab${campaign?.name || '\u2014'}\u00bb \u2014 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f \u043f\u0443\u0431\u043b\u0438\u043a\u0443\u0435\u0442\u0441\u044f \u0432\u043d\u0443\u0442\u0440\u0438 \u043e\u0442\u043a\u0440\u044b\u0442\u043e\u0433\u043e \u0441\u0435\u0437\u043e\u043d\u0430.`,
    `Open the "${campaign?.name || '\u2014'}" campaign first \u2014 a collection is published inside an open season.`,
  ) });
}

// Публикация самой коллекции и публикация её коммерческого снимка — два разных решения об одной
// сущности, поэтому они стоят рядом и по порядку: снимок требует уже опубликованной коллекции.
function odCollectionSnapshotAction(item) {
  const commercial = window.SynthaCommercialPublication;
  return commercial?.collectionAction ? commercial.collectionAction(item) : null;
}

function odSkuActions(item) {
  const caps = window.SynthaUiCapabilities;
  const collection = state.workspace.collections.find(candidate => candidate.id === item.collectionId);
  const canManage = item.status === 'draft' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.CATALOG_MANAGE);
  const actions = [];
  if (canManage && typeof catalogEditActionButton === 'function') actions.push(catalogEditActionButton(item));
  if (canManage && collection?.status === 'published') actions.push(actionButton(
    odText('\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c', 'Publish'),
    () => mutate(`/v2/catalog/skus/${encodeURIComponent(item.sku)}/publish`, { expectedVersion: item.version }),
    'primary',
  ));
  // A SKU cannot be published before its collection is, which is right — but the button simply was
  // not there, and a reader who had just created a SKU was left looking at «Редактировать» with no
  // idea what came next. An absent control has to say why it is absent.
  if (canManage && collection && collection.status !== 'published') {
    actions.push(el('p', { className: 'od-action-note', rawText: odText(
      `\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u0443\u0439\u0442\u0435 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044e \u00ab${collection.name}\u00bb \u2014 \u0430\u0440\u0442\u0438\u043a\u0443\u043b \u043f\u0443\u0431\u043b\u0438\u043a\u0443\u0435\u0442\u0441\u044f \u0432\u043d\u0443\u0442\u0440\u0438 \u043d\u0435\u0451.`,
      `Publish the "${collection.name}" collection first \u2014 a SKU is published inside one.`,
    ) }));
  }
  return actions;
}

// The presentation a buyer will be shown. Composed here, beside the showroom it belongs to, because
// a showroom and what it shows are one decision.
function odShowroomLooks(item) {
  const looks = window.SynthaShowroomLooks;
  if (!looks?.panel) return null;
  const caps = window.SynthaUiCapabilities;
  const manage = caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.SHOWROOM_MANAGE);
  return looks.panel(item, { manage });
}

// The two tabs beside the presentation used to be labels that switched nothing — a strip of words
// pretending to be navigation. They carry what they are named after now.
function odShowroomProducts(item) {
  const rows = (state.workspace.catalogSkus || []).filter(candidate => candidate.collectionId === item.collectionId);
  if (!rows.length) return notice(odText('\u0412 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438 \u044d\u0442\u043e\u0433\u043e \u0448\u043e\u0443\u0440\u0443\u043c\u0430 \u0435\u0449\u0451 \u043d\u0435\u0442 \u0442\u043e\u0432\u0430\u0440\u043e\u0432.', 'The collection this showroom presents has no products yet.'));
  return odMiniTable(
    ['SKU', odText('\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435', 'Name'), odText('\u0426\u0435\u043d\u0430', 'Price'), odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status')],
    rows.map(sku => [sku.sku, sku.name || '\u2014', `${money(sku.wholesalePrice)} ${sku.currency || ''}`.trim(), statusLabel(sku.status)]),
  );
}

function odShowroomAccess(item) {
  const rows = (state.workspace.invitations || []).filter(candidate => candidate.showroomId === item.id);
  const commercial = window.SynthaCommercialPublication;
  if (!rows.length) return notice(odText('\u0428\u043e\u0443\u0440\u0443\u043c \u043d\u0438\u043a\u043e\u043c\u0443 \u043d\u0435 \u043e\u0442\u043a\u0440\u044b\u0442. \u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0451\u043d\u043d\u044b\u0439 \u043c\u0430\u0433\u0430\u0437\u0438\u043d \u0443\u0432\u0438\u0434\u0438\u0442 \u043f\u043e\u043a\u0430\u0437 \u0438 \u0441\u043c\u043e\u0436\u0435\u0442 \u0441\u043e\u0431\u0440\u0430\u0442\u044c \u0437\u0430\u043a\u0430\u0437.', 'Nobody has been invited. An invited shop sees the presentation and can build an order from it.'));
  // Каталог приходит отдельным чтением на каждый доступ; строка рисуется сразу, а пришедшее
  // значение перерисовывает экран — ждать ради одной колонки значило бы держать пустыми остальные.
  const redraw = () => { if (state.view === 'showrooms') renderApp(); };
  const table = odMiniTable(
    [odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), odText('\u0414\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0434\u043e', 'Expires'), odText('\u041a\u0430\u0442\u0430\u043b\u043e\u0433 \u0431\u0430\u0439\u0435\u0440\u0430', 'Buyer catalogue')],
    rows.map(invitation => [
      orgName(invitation.shopId),
      statusLabel(invitation.status),
      formatDate(invitation.expiresAt),
      commercial?.catalogCell ? commercial.catalogCell(item, invitation, { onLoaded: redraw }) : '\u2014',
    ]),
  );
  const action = commercial?.accessAction ? commercial.accessAction(item) : null;
  if (!action) return table;
  const group = el('div', { className: 'od-access-panel' });
  group.append(table, action);
  return group;
}

function odShowroomActions(item) {
  const caps = window.SynthaUiCapabilities;
  const actions = [];
  if (item.status === 'draft' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.SHOWROOM_MANAGE)) actions.push(actionButton(odText('\u041e\u0442\u043a\u0440\u044b\u0442\u044c', 'Open'), () => mutate(`/v2/showrooms/${encodeURIComponent(item.id)}/open`, {}), 'primary'));
  if (item.status === 'open' && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.SHOWROOM_INVITATION_MANAGE)) actions.push(actionButton(odText('\u041f\u0440\u0438\u0433\u043b\u0430\u0441\u0438\u0442\u044c', 'Invite'), () => invitationForm(item)));
  return actions;
}

function odRelationshipActions(item) {
  const caps = window.SynthaUiCapabilities;
  const actions = [];
  const responderId = counterpartyResponder(item);
  if (item.status === 'pending' && caps.hasForOrganisation(state.workspace, responderId, caps.CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE)) actions.push(
    actionButton(odText('\u041f\u0440\u0438\u043d\u044f\u0442\u044c', 'Accept'), () => mutate(`/v2/relationships/${encodeURIComponent(item.id)}/accept`, {}), 'primary'),
    actionButton(odText('\u041e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c', 'Reject'), () => mutate(`/v2/relationships/${encodeURIComponent(item.id)}/reject`, {}), 'danger'),
  );
  if (item.status === 'active' && caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE)) actions.push(actionButton(odText('\u041e\u0442\u043e\u0437\u0432\u0430\u0442\u044c', 'Revoke'), () => mutate(`/v2/relationships/${encodeURIComponent(item.id)}/revoke`, {}), 'danger'));
  return actions;
}

function odInvitationActions(item) {
  const caps = window.SynthaUiCapabilities;
  const actions = [];
  if (item.status === 'pending' && caps.hasForOrganisation(state.workspace, item.shopId, caps.CAPABILITIES.SHOWROOM_INVITATION_ACCEPT)) actions.push(
    actionButton(odText('\u041f\u0440\u0438\u043d\u044f\u0442\u044c', 'Accept'), () => mutate(`/v2/invitations/${encodeURIComponent(item.id)}/accept`, {}), 'primary'),
    actionButton(odText('\u041e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c', 'Decline'), () => mutate(`/v2/invitations/${encodeURIComponent(item.id)}/decline`, {}), 'danger'),
  );
  if (['pending', 'accepted'].includes(item.status) && caps.hasForOrganisation(state.workspace, item.brandId, caps.CAPABILITIES.SHOWROOM_INVITATION_MANAGE)) actions.push(actionButton(odText('\u041e\u0442\u043e\u0437\u0432\u0430\u0442\u044c', 'Revoke'), () => mutate(`/v2/invitations/${encodeURIComponent(item.id)}/revoke`, {}), 'danger'));
  return actions;
}

function odSelectionActions(item) {
  const caps = window.SynthaUiCapabilities;
  const actions = [];
  const lines = odList(item.lines);
  const canWrite = caps.hasForOrganisation(state.workspace, item.shopId, caps.CAPABILITIES.SELECTION_WRITE);
  if (item.status === 'draft' && canWrite) {
    actions.push(actionButton(odText('\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c SKU', 'Add SKU'), () => selectionLineForm(item)));
    if (lines.length) actions.push(actionButton(odText('\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c', 'Submit'), () => mutate(`/v2/selections/${encodeURIComponent(item.id)}/submit`, {}), 'primary'));
  }
  return actions;
}

function odOrderActions(item) {
  const caps = window.SynthaUiCapabilities;
  const actions = [];
  const accepted = new Set(odList(item.acceptedOrganisationIds));
  ownIds().filter(id => [item.brandId, item.shopId].includes(id)).forEach(orgId => {
    if (!accepted.has(orgId) && ['draft', 'ready'].includes(item.status) && caps.hasForOrganisation(state.workspace, orgId, caps.CAPABILITIES.ORDER_CONFIRM)) actions.push(actionButton(`${odText('\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u0442\u044c', 'Approve')}: ${orgName(orgId)}`, () => mutate(`/v2/orders/${encodeURIComponent(item.id)}/accept`, { organisationId: orgId }), 'primary'));
  });
  const canWrite = caps.hasForTrade(state.workspace, item.brandId, item.shopId, caps.CAPABILITIES.ORDER_WRITE);
  if (item.status === 'ready' && canWrite) actions.push(actionButton(odText('\u041f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u043a \u0446\u0438\u043a\u043b\u0443', 'Attach to cycle'), () => mutate(`/v2/orders/${encodeURIComponent(item.id)}/attach`, {}), 'primary'));
  if (item.status === 'attached' && canWrite) actions.push(actionButton(odText('\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u0437\u0430\u043a\u0430\u0437', 'Cancel order'), () => orderCancellationForm(item), 'danger'));
  return actions;
}

function odHistory(title, rows) {
  return odSection(title, odMiniTable([
    odText('\u041e\u0431\u044a\u0435\u043a\u0442', 'Object'),
    odText('\u0422\u0438\u043f', 'Type'),
    odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'),
    odText('\u0414\u0430\u0442\u0430', 'Date'),
  ], rows), rows.length);
}

function renderOverview() {
  const w = state.workspace;
  const header = odHeader('overview', [
    { id: 'workspace', label: odText('\u0420\u0430\u0431\u043e\u0447\u0438\u0439 \u0441\u0442\u043e\u043b', 'Workspace') },
    { id: 'processes', label: odText('\u041a\u0430\u0440\u0442\u0430 \u043f\u0440\u043e\u0446\u0435\u0441\u0441\u043e\u0432', 'Process map') },
    { id: 'risks', label: odText('\u0420\u0438\u0441\u043a\u0438 \u0438 \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044c', 'Risks and control') },
    { id: 'activity', label: odText('\u0410\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u044c', 'Activity') },
  ], [
    { label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collections'), value: w.collections.length, detail: `${w.campaigns.length} ${odText('\u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0439', 'campaigns')}` },
    { label: 'SKU', value: w.catalogSkus.length, detail: `${w.catalogSkus.filter(item => item.status === 'published').length} ${odText('\u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043e', 'published')}` },
    { label: 'Linesheets', value: w.showrooms.length, detail: `${w.showrooms.filter(item => item.status === 'open').length} ${odText('\u043e\u0442\u043a\u0440\u044b\u0442\u043e', 'open')}` },
    { label: odText('\u0417\u0430\u043a\u0430\u0437\u044b', 'Orders'), value: w.orders.length, detail: `${w.orders.filter(item => ['draft', 'ready'].includes(item.status)).length} ${odText('\u0442\u0440\u0435\u0431\u0443\u044e\u0442 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f', 'need action')}` },
    { label: odText('\u041f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e \u0441\u0434\u0435\u043b\u043a\u0438', 'Deal space'), value: w.deals.length, detail: odText('\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043d\u044b\u0435 \u0441\u0434\u0435\u043b\u043a\u0438', 'confirmed deals') },
  ], [], null);
  if (header.active === 'risks') {
    const grid = el('section', { className: 'od-risk-grid' });
    [[odText('\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u0438 SKU', 'Draft SKUs'), w.catalogSkus.filter(item => item.status === 'draft').length], [odText('\u041d\u0438\u0437\u043a\u0438\u0439 ATS', 'Low ATS'), w.catalogSkus.filter(item => Number(item.availableToSell ?? item.availableQuantity ?? 0) <= Number(item.minimumOrderQuantity || 1)).length], [odText('\u041d\u0435\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043d\u044b\u0435 \u0437\u0430\u043a\u0430\u0437\u044b', 'Unconfirmed orders'), w.orders.filter(item => ['draft', 'ready'].includes(item.status)).length], [odText('\u041e\u0436\u0438\u0434\u0430\u044e\u0449\u0438\u0435 \u043f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f', 'Pending invitations'), w.invitations.filter(item => item.status === 'pending').length]].forEach(([label, value]) => grid.append(odMetric(label, value, value ? odText('\u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044f', 'needs control') : odText('\u043e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u0438\u0439 \u043d\u0435\u0442', 'no exceptions'), value ? 'warning' : 'success')));
    return odPage(odText('\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u0446\u0435\u043d\u0442\u0440 Syntha', 'Syntha operating center'), header, grid);
  }
  if (header.active === 'activity') {
    const rows = [...w.orders.map(item => [objectReference(item.id), odText('\u0417\u0430\u043a\u0430\u0437', 'Order'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)]), ...w.showrooms.map(item => [item.name, odText('\u0428\u043e\u0443\u0440\u0443\u043c', 'Showroom'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)]), ...w.relationships.map(item => [pairName(item.brandId, item.shopId), odText('\u041f\u0430\u0440\u0442\u043d\u0435\u0440\u0441\u0442\u0432\u043e', 'Partnership'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)])].slice(0, 30);
    return odPage(odText('\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u0446\u0435\u043d\u0442\u0440 Syntha', 'Syntha operating center'), header, odSection(odText('\u041b\u0435\u043d\u0442\u0430 \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u0438', 'Activity feed'), odMiniTable([odText('\u041e\u0431\u044a\u0435\u043a\u0442', 'Object'), odText('\u0422\u0438\u043f', 'Type'), odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), odText('\u0414\u0430\u0442\u0430', 'Date')], rows), rows.length));
  }
  const board = el('section', { className: `od-process-board ${header.active === 'processes' ? 'expanded' : ''}`.trim() });
  const process = (number, title, subtitle, values, tone) => { const card = el('article', { className: `od-process-card ${tone}`.trim() }); card.append(el('span', { className: 'od-process-number', rawText: number }), el('h3', { rawText: title }), el('p', { rawText: subtitle })); const list = el('div', { className: 'od-process-list' }); values.forEach(([label, value]) => { const row = el('div'); row.append(el('span', { rawText: label }), el('strong', { rawText: String(value) })); list.append(row); }); card.append(list); return card; };
  board.append(process('1', odText('\u0420\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0430 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430', 'Product development'), odText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f \u2192 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f \u2192 SKU', 'Campaign to collection to SKU'), [[odText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438', 'Campaigns'), w.campaigns.length], [odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collections'), w.collections.length], ['SKU', w.catalogSkus.length]], 'product'), process('2', odText('\u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u043e \u0438 \u043f\u043e\u0441\u0442\u0430\u0432\u043a\u0438', 'Production and supply'), odText('\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c \u0441\u0440\u043e\u043a\u043e\u0432 \u0438 \u044d\u0442\u0430\u043f\u043e\u0432', 'Deadlines and milestones'), [[odText('\u0421\u043e\u0431\u044b\u0442\u0438\u044f', 'Events'), w.calendar.length], [odText('\u041e\u0442\u043a\u0440\u044b\u0442\u044b\u0435 \u0446\u0438\u043a\u043b\u044b', 'Open cycles'), w.cycles.filter(item => item.stage !== 'deal-space').length], [odText('\u0421\u0434\u0435\u043b\u043a\u0438', 'Deals'), w.deals.length]], 'supply'), process('3', odText('\u041e\u043f\u0442\u043e\u0432\u0430\u044f \u043a\u043e\u043c\u043c\u0435\u0440\u0446\u0438\u044f', 'Wholesale commerce'), odText('\u041b\u0438\u0441\u0442 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438 \u2192 \u0430\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442 \u2192 \u0437\u0430\u043a\u0430\u0437 \u2192 \u0441\u0434\u0435\u043b\u043a\u0430', 'Linesheet to selection to order to deal'), [[odText('\u041b\u0438\u0441\u0442\u044b \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0439', 'Linesheets'), w.showrooms.length], [odText('\u0410\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442\u044b', 'Selections'), w.selections.length], [odText('\u0417\u0430\u043a\u0430\u0437\u044b', 'Orders'), w.orders.length], [odText('\u0421\u0434\u0435\u043b\u043a\u0438', 'Deals'), w.deals.length]], 'wholesale'));
  if (header.active === 'processes') return odPage(odText('\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u0446\u0435\u043d\u0442\u0440 Syntha', 'Syntha operating center'), header, board);
  const lower = el('section', { className: 'od-dashboard-grid' });
  lower.append(odSection(odText('\u0411\u043b\u0438\u0436\u0430\u0439\u0448\u0438\u0435 \u0441\u043e\u0431\u044b\u0442\u0438\u044f', 'Upcoming events'), odMiniTable([odText('\u0421\u043e\u0431\u044b\u0442\u0438\u0435', 'Event'), odText('\u0414\u0430\u0442\u0430', 'Date'), odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status')], [...w.calendar].sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt))).slice(0, 6).map(item => [humaniseIdentifiers(item.title || item.type), formatDate(item.startsAt), statusBadge(item.visibility || item.type)])), w.calendar.length), odSection(odText('\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f', 'Recent notifications'), odMiniTable([odText('\u0422\u0435\u043c\u0430', 'Subject'), odText('\u0414\u0430\u0442\u0430', 'Date'), odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status')], state.notifications.slice(0, 6).map(item => [notificationTitle(item), formatDate(item.createdAt), statusBadge(item.status)])), state.notifications.length));
  const content = el('div'); content.append(board, lower);
  return odPage(odText('\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u0446\u0435\u043d\u0442\u0440 Syntha', 'Syntha operating center'), header, content);
}

function renderCatalog() {
  const w = state.workspace;
  const caps = window.SynthaUiCapabilities;
  const tab = OD_UI.tabs.catalog || 'sku';
  let action = null;
  if (tab === 'sku' && caps.hasAny(w, caps.CAPABILITIES.CATALOG_MANAGE, 'brand') && w.collections.length) action = odAction(odText('\u0421\u043e\u0437\u0434\u0430\u0442\u044c SKU', 'Create SKU'), catalogSkuForm);
  if (tab === 'campaigns' && caps.hasAny(w, caps.CAPABILITIES.CAMPAIGN_MANAGE, 'brand')) action = odAction(odText('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e', 'Create campaign'), campaignForm);
  if (tab === 'collections' && caps.hasAny(w, caps.CAPABILITIES.COLLECTION_MANAGE, 'brand') && w.campaigns.length) action = odAction(odText('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044e', 'Create collection'), collectionForm);
  const header = odHeader('catalog', [{ id: 'sku', label: odText('\u0410\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442', 'Assortment') }, { id: 'campaigns', label: odText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u0438', 'Campaigns') }, { id: 'collections', label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collections') }, { id: 'history', label: odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0439', 'Change history') }], [{ label: 'SKU', value: w.catalogSkus.length, detail: odText('\u0432\u0441\u0435\u0433\u043e', 'total') }, { label: odText('\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043e', 'Published'), value: w.catalogSkus.filter(item => item.status === 'published').length, detail: odText('\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e \u043f\u0430\u0440\u0442\u043d\u0435\u0440\u0430\u043c', 'available to partners') }, { label: odText('\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u0438', 'Drafts'), value: w.catalogSkus.filter(item => item.status === 'draft').length, detail: odText('\u0442\u0440\u0435\u0431\u0443\u044e\u0442 \u043f\u0443\u0431\u043b\u0438\u043a\u0430\u0446\u0438\u0438', 'need publication') }, { label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collections'), value: w.collections.length, detail: `${w.campaigns.length} ${odText('\u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0439', 'campaigns')}` }, { label: odText('\u041d\u0438\u0437\u043a\u0438\u0439 ATS', 'Low ATS'), value: w.catalogSkus.filter(item => Number(item.availableToSell ?? item.availableQuantity ?? 0) <= Number(item.minimumOrderQuantity || 1)).length, detail: odText('\u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044c \u043e\u0441\u0442\u0430\u0442\u043a\u043e\u0432', 'stock control') }], ['draft', 'published', 'open', 'closed'], odText('\u041f\u043e\u0438\u0441\u043a SKU, \u043c\u043e\u0434\u0435\u043b\u0438 \u0438\u043b\u0438 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Search SKU, model or collection'), action);
  if (header.active === 'history') return odPage(odText('\u041a\u0430\u0442\u0430\u043b\u043e\u0433 \u0438 \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0430 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430', 'Catalog and product development'), header, odHistory(odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0439', 'Change history'), [...w.catalogSkus.map(item => [item.name, 'SKU', statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)]), ...w.collections.map(item => [item.name, odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)]), ...w.campaigns.map(item => [item.name, odText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f', 'Campaign'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)])]));
  if (header.active === 'campaigns') return odPage(odText('\u041a\u0430\u0442\u0430\u043b\u043e\u0433 \u0438 \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0430 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430', 'Catalog and product development'), header, odRegistry({ scope: 'od-campaigns', filterScope: 'catalog', rows: w.campaigns, columns: [{ label: odText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f', 'Campaign'), value: item => item.name }, { label: odText('\u0421\u0435\u0437\u043e\u043d', 'Season'), value: item => item.season }, { label: odText('\u041f\u0435\u0440\u0438\u043e\u0434', 'Period'), value: item => `${formatDate(item.startsAt)} - ${formatDate(item.endsAt)}` }, { label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collections'), value: item => w.collections.filter(candidate => candidate.campaignId === item.id).length }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }], inspector: item => odInspector({ title: item.name, subtitle: item.season, status: item.status, tabs: [odText('\u041e\u0431\u0437\u043e\u0440', 'Overview'), odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Collections'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u0421\u0435\u0437\u043e\u043d', 'Season'), value: item.season }, { label: odText('\u041d\u0430\u0447\u0430\u043b\u043e', 'Starts'), value: formatDate(item.startsAt) }, { label: odText('\u041e\u043a\u043e\u043d\u0447\u0430\u043d\u0438\u0435', 'Ends'), value: formatDate(item.endsAt) }], actions: [odCampaignAction(item)] }) }));
  if (header.active === 'collections') return odPage(odText('\u041a\u0430\u0442\u0430\u043b\u043e\u0433 \u0438 \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0430 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430', 'Catalog and product development'), header, odRegistry({ scope: 'od-collections', filterScope: 'catalog', rows: w.collections, columns: [{ label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'), value: item => item.name }, { label: odText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f', 'Campaign'), value: item => nameById('campaigns', item.campaignId) }, { label: odText('\u0412\u0430\u043b\u044e\u0442\u0430', 'Currency'), value: item => item.currency }, { label: 'SKU', value: item => w.catalogSkus.filter(candidate => candidate.collectionId === item.id).length }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }], inspector: item => odInspector({ title: item.name, subtitle: nameById('campaigns', item.campaignId), status: item.status, tabs: [odText('\u041e\u0431\u0437\u043e\u0440', 'Overview'), 'SKU', odText('\u0426\u0435\u043d\u044b', 'Pricing')], fields: [{ label: odText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f', 'Campaign'), value: nameById('campaigns', item.campaignId) }, { label: odText('\u0412\u0430\u043b\u044e\u0442\u0430', 'Currency'), value: item.currency }, { label: 'SKU', value: w.catalogSkus.filter(candidate => candidate.collectionId === item.id).length }], actions: [odCollectionAction(item), odCollectionSnapshotAction(item)] }) }));
  return odPage(odText('\u041a\u0430\u0442\u0430\u043b\u043e\u0433 \u0438 \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0430 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430', 'Catalog and product development'), header, odRegistry({ scope: 'od-sku', filterScope: 'catalog', rows: w.catalogSkus, rowKey: item => item.sku, columns: [{ label: '', className: 'od-thumb-cell', render: item => odPreview(item.name, item.sku) }, { label: 'SKU', value: item => item.sku }, { label: odText('\u041c\u043e\u0434\u0435\u043b\u044c', 'Model'), value: item => item.name }, { label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'), value: item => nameById('collections', item.collectionId) }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }, { label: odText('\u041e\u043f\u0442. \u0446\u0435\u043d\u0430', 'Wholesale'), value: item => `${money(item.wholesalePrice, item.currency)}` }, { label: 'MOQ', value: item => item.minimumOrderQuantity || 1 }, { label: 'ATS', value: item => Number.isInteger(item.availableToSell) ? item.availableToSell : Math.max(0, Number(item.availableQuantity || 0) - Number(item.reservedQuantity || 0)) }], inspector: item => odInspector({ title: item.name, subtitle: item.sku, status: item.status, preview: true, tabs: [odText('\u041e\u0431\u0437\u043e\u0440', 'Overview'), odText('\u0426\u0435\u043d\u044b', 'Prices'), odText('\u041e\u0441\u0442\u0430\u0442\u043a\u0438', 'Availability'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: 'SKU', value: item.sku }, { label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'), value: nameById('collections', item.collectionId) }, { label: odText('\u041e\u043f\u0442\u043e\u0432\u0430\u044f \u0446\u0435\u043d\u0430', 'Wholesale price'), value: `${money(item.wholesalePrice, item.currency)}` }, { label: 'MOQ', value: item.minimumOrderQuantity || 1 }, { label: odText('\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e', 'Available'), value: item.availableQuantity || 0 }, { label: odText('\u0417\u0430\u0440\u0435\u0437\u0435\u0440\u0432\u0438\u0440\u043e\u0432\u0430\u043d\u043e', 'Reserved'), value: item.reservedQuantity || 0 }, { label: odText('\u0412\u0435\u0440\u0441\u0438\u044f', 'Version'), value: item.version || 1 }], actions: odSkuActions(item) }) }));
}

// Действие этого экрана и объяснение, когда его нет.
//
// Кнопка «Начать цикл» стояла в том же слоте, что «Создать шоурум», и выбиралась через else —
// найдено живым обходом: на вкладке циклов кнопки не было, и это оказалось верно (связь с
// контрагентом была отозвана), но экран об этом молчал. Отсутствующий орган управления обязан
// сказать, почему он отсутствует, иначе человек считает молчание поломкой.
//
// Цикл требует трёх вещей сразу: действующей связи с контрагентом, открытой кампании и
// опубликованной коллекции внутри неё. Названа та, которой не хватает первой, — общая фраза
// «что-то не готово» заставляла бы искать самому.
function odShowroomHeaderAction(w, caps, tab, canCreate) {
  if (tab === 'linesheets') return canCreate ? odAction(odText('Создать шоурум', 'Create showroom'), showroomForm) : null;
  if (tab !== 'cycles') return null;
  const organisationIds = caps.organisationIds(w, caps.CAPABILITIES.COMMERCIAL_CYCLE_CREATE);
  if (!organisationIds.length) return null;
  const contexts = window.SynthaWorkflowContexts
    ? window.SynthaWorkflowContexts.buildCycleContexts(w, organisationIds)
    : [];
  if (contexts.some((context) => caps.hasForTrade(w, context.brandId, context.shopId, caps.CAPABILITIES.COMMERCIAL_CYCLE_CREATE))) {
    return odAction(odText('Начать цикл', 'Start a cycle'), cycleForm);
  }
  return el('p', { className: 'od-action-note', rawText: odCycleBlocker(w) });
}

function odCycleBlocker(w) {
  const relationships = (w.relationships || []).filter(item => item.status === 'active');
  if (!relationships.length) {
    return odText(
      'Цикл начинают с контрагентом — действующей связи ни с одним магазином сейчас нет. Свяжитесь на экране «Контрагенты и доступы».',
      'A cycle is started with a counterparty — there is no active relationship with any shop. Establish one on the “Partners and access” screen.',
    );
  }
  const brandIds = new Set(relationships.map(item => item.brandId));
  const campaigns = (w.campaigns || []).filter(item => item.status === 'open' && brandIds.has(item.brandId));
  if (!campaigns.length) {
    return odText(
      'Цикл идёт внутри открытого сезона — открытых кампаний у этих брендов нет.',
      'A cycle runs inside an open season — these brands have no open campaign.',
    );
  }
  const campaignIds = new Set(campaigns.map(item => item.id));
  if (!(w.collections || []).some(item => item.status === 'published' && campaignIds.has(item.campaignId))) {
    return odText(
      'В открытых кампаниях нет опубликованной коллекции — публикуется она на экране «Коллекции».',
      'The open campaigns hold no published collection — a collection is published on the “Collections” screen.',
    );
  }
  return odText(
    'Начать цикл сейчас не с чем: нужна действующая связь, открытая кампания и опубликованная коллекция в ней.',
    'There is nothing to start a cycle from: an active relationship, an open campaign and a published collection inside it are all required.',
  );
}

function renderShowrooms() {
  const w = state.workspace;
  const caps = window.SynthaUiCapabilities;
  const tab = OD_UI.tabs.showrooms || 'linesheets';
  const canCreate = tab === 'linesheets' && caps.hasAny(w, caps.CAPABILITIES.SHOWROOM_MANAGE, 'brand') && w.collections.some(item => item.status === 'published');
  // Коммерческий цикл — костяк оптового потока: без него нет ни ассортимента, ни заказа. Форма
  // `cycleForm` написана и была подключена только в `showrooms.js`, а этот экран перекрыт
  // рендерером ОДС — значит начать цикл из живого интерфейса было **нечем**. Найдено живым
  // обходом: на вкладке «Коммерческие циклы» ни одной кнопки, ни у владельца, ни у байера.
  //
  // Действие выбирается по вкладке, как в каталоге, и закрыто тем же правом, каким было закрыто
  // в перекрытом экране: цикл начинают там, где смотрят на циклы.
  const header = odHeader('showrooms', [{ id: 'linesheets', label: odText('\u0428\u043e\u0443\u0440\u0443\u043c\u044b', 'Showrooms') }, { id: 'invitations', label: odText('\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f', 'Invitations') }, { id: 'cycles', label: odText('\u041a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0435 \u0446\u0438\u043a\u043b\u044b', 'Commercial cycles') }, { id: 'history', label: odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History') }], [{ label: odText('\u0428\u043e\u0443\u0440\u0443\u043c\u044b', 'Showrooms'), value: w.showrooms.length, detail: odText('\u0432\u0441\u0435\u0433\u043e', 'total') }, { label: odText('\u041e\u0442\u043a\u0440\u044b\u0442\u043e', 'Open'), value: w.showrooms.filter(item => item.status === 'open').length, detail: odText('\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e \u0431\u0430\u0439\u0435\u0440\u0430\u043c', 'available to buyers') }, { label: odText('\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u0438', 'Drafts'), value: w.showrooms.filter(item => item.status === 'draft').length, detail: odText('\u043d\u0435 \u043e\u0442\u043a\u0440\u044b\u0442\u044b', 'not open') }, { label: odText('\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f', 'Invitations'), value: w.invitations.length, detail: `${w.invitations.filter(item => item.status === 'pending').length} ${odText('\u043e\u0436\u0438\u0434\u0430\u044e\u0442', 'pending')}` }, { label: odText('\u0426\u0438\u043a\u043b\u044b', 'Cycles'), value: w.cycles.length, detail: `${w.cycles.filter(item => item.stage !== 'deal-space').length} ${odText('\u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445', 'active')}` }], ['draft', 'open', 'pending', 'accepted'], odText('\u041f\u043e\u0438\u0441\u043a \u0448\u043e\u0443\u0440\u0443\u043c\u0430, \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430 \u0438\u043b\u0438 \u0446\u0438\u043a\u043b\u0430', 'Search showroom, shop or cycle'), odShowroomHeaderAction(w, caps, tab, canCreate));
  if (header.active === 'history') return odPage(odText('\u041e\u043f\u0442\u043e\u0432\u044b\u0439 \u0448\u043e\u0443\u0440\u0443\u043c', 'Wholesale showroom'), header, odHistory(odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u043e\u043f\u0442\u043e\u0432\u043e\u0439 \u0440\u0430\u0431\u043e\u0442\u044b', 'Wholesale history'), [...w.showrooms.map(item => [item.name, odText('\u0428\u043e\u0443\u0440\u0443\u043c', 'Showroom'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)]), ...w.invitations.map(item => [orgName(item.shopId), odText('\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u0435', 'Invitation'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)])]));
  if (header.active === 'invitations') return odPage(odText('\u041e\u043f\u0442\u043e\u0432\u044b\u0439 \u0448\u043e\u0443\u0440\u0443\u043c', 'Wholesale showroom'), header, odRegistry({ scope: 'od-invitations', filterScope: 'showrooms', rows: w.invitations, columns: [{ label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: item => orgName(item.shopId) }, { label: odText('\u0428\u043e\u0443\u0440\u0443\u043c', 'Showroom'), value: item => nameById('showrooms', item.showroomId) }, { label: odText('\u0414\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0434\u043e', 'Expires'), value: item => formatDate(item.expiresAt) }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }], inspector: item => odInspector({ title: orgName(item.shopId), subtitle: nameById('showrooms', item.showroomId), status: item.status, tabs: [odText('\u0414\u043e\u0441\u0442\u0443\u043f', 'Access'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: orgName(item.shopId) }, { label: 'Linesheet', value: nameById('showrooms', item.showroomId) }, { label: odText('\u0414\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0434\u043e', 'Expires'), value: formatDate(item.expiresAt) }], actions: odInvitationActions(item) }) }));
  if (header.active === 'cycles') return odPage(odText('\u041e\u043f\u0442\u043e\u0432\u044b\u0439 \u0448\u043e\u0443\u0440\u0443\u043c', 'Wholesale showroom'), header, odRegistry({ scope: 'od-cycles', filterScope: 'showrooms', statusAccessor: item => item.stage, rows: w.cycles, columns: [{ label: odText('\u041f\u0430\u0440\u0442\u043d\u0435\u0440\u044b', 'Partners'), value: item => pairName(item.brandId, item.shopId) }, { label: odText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f', 'Campaign'), value: item => nameById('campaigns', item.campaignId) }, { label: odText('\u042d\u0442\u0430\u043f', 'Stage'), render: item => statusBadge(item.stage) }, { label: odText('\u041f\u0440\u043e\u0433\u0440\u0435\u0441\u0441', 'Progress'), render: item => odProgress(item.stage) }], inspector: item => odInspector({ title: pairName(item.brandId, item.shopId), subtitle: nameById('campaigns', item.campaignId), status: item.stage, tabs: [odText('\u0426\u0438\u043a\u043b', 'Cycle'), odText('\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b', 'Documents'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u0411\u0440\u0435\u043d\u0434', 'Brand'), value: orgName(item.brandId) }, { label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: orgName(item.shopId) }, { label: odText('\u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f', 'Campaign'), value: nameById('campaigns', item.campaignId) }, { label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'), value: nameById('collections', item.collectionId) }], content: [odProgress(item.stage)] }) }));
  return odPage(odText('\u041e\u043f\u0442\u043e\u0432\u044b\u0439 \u0448\u043e\u0443\u0440\u0443\u043c', 'Wholesale showroom'), header, odRegistry({ scope: 'od-linesheets', filterScope: 'showrooms', rows: w.showrooms, columns: [{ label: '', className: 'od-thumb-cell', render: item => odPreview(item.name, nameById('collections', item.collectionId)) }, { label: odText('\u0428\u043e\u0443\u0440\u0443\u043c', 'Showroom'), value: item => item.name }, { label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'), value: item => nameById('collections', item.collectionId) }, { label: odText('\u041f\u0435\u0440\u0438\u043e\u0434', 'Period'), value: item => `${formatDate(item.opensAt)} - ${formatDate(item.closesAt)}` }, { label: odText('\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f', 'Invitations'), value: item => w.invitations.filter(candidate => candidate.showroomId === item.id).length }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }], inspector: item => odInspector({ title: item.name, subtitle: nameById('collections', item.collectionId), status: item.status, preview: true, tabs: [{ label: odText('\u041e\u0431\u0437\u043e\u0440', 'Overview'), fields: [{ label: odText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f', 'Collection'), value: nameById('collections', item.collectionId) }, { label: odText('\u041e\u0442\u043a\u0440\u044b\u0442\u0438\u0435', 'Opens'), value: formatDate(item.opensAt) }, { label: odText('\u0417\u0430\u043a\u0440\u044b\u0442\u0438\u0435', 'Closes'), value: formatDate(item.closesAt) }, { label: 'SKU', value: w.catalogSkus.filter(candidate => candidate.collectionId === item.collectionId).length }] }, { label: odText('\u041f\u043e\u043a\u0430\u0437', 'Presentation'), content: [odShowroomLooks(item)] }, { label: odText('\u0422\u043e\u0432\u0430\u0440\u044b', 'Products'), content: [odShowroomProducts(item)] }, { label: odText('\u0414\u043e\u0441\u0442\u0443\u043f\u044b', 'Access'), content: [odShowroomAccess(item)] }], actions: odShowroomActions(item) }) }));
}

function renderPartners() {
  const w = state.workspace;
  const caps = window.SynthaUiCapabilities;
  const tab = OD_UI.tabs.partners || 'relationships';
  const header = odHeader('partners', [{ id: 'relationships', label: odText('\u041a\u0430\u0440\u0442\u0430 \u0441\u0432\u044f\u0437\u0435\u0439', 'Relationship map') }, { id: 'invitations', label: odText('\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f', 'Invitations') }, { id: 'roles', label: odText('\u041c\u0430\u0442\u0440\u0438\u0446\u0430 \u0440\u043e\u043b\u0435\u0439', 'Role matrix') }, { id: 'history', label: odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0439', 'Change history') }], [{ label: odText('\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u0438', 'Organisations'), value: w.organisations.length, detail: odText('\u0432 \u043a\u043e\u043d\u0442\u0443\u0440\u0435', 'in scope') }, { label: odText('\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u0441\u0432\u044f\u0437\u0438', 'Active relationships'), value: w.relationships.filter(item => item.status === 'active').length, detail: odText('\u0431\u0440\u0435\u043d\u0434 \u0438 \u043c\u0430\u0433\u0430\u0437\u0438\u043d', 'brand and shop') }, { label: odText('\u041e\u0436\u0438\u0434\u0430\u044e\u0442', 'Pending'), value: w.relationships.filter(item => item.status === 'pending').length, detail: odText('\u0437\u0430\u043f\u0440\u043e\u0441\u044b \u043d\u0430 \u0441\u0432\u044f\u0437\u044c', 'relationship requests') }, { label: odText('\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f', 'Invitations'), value: w.invitations.length, detail: `${w.invitations.filter(item => item.status === 'accepted').length} ${odText('\u043f\u0440\u0438\u043d\u044f\u0442\u043e', 'accepted')}` }, { label: odText('\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0438', 'Members'), value: w.memberships.length, detail: odText('\u0440\u043e\u043b\u0438 \u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u044b', 'roles and access') }], ['active', 'pending', 'rejected', 'revoked'], odText('\u041f\u043e\u0438\u0441\u043a \u043f\u0430\u0440\u0442\u043d\u0435\u0440\u0430, \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430 \u0438\u043b\u0438 \u0441\u0442\u0430\u0442\u0443\u0441\u0430', 'Search partner, shop or status'), tab === 'relationships' && caps.hasAny(w, caps.CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE) ? odAction(odText('\u0417\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u044c \u0441\u0432\u044f\u0437\u044c', 'Request relationship'), relationshipForm) : null);
  if (header.active === 'history') return odPage(odText('\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u044b \u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u044b', 'Partners and access'), header, odHistory(odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0441\u0432\u044f\u0437\u0435\u0439 \u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u043e\u0432', 'Relationship and access history'), [...w.relationships.map(item => [pairName(item.brandId, item.shopId), odText('\u0421\u0432\u044f\u0437\u044c', 'Relationship'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)]), ...w.invitations.map(item => [orgName(item.shopId), odText('\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u0435', 'Invitation'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)])]));
  if (header.active === 'roles') {
    // Матрица ролей строилась на `workspace.memberships`, а он несёт только членство самого
    // читателя: измерено живьём — маршрут членов организации отдаёт пять записей, рабочее
    // пространство одну. Матрица из одной строки матрицей не является, поэтому состав читается
    // там, где он полон, и по каждой видимой организации, а не только по своей.
    const roster = window.SynthaBrandRoster;
    // Человека называют именем. Членство его не хранит — только сгенерированный
    // идентификатор, — а состав организации хранит, и именно поэтому он здесь и читается.
    // Идентификатор остаётся в подсказке: по нему ищут в журнале.
    const personOf = (item) => (roster ? roster.personName(item) : '') || item.userId || item.id;
    const loaded = w.organisations.flatMap((org) => {
      const members = roster ? roster.roster(org.id, { onLoaded: () => { if (state.view === 'partners') renderApp(); } }) : null;
      return (members || []).map((member) => ({ ...member, organisation: org }));
    });
    // Пока состав читается, показывается то, что уже есть в рабочем пространстве: пустая таблица
    // на месте таблицы — хуже неполной, потому что выглядит как ответ.
    const rows = loaded.length ? loaded : w.memberships.map(item => ({ ...item, organisation: w.organisations.find(org => org.id === item.organisationId) }));
    return odPage(odText('\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u044b \u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u044b', 'Partners and access'), header, odRegistry({ scope: 'od-roles', rows, rowKey: item => `${item.userId || item.id}:${item.organisationId}`, columns: [{ label: odText('\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c', 'User'), value: item => personOf(item), title: item => item.userId || item.id }, { label: odText('\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f', 'Organisation'), value: item => item.organisation?.name || orgName(item.organisationId) }, { label: odText('\u0422\u0438\u043f', 'Type'), value: item => item.organisation?.type || '\u2014' }, { label: odText('\u0420\u043e\u043b\u044c', 'Role'), render: item => statusBadge(item.role || 'member') }], inspector: item => odInspector({ title: personOf(item), subtitle: item.organisation?.name || orgName(item.organisationId), status: item.role || 'member', tabs: [odText('\u0420\u043e\u043b\u044c', 'Role'), odText('\u041f\u0440\u0430\u0432\u0430', 'Permissions'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f', 'Organisation'), value: item.organisation?.name || orgName(item.organisationId) }, { label: odText('\u0422\u0438\u043f', 'Type'), value: item.organisation?.type || '\u2014' }, { label: odText('\u0420\u043e\u043b\u044c', 'Role'), value: item.role || 'member' }] }) })); }
  if (header.active === 'invitations') return odPage(odText('\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u044b \u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u044b', 'Partners and access'), header, odRegistry({ scope: 'od-partner-invitations', filterScope: 'partners', rows: w.invitations, columns: [{ label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: item => orgName(item.shopId) }, { label: odText('\u0428\u043e\u0443\u0440\u0443\u043c', 'Showroom'), value: item => nameById('showrooms', item.showroomId) }, { label: odText('\u0414\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0434\u043e', 'Expires'), value: item => formatDate(item.expiresAt) }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }], inspector: item => odInspector({ title: orgName(item.shopId), subtitle: nameById('showrooms', item.showroomId), status: item.status, tabs: [odText('\u0414\u043e\u0441\u0442\u0443\u043f', 'Access'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: orgName(item.shopId) }, { label: 'Linesheet', value: nameById('showrooms', item.showroomId) }, { label: odText('\u0414\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0434\u043e', 'Expires'), value: formatDate(item.expiresAt) }], actions: odInvitationActions(item) }) }));
  return odPage(odText('\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u044b \u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u044b', 'Partners and access'), header, odRegistry({ scope: 'od-relationships', filterScope: 'partners', rows: w.relationships, columns: [{ label: odText('\u0411\u0440\u0435\u043d\u0434', 'Brand'), value: item => orgName(item.brandId) }, { label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: item => orgName(item.shopId) }, { label: odText('\u0417\u0430\u043f\u0440\u043e\u0441\u0438\u043b', 'Requested by'), value: item => orgName(item.requestedByOrganisationId) }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }], inspector: item => odInspector({ title: pairName(item.brandId, item.shopId), subtitle: item.id, status: item.status, tabs: [odText('\u041e\u0431\u0437\u043e\u0440', 'Overview'), odText('\u0414\u043e\u0441\u0442\u0443\u043f\u044b', 'Access'), odText('\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b', 'Documents'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u0411\u0440\u0435\u043d\u0434', 'Brand'), value: orgName(item.brandId) }, { label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: orgName(item.shopId) }, { label: odText('\u0417\u0430\u043f\u0440\u043e\u0441\u0438\u043b', 'Requested by'), value: orgName(item.requestedByOrganisationId) }], actions: odRelationshipActions(item) }) }));
}

function renderSelections() {
  const w = state.workspace;
  const caps = window.SynthaUiCapabilities;
  const tab = OD_UI.tabs.selections || 'selections';
  const canCreate = tab === 'selections' && caps.hasAny(w, caps.CAPABILITIES.SELECTION_WRITE, 'shop') && window.SynthaWorkflowContexts.buildSelectionContexts(w, ownIds(), new Date().toISOString()).length > 0;
  const header = odHeader('selections', [{ id: 'selections', label: odText('\u0410\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442\u044b', 'Selections') }, { id: 'buyer', label: odText('\u0420\u0430\u0431\u043e\u0447\u0435\u0435 \u043c\u0435\u0441\u0442\u043e \u0431\u0430\u0439\u0435\u0440\u0430', 'Buyer workspace') }, { id: 'history', label: odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History') }], [{ label: 'Selections', value: w.selections.length, detail: odText('\u0432\u0441\u0435\u0433\u043e', 'total') }, { label: odText('\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u0438', 'Drafts'), value: w.selections.filter(item => item.status === 'draft').length, detail: odText('\u0432 \u0440\u0430\u0431\u043e\u0442\u0435 \u0443 \u0431\u0430\u0439\u0435\u0440\u0430', 'in buyer work') }, { label: odText('\u041e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u043e', 'Submitted'), value: w.selections.filter(item => item.status === 'submitted').length, detail: odText('\u0433\u043e\u0442\u043e\u0432\u043e \u043a \u0437\u0430\u043a\u0430\u0437\u0443', 'ready for order') }, { label: odText('\u041f\u043e\u0437\u0438\u0446\u0438\u0438', 'Lines'), value: w.selections.reduce((sum, item) => sum + odList(item.lines).length, 0), detail: odText('\u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0435 SKU', 'selected SKU') }, { label: odText('\u0415\u0434\u0438\u043d\u0438\u0446\u044b', 'Units'), value: w.selections.reduce((sum, item) => sum + odList(item.lines).reduce((inner, line) => inner + Number(line.quantity || 0), 0), 0), detail: odText('\u043e\u0431\u044a\u0435\u043c \u043e\u0442\u0431\u043e\u0440\u0430', 'selected quantity') }], ['draft', 'submitted'], odText('\u041f\u043e\u0438\u0441\u043a selection, linesheet \u0438\u043b\u0438 SKU', 'Search selection, linesheet or SKU'), canCreate ? odAction(odText('\u0421\u043e\u0437\u0434\u0430\u0442\u044c Selection', 'Create selection'), selectionForm) : null);
  if (header.active === 'history') return odPage(odText('\u0410\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442\u044b \u0431\u0430\u0439\u0435\u0440\u0430', 'Buyer selection'), header, odHistory(odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u043e\u0442\u0431\u043e\u0440\u043e\u0432', 'Selection history'), w.selections.map(item => [objectReference(item.id), odText('\u0410\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442', 'Selection'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)])));
  return odPage(odText('\u0410\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442\u044b \u0431\u0430\u0439\u0435\u0440\u0430', 'Buyer selection'), header, odRegistry({ scope: 'od-selections', filterScope: 'selections', rows: w.selections, columns: [{ label: odText('\u0410\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442', 'Selection'), value: item => shortId(String(item.id).replace(/^selection_/, '')), title: item => item.id }, { label: odText('\u0428\u043e\u0443\u0440\u0443\u043c', 'Showroom'), value: item => nameById('showrooms', item.showroomId) }, { label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: item => orgName(item.shopId) }, { label: odText('\u041f\u043e\u0437\u0438\u0446\u0438\u0438', 'Lines'), value: item => odList(item.lines).length }, { label: odText('\u0415\u0434\u0438\u043d\u0438\u0446\u044b', 'Units'), value: item => odList(item.lines).reduce((sum, line) => sum + Number(line.quantity || 0), 0) }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }], inspector: item => odInspector({ title: objectReference(item.id), subtitle: nameById('showrooms', item.showroomId), status: item.status, preview: header.active === 'buyer', tabs: [odText('\u0421\u043e\u0441\u0442\u0430\u0432', 'Lines'), odText('\u0423\u0441\u043b\u043e\u0432\u0438\u044f', 'Terms'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: 'Linesheet', value: nameById('showrooms', item.showroomId) }, { label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: orgName(item.shopId) }, { label: odText('\u041f\u043e\u0437\u0438\u0446\u0438\u0438', 'Lines'), value: odList(item.lines).length }, { label: odText('\u0415\u0434\u0438\u043d\u0438\u0446\u044b', 'Units'), value: odList(item.lines).reduce((sum, line) => sum + Number(line.quantity || 0), 0) }], content: [odMiniTable(['SKU', odText('\u041a\u043e\u043b-\u0432\u043e', 'Qty'), odText('\u0426\u0435\u043d\u0430', 'Price')], odList(item.lines).map(line => [line.sku, line.quantity, money(line.unitPrice)]))], actions: odSelectionActions(item) }) }));
}

function renderOrders() {
  const w = state.workspace;
  const caps = window.SynthaUiCapabilities;
  const tab = OD_UI.tabs.orders || 'orders';
  const canCreate = tab === 'orders' && caps.hasAny(w, caps.CAPABILITIES.ORDER_WRITE, 'shop') && w.selections.some(selection => selection.status === 'submitted' && !w.orders.some(order => order.selectionId === selection.id));
  const header = odHeader('orders', [{ id: 'orders', label: odText('\u0417\u0430\u043a\u0430\u0437\u044b', 'Orders') }, { id: 'deals', label: odText('\u041f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e \u0441\u0434\u0435\u043b\u043a\u0438', 'Deal space') }, { id: 'confirmations', label: odText('\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u0438\u044f', 'Confirmations') }, { id: 'history', label: odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History') }], [{ label: odText('\u0417\u0430\u043a\u0430\u0437\u044b', 'Orders'), value: w.orders.length, detail: odText('\u0432\u0441\u0435\u0433\u043e', 'total') }, { label: odText('\u041e\u0436\u0438\u0434\u0430\u044e\u0442 \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u0438\u044f', 'Awaiting approval'), value: w.orders.filter(item => ['draft', 'ready'].includes(item.status)).length, detail: odText('\u0434\u0432\u0435 \u0441\u0442\u043e\u0440\u043e\u043d\u044b', 'two-sided confirmation') }, { label: odText('\u041f\u0440\u0438\u043a\u0440\u0435\u043f\u043b\u0435\u043d\u043e', 'Attached'), value: w.orders.filter(item => item.status === 'attached').length, detail: odText('\u0432 \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u043e\u043c \u0446\u0438\u043a\u043b\u0435', 'in commercial cycle') }, { label: 'DealSpace', value: w.deals.length, detail: odText('\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043d\u044b\u0435 \u0441\u0434\u0435\u043b\u043a\u0438', 'confirmed deals') }, { label: odText('\u041e\u0442\u043c\u0435\u043d\u0435\u043d\u043e', 'Cancelled'), value: w.orders.filter(item => item.status === 'cancelled').length, detail: odText('\u0441 \u043f\u0440\u0438\u0447\u0438\u043d\u043e\u0439 \u043e\u0442\u043c\u0435\u043d\u044b', 'with cancellation reason') }], ['draft', 'ready', 'attached', 'cancelled'], odText('\u041f\u043e\u0438\u0441\u043a \u0437\u0430\u043a\u0430\u0437\u0430, \u043f\u0430\u0440\u0442\u043d\u0435\u0440\u0430 \u0438\u043b\u0438 \u0441\u0442\u0430\u0442\u0443\u0441\u0430', 'Search order, partner or status'), canCreate ? odAction(odText('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0437\u0430\u043a\u0430\u0437', 'Create order'), orderForm) : null);
  if (header.active === 'history') return odPage(odText('\u0417\u0430\u043a\u0430\u0437\u044b \u0438 \u0441\u0434\u0435\u043b\u043a\u0438', 'Order builder & deal space'), header, odHistory(odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0437\u0430\u043a\u0430\u0437\u043e\u0432 \u0438 \u0441\u0434\u0435\u043b\u043e\u043a', 'Order and deal history'), [...w.orders.map(item => [objectReference(item.id), odText('\u0417\u0430\u043a\u0430\u0437', 'Order'), statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)]), ...w.deals.map(item => [objectReference(item.id), 'DealSpace', statusBadge(item.status), formatDate(item.updatedAt || item.createdAt)])]));
  const deals = header.active === 'deals';
  const rows = deals ? w.deals : header.active === 'confirmations' ? w.orders.filter(item => ['draft', 'ready'].includes(item.status)) : w.orders;
  return odPage(odText('\u0417\u0430\u043a\u0430\u0437\u044b \u0438 \u0441\u0434\u0435\u043b\u043a\u0438', 'Order builder & deal space'), header, odRegistry({ scope: deals ? 'od-deals' : 'od-orders', filterScope: 'orders', rows, columns: deals ? [{ label: 'DealSpace', value: item => objectReference(item.id), title: item => item.id }, { label: odText('\u0417\u0430\u043a\u0430\u0437', 'Order'), value: item => objectReference(item.orderId), title: item => item.orderId }, { label: odText('\u041f\u0430\u0440\u0442\u043d\u0435\u0440\u044b', 'Partners'), value: item => pairName(item.brandId, item.shopId) }, { label: odText('\u0421\u0443\u043c\u043c\u0430', 'Amount'), value: item => money(item.totalAmount) }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }] : [{ label: odText('\u0417\u0430\u043a\u0430\u0437', 'Order'), value: item => objectReference(item.id), title: item => item.id }, { label: odText('\u041f\u0430\u0440\u0442\u043d\u0435\u0440\u044b', 'Partners'), value: item => pairName(item.brandId, item.shopId) }, { label: odText('\u0421\u0443\u043c\u043c\u0430', 'Amount'), value: item => `${money(item.totalAmount, item.currency)}` }, { label: odText('\u0423\u0441\u043b\u043e\u0432\u0438\u044f', 'Terms'), value: item => `${item.terms?.incoterm || '\u2014'} / ${item.terms?.paymentDays ?? 0}` }, { label: odText('\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u043e', 'Approved'), value: item => `${odList(item.acceptedOrganisationIds).length}/2` }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }], inspector: item => odInspector({ title: objectReference(item.id), subtitle: pairName(item.brandId, item.shopId), status: item.status, tabs: [deals ? odText('\u0421\u0434\u0435\u043b\u043a\u0430', 'Deal') : odText('\u0417\u0430\u043a\u0430\u0437', 'Order'), odText('\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b', 'Documents'), odText('\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u0438\u044f', 'Approvals'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u0418\u0434\u0435\u043d\u0442\u0438\u0444\u0438\u043a\u0430\u0442\u043e\u0440', 'Identifier'), value: objectReference(item.id), title: item.id }, { label: odText('\u0411\u0440\u0435\u043d\u0434', 'Brand'), value: orgName(item.brandId) }, { label: odText('\u041c\u0430\u0433\u0430\u0437\u0438\u043d', 'Shop'), value: orgName(item.shopId) }, { label: odText('\u0421\u0443\u043c\u043c\u0430', 'Amount'), value: `${money(item.totalAmount)} ${item.currency || ''}` }, { label: 'Incoterm', value: item.terms?.incoterm || '\u2014' }, { label: odText('\u041e\u043f\u043b\u0430\u0442\u0430, \u0434\u043d\u0438', 'Payment, days'), value: item.terms?.paymentDays ?? '\u2014' }], actions: deals ? [] : odOrderActions(item) }) }));
}

function renderCalendar() {
  const w = state.workspace;
  const header = odHeader('calendar', [{ id: 'agenda', label: odText('\u041f\u043e\u0432\u0435\u0441\u0442\u043a\u0430', 'Agenda') }, { id: 'timeline', label: odText('\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u043d\u044b\u0439 \u043f\u043b\u0430\u043d', 'Timeline') }, { id: 'history', label: odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History') }], [{ label: odText('\u0421\u043e\u0431\u044b\u0442\u0438\u044f', 'Events'), value: w.calendar.length, detail: odText('\u0432\u0441\u0435\u0433\u043e', 'total') }, { label: odText('\u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u043e', 'Production'), value: w.calendar.filter(item => item.type === 'production').length, detail: odText('\u043f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0435 \u0441\u0440\u043e\u043a\u0438', 'production dates') }, { label: odText('\u0417\u0430\u043a\u0443\u043f\u043a\u0438', 'Purchasing'), value: w.calendar.filter(item => item.type === 'purchase').length, detail: odText('\u0437\u0430\u043a\u0443\u043f\u043e\u0447\u043d\u044b\u0435 \u0441\u043e\u0431\u044b\u0442\u0438\u044f', 'purchasing events') }, { label: odText('\u041c\u0430\u0440\u043a\u0435\u0442\u0438\u043d\u0433', 'Marketing'), value: w.calendar.filter(item => item.type === 'marketing').length, detail: odText('\u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0438 \u0438 \u0437\u0430\u043f\u0443\u0441\u043a\u0438', 'campaigns and launches') }, { label: odText('\u041f\u0440\u0438\u0432\u0430\u0442\u043d\u044b\u0435', 'Private'), value: w.calendar.filter(item => item.visibility === 'private').length, detail: odText('\u043e\u0433\u0440\u0430\u043d\u0438\u0447\u0435\u043d\u043d\u0430\u044f \u0432\u0438\u0434\u0438\u043c\u043e\u0441\u0442\u044c', 'restricted visibility') }], [], odText('\u041f\u043e\u0438\u0441\u043a \u0441\u043e\u0431\u044b\u0442\u0438\u044f \u0438\u043b\u0438 \u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u0438', 'Search event or organisation'));
  const events = odFilter([...w.calendar].sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt))), 'calendar');
  if (header.active === 'history') return odPage(odText('\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c', 'Operational calendar'), header, odHistory(odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044f', 'Calendar history'), events.map(item => [humaniseIdentifiers(item.title || item.type), statusLabel(item.type), statusBadge(item.visibility || item.type), formatDate(item.startsAt)])));
  if (header.active === 'timeline') { const timeline = el('section', { className: 'od-timeline' }); if (!events.length) timeline.append(el('div', { className: 'od-empty', rawText: odText('\u041d\u0435\u0442 \u0441\u043e\u0431\u044b\u0442\u0438\u0439 \u043f\u043e \u0437\u0430\u0434\u0430\u043d\u043d\u044b\u043c \u0444\u0438\u043b\u044c\u0442\u0440\u0430\u043c', 'No events for the chosen filters') })); events.forEach(item => { const row = el('article', { className: 'od-timeline-row' }); const card = el('div', { className: 'od-timeline-card' }); card.append(el('strong', { rawText: humaniseIdentifiers(item.title || item.type) }), el('p', { rawText: orgName(item.ownerOrganisationId) }), statusBadge(item.visibility || item.type)); row.append(el('time', { rawText: formatDate(item.startsAt) }), el('span', { className: 'od-timeline-line' }), card); timeline.append(row); }); return odPage(odText('\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c', 'Operational calendar'), header, timeline); }
  return odPage(odText('\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c', 'Operational calendar'), header, odRegistry({ scope: 'od-calendar', rows: events, columns: [{ label: odText('\u0421\u043e\u0431\u044b\u0442\u0438\u0435', 'Event'), value: item => humaniseIdentifiers(item.title || item.type), title: item => item.title || '' }, { label: odText('\u0422\u0438\u043f', 'Type'), value: item => statusLabel(item.type) }, { label: odText('\u0414\u0430\u0442\u0430', 'Date'), value: item => formatDate(item.startsAt) }, { label: odText('\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f', 'Organisation'), value: item => orgName(item.ownerOrganisationId) }, { label: odText('\u0412\u0438\u0434\u0438\u043c\u043e\u0441\u0442\u044c', 'Visibility'), render: item => statusBadge(item.visibility || item.type) }], inspector: item => odInspector({ title: humaniseIdentifiers(item.title || item.type), subtitle: formatDate(item.startsAt), status: item.visibility || item.type, tabs: [odText('\u0421\u043e\u0431\u044b\u0442\u0438\u0435', 'Event'), odText('\u041e\u0431\u044a\u0435\u043a\u0442', 'Subject'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u0422\u0438\u043f', 'Type'), value: statusLabel(item.type) }, { label: odText('\u0414\u0430\u0442\u0430', 'Date'), value: formatDate(item.startsAt) }, { label: odText('\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f', 'Organisation'), value: orgName(item.ownerOrganisationId) }, { label: odText('\u0412\u0438\u0434\u0438\u043c\u043e\u0441\u0442\u044c', 'Visibility'), value: item.visibility || '\u2014' }] }) }));
}

function renderNotifications() {
  const header = odHeader('notifications', [{ id: 'all', label: odText('\u0412\u0441\u0435', 'All') }, { id: 'unread', label: odText('\u041d\u0435\u043f\u0440\u043e\u0447\u0438\u0442\u0430\u043d\u043d\u044b\u0435', 'Unread') }, { id: 'history', label: odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History') }], [{ label: odText('\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f', 'Notifications'), value: state.notifications.length, detail: odText('\u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d\u043e', 'loaded') }, { label: odText('\u041d\u0435\u043f\u0440\u043e\u0447\u0438\u0442\u0430\u043d\u043d\u044b\u0435', 'Unread'), value: state.notificationUnreadCount, detail: odText('\u0442\u0440\u0435\u0431\u0443\u044e\u0442 \u0432\u043d\u0438\u043c\u0430\u043d\u0438\u044f', 'need attention') }, { label: odText('\u041f\u0440\u043e\u0447\u0438\u0442\u0430\u043d\u043e', 'Read'), value: state.notifications.filter(item => item.status === 'read').length, detail: odText('\u043e\u0431\u0440\u0430\u0431\u043e\u0442\u0430\u043d\u043e', 'processed') }, { label: odText('\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 24 \u0447\u0430\u0441\u0430', 'Last 24 hours'), value: state.notifications.filter(item => item.createdAt && Date.now() - new Date(item.createdAt).getTime() < 86400000).length, detail: odText('\u043d\u043e\u0432\u0430\u044f \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u044c', 'new activity') }, { label: odText('\u0415\u0449\u0435 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e', 'More available'), value: window.SynthaNotificationController?.hasMore() ? '+' : '0', detail: odText('\u043a\u0443\u0440\u0441\u043e\u0440\u043d\u0430\u044f \u043f\u0430\u0433\u0438\u043d\u0430\u0446\u0438\u044f', 'cursor pagination') }], [], odText('\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u0442\u0435\u043c\u0435 \u0438\u043b\u0438 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044e', 'Search title or message'));
  let rows = state.notifications;
  if (header.active === 'unread') rows = rows.filter(item => item.status !== 'read');
  // "History" re-sorted the same register and was indistinguishable from "All". It now renders the
  // same history panel every other section uses.
  if (header.active === 'history') {
    const entries = [...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(item => [item.title || item.type, item.type, statusBadge(item.status || 'unread'), formatDate(item.createdAt)]);
    return odPage(odText('\u0426\u0435\u043d\u0442\u0440 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0439', 'Notification center'), header, odHistory(odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0439', 'Notification history'), entries));
  }
  const body = odRegistry({ scope: 'od-notifications', filterScope: 'notifications', rows, columns: [{ label: odText('\u0422\u0435\u043c\u0430', 'Subject'), value: item => notificationTitle(item), title: item => item.title || '' }, { label: odText('\u0422\u0438\u043f', 'Type'), value: item => statusLabel(item.type) }, { label: odText('\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435', 'Message'), value: item => notificationBody(item) }, { label: odText('\u0414\u0430\u0442\u0430', 'Date'), value: item => formatDate(item.createdAt) }, { label: odText('\u0421\u0442\u0430\u0442\u0443\u0441', 'Status'), render: item => statusBadge(item.status) }], inspector: item => odInspector({ title: notificationTitle(item), subtitle: formatDate(item.createdAt), status: item.status, tabs: [odText('\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435', 'Message'), odText('\u041a\u043e\u043d\u0442\u0435\u043a\u0441\u0442', 'Context'), odText('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History')], fields: [{ label: odText('\u0422\u0438\u043f', 'Type'), value: statusLabel(item.type) }, { label: odText('\u0414\u0430\u0442\u0430', 'Date'), value: formatDate(item.createdAt) }, { label: odText('\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435', 'Message'), value: notificationBody(item) }], actions: item.status !== 'read' ? [notificationReadButton(item)] : [] }) });
  if (window.SynthaNotificationController?.hasMore()) { const more = el('div', { className: 'od-load-more' }); const button = el('button', { className: 'button', type: 'button', rawText: odText('\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0435\u0449\u0435', 'Load more') }); button.addEventListener('click', () => { void window.SynthaNotificationController.loadNext(); }); more.append(button); body.append(more); }
  return odPage(odText('\u0426\u0435\u043d\u0442\u0440 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0439', 'Notification center'), header, body);
}
