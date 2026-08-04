(function installSampleCatalogSync(global) {
  'use strict';

  const sync = global.SynthaSampleCatalogSync || (global.SynthaSampleCatalogSync = {
    actorKey: '', active: false, status: 'idle', error: '', generation: 0,
  });

  function text(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }

  async function fetchAllCatalogSkus(request = api) {
    const items = new Map();
    const seenCursors = new Set();
    let cursor = null;
    for (let pageCount = 1; pageCount <= 500; pageCount += 1) {
      const query = new URLSearchParams({ limit: '200' });
      if (cursor) query.set('cursor', cursor);
      const page = await request(`/v2/catalog/skus?${query.toString()}`);
      if (!page || !Array.isArray(page.items)) throw new Error('SAMPLE_CATALOG_PAGE_INVALID');
      for (const sku of page.items) {
        if (!sku || typeof sku.sku !== 'string' || !sku.sku) throw new Error('SAMPLE_CATALOG_SKU_INVALID');
        items.set(sku.sku, sku);
      }
      const nextCursor = page.nextCursor || null;
      if (!nextCursor) return Object.freeze([...items.values()]);
      if (seenCursors.has(nextCursor)) throw new Error('SAMPLE_CATALOG_CURSOR_CYCLE');
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
    throw new Error('SAMPLE_CATALOG_PAGE_LIMIT_EXCEEDED');
  }

  function actorKey() {
    return String(state.user?.actorId || state.user?.id || state.user?.email || 'anonymous');
  }

  function resetForActor(key) {
    sync.actorKey = key;
    sync.active = false;
    sync.status = 'idle';
    sync.error = '';
    sync.generation += 1;
  }

  function start() {
    if (sync.status === 'loading') return;
    sync.status = 'loading';
    sync.error = '';
    const generation = ++sync.generation;
    void fetchAllCatalogSkus().then((catalogSkus) => {
      if (generation !== sync.generation) return;
      state.workspace = { ...state.workspace, catalogSkus };
      sync.status = 'ready';
      renderApp();
    }).catch((error) => {
      if (generation !== sync.generation) return;
      sync.status = 'error';
      sync.error = error?.message || 'SAMPLE_CATALOG_LOAD_FAILED';
      renderApp();
    });
  }

  function stateView({ error = false } = {}) {
    const section = document.createElement('section');
    section.className = 'sample-page';
    const card = document.createElement('div');
    card.className = `sample-sync-state${error ? ' sample-sync-error' : ''}`;
    const title = document.createElement('h1');
    title.textContent = error ? text('Каталог SKU загружен не полностью', 'The SKU catalog is incomplete') : text('Загрузка полного каталога SKU', 'Loading the complete SKU catalog');
    const message = document.createElement('p');
    message.textContent = error
      ? `${text('Операции с образцами заблокированы:', 'Sample operations are blocked:')} ${sync.error}`
      : text('Действия станут доступны после загрузки всех cursor-страниц каталога.', 'Actions become available after every Catalog cursor page is loaded.');
    card.append(title, message);
    if (error) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'primary';
      retry.textContent = text('Повторить загрузку', 'Retry');
      retry.addEventListener('click', () => { sync.status = 'idle'; start(); renderApp(); });
      card.append(retry);
    }
    section.append(card);
    return section;
  }

  const previousRenderView = renderView;
  renderView = (...args) => {
    const key = actorKey();
    if (sync.actorKey !== key) resetForActor(key);
    if (state.view !== 'samples') {
      sync.active = false;
      return previousRenderView(...args);
    }
    if (!sync.active) {
      sync.active = true;
      sync.status = 'idle';
      sync.error = '';
      sync.generation += 1;
    }
    if (sync.status === 'idle') start();
    if (sync.status === 'error') return stateView({ error: true });
    if (sync.status !== 'ready') return stateView();
    return previousRenderView(...args);
  };

  Object.defineProperty(sync, 'fetchAllCatalogSkus', { value: fetchAllCatalogSkus, enumerable: true });
})(window);
