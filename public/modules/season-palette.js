(function installSeasonPaletteWorkspace(global) {
  'use strict';

  const caps = global.SynthaUiCapabilities;
  if (!caps) throw new Error('SynthaUiCapabilities must load before season-palette.js');

  // «Что вообще в этом сезоне» — вопрос, на который до сих пор нельзя было ответить ни строкой кода:
  // таблица `season_colour_palettes` (миграция 128) заведена и наполняется (`scripts/seed-demo.mjs`),
  // API (`GET/POST /v2/campaigns/{id}/palette`) работает, а экрана не было вовсе.
  //
  // Цвет закрепляется версией governed-справочника (`colour.colour`): палитра сезона — решение,
  // принятое один раз, и если справочник потом переименует оттенок, сезон должен остаться тем, каким
  // его утвердили. Позиция обязательна и уникальна внутри кампании — палитра читается сверху вниз,
  // и первым идёт главный цвет сезона, а не оформление списка.
  const ui = global.SynthaSeasonPaletteWorkspace || (global.SynthaSeasonPaletteWorkspace = {
    brandId: null, campaignId: null,
    palette: [], paletteLoaded: false, paletteLoading: false, paletteError: '', paletteFor: null,
    colours: [], coloursLoaded: false, coloursLoading: false, coloursError: '',
    busyKey: null,
  });

  function text(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }
  function h(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'disabled') node.disabled = Boolean(value);
      else if (key === 'value') node.value = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, String(value));
    }
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child === undefined || child === null) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }
  function canAny(capability) { return caps.hasAny(state.workspace, capability, 'brand'); }
  function manageableBrands(capability) { return caps.organisationIds(state.workspace, capability, 'brand'); }
  function brandName(brandId) { return state.workspace.organisations?.find((item) => item.id === brandId)?.name || brandId; }
  function campaignsFor(brandId) { return (state.workspace?.campaigns || []).filter((item) => item.brandId === brandId); }

  function formatDate(value) { if (!value) return '—'; const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(I18N.localeTag(), { day: '2-digit', month: 'short', year: 'numeric' }).format(date) : '—'; }
  function colourName(entry) { return I18N.getLocale?.() === 'en' ? (entry.nameEn || entry.nameRu) : (entry.nameRu || entry.nameEn); }
  function control(name, type, value, attrs = {}) { return h('input', { name, type, value: value ?? '', ...attrs }); }
  function select(name, options, value, attrs = {}) { const node = h('select', { name, ...attrs }, options.map(([key, label]) => h('option', { value: key, text: label }))); node.value = value ?? options[0]?.[0] ?? ''; return node; }
  function field(label, input) { return h('label', { className: 'sourcing-field' }, [h('span', { text: label }), input]); }
  // Раскраска цветом — не инлайн-стиль: `colourSwatch` (dom-2.js) уже решает это SVG-элементом с
  // атрибутом `fill`, потому что CSP этого рантайма (`style-src 'self'`) отклоняет любое динамическое
  // назначение оформления через DOM, а не только HTML-атрибут.

  function dialog(title, fields, submitLabel, onSubmit) {
    const modal = h('dialog', { className: 'sourcing-dialog' });
    const form = h('form', { method: 'dialog' }, [h('header', {}, [h('h2', { text: title })]), h('div', { className: 'sourcing-form-grid' }, fields)]);
    const error = h('p', { className: 'sourcing-form-error', hidden: true });
    const cancel = h('button', { type: 'button', className: 'secondary', text: text('Закрыть', 'Close'), onclick: () => modal.close() });
    const submit = h('button', { type: 'submit', className: 'primary', text: submitLabel });
    form.append(error, h('footer', {}, [cancel, submit]));
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); submit.disabled = true; error.hidden = true;
      try {
        const values = Object.fromEntries(new FormData(form).entries());
        const done = await onSubmit(values);
        if (done) modal.close();
      } catch (submitError) {
        error.textContent = submitError?.message || I18N.t('common.requestError'); error.hidden = false;
      } finally { if (submit.isConnected) submit.disabled = false; }
    });
    modal.addEventListener('close', () => modal.remove(), { once: true });
    modal.append(form); document.body.append(modal); modal.showModal();
    return modal;
  }

  // Справочник цветов — восемь governed-записей, весь список умещается в один запрос без поиска и
  // страниц, тем же приёмом, что и `libraries.js` читает любой другой справочник.
  async function loadColours() {
    if (ui.coloursLoading) return;
    ui.coloursLoading = true; ui.coloursError = '';
    try {
      const result = await api('/v2/libraries/colour.colour/entries?limit=200');
      ui.colours = (result.items || []).filter((item) => item.status === 'active');
      ui.coloursLoaded = true;
    } catch (error) {
      ui.coloursError = error?.message || I18N.t('common.requestError');
    } finally {
      ui.coloursLoading = false;
      if (state.view === 'season-palette') renderApp();
    }
  }
  function ensureColoursLoaded() {
    if (!ui.coloursLoaded && !ui.coloursLoading && !ui.coloursError) queueMicrotask(() => { void loadColours(); });
  }

  async function loadPalette() {
    if (!ui.campaignId || ui.paletteLoading) return;
    ui.paletteLoading = true; ui.paletteError = '';
    try {
      const result = await api(`/v2/campaigns/${encodeURIComponent(ui.campaignId)}/palette`);
      ui.palette = Array.isArray(result?.colours) ? result.colours : [];
      ui.paletteFor = ui.campaignId;
    } catch (error) {
      ui.paletteError = error?.message || I18N.t('common.requestError');
    } finally {
      ui.paletteLoading = false;
      if (state.view === 'season-palette') renderApp();
    }
  }
  function ensurePaletteLoaded() {
    if (!ui.campaignId) return;
    if (ui.paletteFor !== ui.campaignId && !ui.paletteLoading) queueMicrotask(() => { void loadPalette(); });
  }

  function openAddColourDialog() {
    if (!ui.campaignId) { toast(text('Выберите бренд и сезон.', 'Select a brand and a season first.'), 'error'); return; }
    if (!ui.colours.length) { toast(text('Справочник цветов пуст или ещё не загружен.', 'The colour dictionary is empty or not loaded yet.'), 'error'); return; }
    const campaignId = ui.campaignId;
    const nextPosition = ui.palette.reduce((max, item) => Math.max(max, item.position), 0) + 1;
    dialog(text('Добавить цвет в палитру сезона', 'Add a colour to the season palette'), [
      field(text('Цвет', 'Colour'), select('colourCode', ui.colours.map((item) => [item.code, `${colourName(item)} · ${item.code}`]), ui.colours[0].code)),
      field(text('Позиция', 'Position'), control('position', 'number', String(nextPosition), { min: '1', max: '999', required: true })),
    ], text('Добавить', 'Add'), async (values) => {
      if (ui.busyKey) return false;
      ui.busyKey = 'add-colour'; renderApp();
      try {
        await mutate(`/v2/campaigns/${encodeURIComponent(campaignId)}/palette`, {
          colourCode: values.colourCode, position: Number(values.position),
        }, 'POST');
        ui.paletteFor = null;
        await loadPalette();
        toastDone('цвет добавлен в палитру.', 'the colour is added to the palette.');
        return true;
      } finally {
        ui.busyKey = null; renderApp();
      }
    });
  }

  function brandCampaignPicker() {
    const brands = manageableBrands(caps.CAPABILITIES.PRODUCT_READ);
    if (!ui.brandId || !brands.includes(ui.brandId)) ui.brandId = brands[0] || null;
    const campaigns = ui.brandId ? campaignsFor(ui.brandId) : [];
    if (!ui.campaignId || !campaigns.some((item) => item.id === ui.campaignId)) ui.campaignId = campaigns[0]?.id || null;
    if (!brands.length) return h('p', { className: 'muted', text: text('Нет бренда с правом чтения продукта.', 'No brand with product-read rights is available.') });
    const brandSelect = select('palette-brand', brands.map((id) => [id, brandName(id)]), ui.brandId, {
      onchange: (event) => { ui.brandId = event.target.value; ui.campaignId = null; ui.paletteFor = null; renderApp(); },
    });
    const campaignSelect = campaigns.length
      ? select('palette-campaign', campaigns.map((item) => [item.id, `${item.name} (${item.season})`]), ui.campaignId, {
        onchange: (event) => { ui.campaignId = event.target.value; ui.paletteFor = null; renderApp(); },
      })
      : h('p', { className: 'muted', text: text('У бренда пока нет кампаний.', 'This brand has no campaigns yet.') });
    return h('div', { className: 'sourcing-toolbar' }, [
      field(text('Бренд', 'Brand'), brandSelect),
      field(text('Сезон', 'Season'), campaignSelect),
      canAny(caps.CAPABILITIES.COMMERCIAL_CYCLE_CREATE) && ui.campaignId
        ? h('button', { type: 'button', className: 'primary', disabled: Boolean(ui.busyKey), text: text('Добавить цвет', 'Add colour'), onclick: openAddColourDialog })
        : null,
    ]);
  }

  function colourAttribute(entry, key) { return entry?.attributes?.[key] ?? null; }
  function paletteTable() {
    if (!ui.campaignId) return null;
    ensurePaletteLoaded();
    if (ui.paletteError) return h('div', { className: 'sourcing-error', text: ui.paletteError });
    const colourByCode = new Map(ui.colours.map((item) => [item.code, item]));
    const rows = [...ui.palette].sort((a, b) => a.position - b.position).map((entry) => {
      const dict = colourByCode.get(entry.colourCode);
      const hex = colourAttribute(dict, 'hex');
      return h('tr', {}, [
        h('td', { text: String(entry.position) }),
        h('td', {}, [colourSwatch(hex, hex || entry.colourCode), h('span', { text: dict ? colourName(dict) : entry.colourCode })]),
        h('td', { text: entry.colourCode }),
        h('td', { text: colourAttribute(dict, 'pantone') || '—' }),
        h('td', { text: formatDate(entry.createdAt) }),
      ]);
    });
    if (!rows.length) rows.push(h('tr', {}, [h('td', { colspan: '5', className: 'sourcing-empty', text: ui.paletteLoading ? text('Загрузка…', 'Loading…') : text('В этом сезоне ещё нет цветов.', 'This season has no colours yet.') })]));
    return h('div', { className: 'sourcing-table-wrap' }, [h('table', { className: 'sourcing-table' }, [
      h('thead', {}, [h('tr', {}, [text('№', '#'), text('Цвет', 'Colour'), text('Код', 'Code'), 'Pantone', text('Добавлен', 'Added')].map((label) => h('th', { text: label, scope: 'col' })))]),
      h('tbody', {}, rows),
    ])]);
  }

  function renderSeasonPalette() {
    ensureColoursLoaded();
    return h('section', { className: 'sourcing-workspace' }, [
      h('header', { className: 'sourcing-header' }, [
        h('div', {}, [
          h('p', { className: 'eyebrow', text: 'PLM / PRODUCT DESIGN' }),
          h('h1', { text: text('Палитра сезона', 'Season palette') }),
          h('p', { className: 'muted', text: text(
            'Цвета, которыми сезон разрешено рисовать — закреплены версией справочника, порядок задаёт главный цвет.',
            'The colours this season is allowed to use — pinned to a dictionary version, order names the lead colour.',
          ) }),
        ]),
      ]),
      h('section', { className: 'sourcing-panel' }, [
        h('div', { className: 'sourcing-toolbar' }, [h('h2', { text: text('Сезон', 'Season') })]),
        brandCampaignPicker(),
        paletteTable(),
      ]),
    ]);
  }

  const previousRenderView = renderView;
  renderView = (...args) => (state.view === 'season-palette' ? renderSeasonPalette() : previousRenderView(...args));
  global.SynthaOmnidataV7Nav?.activate('Season palette', 'season-palette', 'Палитра сезона', 'Season palette');
})(window);
