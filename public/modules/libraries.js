(function installLibrariesWorkspace(global) {
  'use strict';

  // The governed libraries the platform holds itself to. A colour family, a point of measurement or a
  // construction node decides what the rest of the system will accept, and until now none of them
  // could be looked at: the reference data everything is checked against was the one thing nobody
  // could read. Entries are fetched per library, because a library can be long and most visits only
  // open one.
  const ui = global.SynthaLibrariesWorkspace || (global.SynthaLibrariesWorkspace = {
    libraries: [], loaded: false, loading: false, error: '',
    selected: null, entries: [], entriesFor: null, entriesLoading: false, search: '',
  });

  function text(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }
  function name(item) { return I18N.getLocale?.() === 'en' ? (item.nameEn || item.nameRu) : (item.nameRu || item.nameEn); }

  async function loadLibraries() {
    if (ui.loading) return;
    ui.loading = true; ui.error = '';
    try {
      const result = await api('/v2/libraries');
      ui.libraries = result.items || [];
      ui.loaded = true;
      if (!ui.selected && ui.libraries.length) ui.selected = ui.libraries[0].code;
    } catch (error) {
      ui.error = error?.message || I18N.t('common.requestError');
    } finally {
      ui.loading = false;
      if (state.view === 'libraries') renderApp();
    }
  }

  async function loadEntries(code) {
    if (!code || ui.entriesLoading) return;
    ui.entriesLoading = true;
    try {
      const search = ui.search.trim();
      const query = search ? `?limit=200&q=${encodeURIComponent(search)}` : '?limit=200';
      const result = await api(`/v2/libraries/${encodeURIComponent(code)}/entries${query}`);
      ui.entries = result.items || [];
      ui.entriesFor = `${code}:${search}`;
    } catch (error) {
      ui.entries = [];
      toast(error?.message || I18N.t('common.requestError'), 'error');
    } finally {
      ui.entriesLoading = false;
      if (state.view === 'libraries') renderApp();
    }
  }

  function ensureLoaded() {
    if (!ui.loaded && !ui.loading && !ui.error) queueMicrotask(() => { void loadLibraries(); });
    const wanted = ui.selected ? `${ui.selected}:${ui.search.trim()}` : null;
    if (wanted && ui.entriesFor !== wanted && !ui.entriesLoading) queueMicrotask(() => { void loadEntries(ui.selected); });
  }

  function entryAttributes(entry) {
    const attributes = entry.attributes && typeof entry.attributes === 'object' ? entry.attributes : {};
    return Object.entries(attributes)
      .filter(([key]) => key !== 'market_codes')
      .map(([key, value]) => ({ label: key, value: Array.isArray(value) ? value.join(', ') : String(value) }));
  }

  function inspector(item) {
    if (!item) return odInspector({ title: text('Выберите библиотеку', 'Select a library') });
    const entries = ui.entries;
    return odInspector({
      title: name(item),
      subtitle: item.code,
      status: item.status,
      fields: [
        { label: text('Записей', 'Entries'), value: `${item.activeEntryCount}/${item.entryCount}` },
        { label: text('Класс данных', 'Data class'), value: item.dataClass },
        { label: text('Область', 'Scope'), value: item.scopeModel },
        { label: text('Требует согласования', 'Approval required'), value: item.approvalRequired ? text('Да', 'Yes') : text('Нет', 'No') },
      ],
      content: [
        ui.entriesLoading
          ? notice(text('Загрузка записей…', 'Loading entries…'))
          : entries.length
            ? odMiniTable(
              [text('Код', 'Code'), text('Наименование', 'Name'), text('Атрибуты', 'Attributes')],
              entries.map((entry) => [
                entry.code,
                name(entry),
                entryAttributes(entry).map((pair) => `${pair.label}: ${pair.value}`).join(' · ') || '—',
              ]),
            )
            : notice(text('В этой библиотеке пока нет записей.', 'This library has no entries yet.')),
      ],
    });
  }

  function renderLibraries() {
    // The selection has to be read before deciding what to fetch: reading it afterwards meant the
    // entries of the previously selected library stayed on screen under the new library's heading.
    const chosen = OD_UI.selected['od-libraries'];
    if (chosen && chosen !== ui.selected) ui.selected = chosen;
    ensureLoaded();
    if (ui.error) {
      return odPage(text('Библиотеки', 'Libraries'), null, notice(ui.error, 'error'));
    }
    const rows = ui.libraries;
    const header = odHeader('libraries', [
      { id: 'all', label: text('Все библиотеки', 'All libraries') },
    ], [
      { label: text('Библиотеки', 'Libraries'), value: rows.length, detail: text('управляемых справочников', 'governed dictionaries') },
      { label: text('Записей', 'Entries'), value: rows.reduce((sum, item) => sum + (item.entryCount || 0), 0), detail: text('всего', 'total') },
      { label: text('Требуют согласования', 'Under approval'), value: rows.filter((item) => item.approvalRequired).length, detail: text('изменяются через MDM', 'changed through MDM') },
    ], [], text('Поиск библиотеки', 'Search a library'), null);

    const registry = odRegistry({
      scope: 'od-libraries', filterScope: 'libraries', rows, rowKey: (item) => item.code,
      statusAccessor: (item) => item.status,
      columns: [
        { key: 'code', label: text('Код', 'Code'), value: (item) => item.code },
        { key: 'name', label: text('Наименование', 'Name'), value: (item) => name(item) },
        { key: 'dataClass', label: text('Класс данных', 'Data class'), value: (item) => item.dataClass },
        { key: 'scope', label: text('Область', 'Scope'), value: (item) => item.scopeModel },
        { key: 'entries', label: text('Записей', 'Entries'), value: (item) => item.entryCount },
        { key: 'status', label: text('Статус', 'Status'), render: (item) => statusBadge(item.status) },
      ],
      inspector,
    });
    return odPage(text('Библиотеки', 'Libraries'), header, registry);
  }

  global.SynthaOmnidataV7Nav?.activate('Libraries', 'libraries', 'Библиотеки', 'Libraries');

  const previousRenderView = renderView;
  renderView = (...args) => (state.view === 'libraries' ? renderLibraries() : previousRenderView(...args));
})(window);
