(function installCurrencyRatesWorkspace(global) {
  'use strict';

  const caps = global.SynthaUiCapabilities;
  if (!caps) throw new Error('SynthaUiCapabilities must load before currency-rates.js');

  // Два источника курса, один экран.
  //
  // Курс ЦБ — рыночный факт, общий для всех: тянется скриптом синхронизации (`scripts/sync-cbr-rates.mjs`)
  // в `currency_reference_rates` и здесь только читается. Курс бренда на сезон — число, которым бренд
  // сам считает целевую цену (`target-pricing`, `season_fx_rates`, миграция 117); он мог давно
  // существовать через API, но нигде не был виден и нигде не заводился, кроме прямого вызова
  // `POST /v2/season-fx-rates`. Оба — история дат, а не текущее значение: ни то, ни другое задним
  // числом не правится, только дополняется новой строкой.
  const ui = global.SynthaCurrencyRatesWorkspace || (global.SynthaCurrencyRatesWorkspace = {
    pair: { fromCurrency: 'USD', toCurrency: 'RUB' },
    referenceRates: [], referenceLoaded: false, referenceLoading: false, referenceError: '',
    brandId: null, campaignId: null,
    seasonRates: [], seasonLoaded: false, seasonLoading: false, seasonError: '', seasonFor: null,
    busyKey: null,
  });

  const TRACKED_CURRENCIES = ['USD', 'EUR', 'CNY', 'TRY', 'JPY'];
  const BASE_CURRENCY = 'RUB';

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
  function campaignName(campaignId) { const item = (state.workspace?.campaigns || []).find((candidate) => candidate.id === campaignId); return item ? `${item.name} (${item.season})` : campaignId; }

  function formatDate(value) { if (!value) return '—'; const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(I18N.localeTag(), { day: '2-digit', month: 'short', year: 'numeric' }).format(date) : '—'; }
  function formatRate(value) { return I18N.formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 4 }); }
  function badge(label, tone = 'neutral') { return h('span', { className: `sourcing-badge sourcing-${tone === 'warning' ? 'caution' : tone}`, text: label }); }
  function control(name, type, value, attrs = {}) { return h('input', { name, type, value: value ?? '', ...attrs }); }
  function textarea(name, value, attrs = {}) { return h('textarea', { name, text: value || '', ...attrs }); }
  function select(name, options, value, attrs = {}) { const node = h('select', { name, ...attrs }, options.map(([key, label]) => h('option', { value: key, text: label }))); node.value = value ?? options[0]?.[0] ?? ''; return node; }
  function field(label, input) { return h('label', { className: 'sourcing-field' }, [h('span', { text: label }), input]); }
  function iso(value) { const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new Error(text('Укажите дату.', 'Enter a date.')); return date.toISOString().slice(0, 10); }
  // Тот же приём разбора десятичной дроби, что и у количества материала (sourcing.js): запятая —
  // разделитель дробной части, а не INVALID_MONEY на пустом месте.
  function decimalToNumber(value) {
    const normalized = String(value).trim().replace(/[\s  ]/g, '').replace(',', '.');
    if (!/^\d+(?:\.\d{1,4})?$/.test(normalized)) throw new Error(text('Укажите курс, например 91,50 или 91.5.', 'Enter a rate, for example 91.50 or 91.5.'));
    return Number(normalized);
  }

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

  async function loadReferenceRates() {
    if (ui.referenceLoading) return;
    ui.referenceLoading = true; ui.referenceError = '';
    try {
      const query = new URLSearchParams({ source: 'cbr', fromCurrency: ui.pair.fromCurrency, toCurrency: ui.pair.toCurrency, limit: '100' });
      const rows = await api(`/v2/currency-reference-rates?${query.toString()}`);
      ui.referenceRates = Array.isArray(rows) ? rows : [];
      ui.referenceLoaded = true;
    } catch (error) {
      ui.referenceError = error?.message || I18N.t('common.requestError');
    } finally {
      ui.referenceLoading = false;
      if (state.view === 'currency-rates') renderApp();
    }
  }
  function ensureReferenceLoaded() {
    if (!ui.referenceLoaded && !ui.referenceLoading && !ui.referenceError) queueMicrotask(() => { void loadReferenceRates(); });
  }
  function refreshReference() { ui.referenceLoaded = false; ui.referenceError = ''; return loadReferenceRates(); }

  async function loadSeasonRates() {
    if (!ui.brandId || !ui.campaignId || ui.seasonLoading) return;
    ui.seasonLoading = true; ui.seasonError = '';
    try {
      const query = new URLSearchParams({ brandId: ui.brandId, campaignId: ui.campaignId });
      const rows = await api(`/v2/season-fx-rates?${query.toString()}`);
      ui.seasonRates = Array.isArray(rows) ? rows : [];
      ui.seasonFor = `${ui.brandId}:${ui.campaignId}`;
    } catch (error) {
      ui.seasonError = error?.message || I18N.t('common.requestError');
    } finally {
      ui.seasonLoading = false;
      if (state.view === 'currency-rates') renderApp();
    }
  }
  function ensureSeasonLoaded() {
    if (!ui.brandId || !ui.campaignId) return;
    const wanted = `${ui.brandId}:${ui.campaignId}`;
    if (ui.seasonFor !== wanted && !ui.seasonLoading) queueMicrotask(() => { void loadSeasonRates(); });
  }

  function openRecordSeasonRateDialog() {
    if (!ui.brandId || !ui.campaignId) { toast(text('Выберите бренд и сезон.', 'Select a brand and a season first.'), 'error'); return; }
    const brandId = ui.brandId, campaignId = ui.campaignId;
    const controls = {
      fromCurrency: select('fromCurrency', TRACKED_CURRENCIES.map((code) => [code, code]), ui.pair.fromCurrency),
      toCurrency: control('toCurrency', 'text', BASE_CURRENCY, { required: true, minlength: '3', maxlength: '3' }),
      rate: control('rate', 'text', '', { required: true, inputmode: 'decimal' }),
      effectiveOn: control('effectiveOn', 'date', new Date().toISOString().slice(0, 10), { required: true }),
      sourceNote: textarea('sourceNote', '', { maxlength: '1000', rows: '3' }),
    };
    dialog(text('Записать курс бренда на сезон', 'Record a brand season rate'), [
      field(text('Бренд', 'Brand'), control('brandLabel', 'text', brandName(brandId), { disabled: true })),
      field(text('Сезон', 'Season'), control('campaignLabel', 'text', campaignName(campaignId), { disabled: true })),
      field(text('Из валюты', 'From currency'), controls.fromCurrency),
      field(text('В валюту', 'To currency'), controls.toCurrency),
      field(text('Курс', 'Rate'), controls.rate),
      field(text('Дата действия', 'Effective on'), controls.effectiveOn),
      field(text('Комментарий', 'Notes'), controls.sourceNote),
    ], text('Записать', 'Record'), async (values) => {
      if (ui.busyKey) return false;
      ui.busyKey = 'season-rate'; renderApp();
      try {
        await mutate('/v2/season-fx-rates', {
          brandId, campaignId, fromCurrency: values.fromCurrency, toCurrency: values.toCurrency.trim().toUpperCase(),
          rate: decimalToNumber(values.rate), effectiveOn: iso(values.effectiveOn), sourceNote: values.sourceNote.trim() || null,
        }, 'POST');
        ui.seasonFor = null; // force a reload so the new row and its history appear
        await loadSeasonRates();
        toastDone('курс записан.', 'the rate is recorded.');
        return true;
      } finally {
        ui.busyKey = null; renderApp();
      }
    });
  }

  function pairPicker() {
    const node = select('pair', TRACKED_CURRENCIES.map((code) => [code, `${code} → ${BASE_CURRENCY}`]), ui.pair.fromCurrency, {
      onchange: (event) => { ui.pair = { fromCurrency: event.target.value, toCurrency: BASE_CURRENCY }; refreshReference(); },
    });
    return node;
  }

  function referenceTable() {
    if (ui.referenceError) return h('div', { className: 'sourcing-error', text: ui.referenceError });
    const rows = ui.referenceRates.map((rate) => h('tr', {}, [
      h('td', { text: formatDate(rate.effectiveOn) }),
      h('td', { text: `${rate.fromCurrency} → ${rate.toCurrency}` }),
      h('td', { text: formatRate(rate.rate) }),
      h('td', {}, [badge(text('ЦБ РФ', 'CBR'), 'neutral')]),
    ]));
    if (!rows.length) rows.push(h('tr', {}, [h('td', { colspan: '4', className: 'sourcing-empty', text: ui.referenceLoading ? text('Загрузка…', 'Loading…') : text('Курс ЦБ по этой паре ещё не загружен.', 'No CBR rate has been synced for this pair yet.') })]));
    return h('div', { className: 'sourcing-table-wrap' }, [h('table', { className: 'sourcing-table' }, [
      h('thead', {}, [h('tr', {}, [text('Дата', 'Date'), text('Пара', 'Pair'), text('Курс', 'Rate'), text('Источник', 'Source')].map((label) => h('th', { text: label, scope: 'col' })))]),
      h('tbody', {}, rows),
    ])]);
  }

  function seasonBrandCampaignPicker() {
    const brands = manageableBrands(caps.CAPABILITIES.COST_MANAGE);
    if (!ui.brandId || !brands.includes(ui.brandId)) ui.brandId = brands[0] || null;
    const campaigns = ui.brandId ? campaignsFor(ui.brandId) : [];
    if (!ui.campaignId || !campaigns.some((item) => item.id === ui.campaignId)) ui.campaignId = campaigns[0]?.id || null;
    if (!brands.length) return h('p', { className: 'muted', text: text('Нет бренда с правом управления себестоимостью.', 'No brand with cost-management rights is available.') });
    const brandSelect = select('season-brand', brands.map((id) => [id, brandName(id)]), ui.brandId, {
      onchange: (event) => { ui.brandId = event.target.value; ui.campaignId = null; ui.seasonFor = null; renderApp(); },
    });
    const campaignSelect = campaigns.length
      ? select('season-campaign', campaigns.map((item) => [item.id, `${item.name} (${item.season})`]), ui.campaignId, {
        onchange: (event) => { ui.campaignId = event.target.value; ui.seasonFor = null; renderApp(); },
      })
      : h('p', { className: 'muted', text: text('У бренда пока нет кампаний.', 'This brand has no campaigns yet.') });
    return h('div', { className: 'sourcing-toolbar' }, [
      field(text('Бренд', 'Brand'), brandSelect),
      field(text('Сезон', 'Season'), campaignSelect),
      canAny(caps.CAPABILITIES.COST_MANAGE) && ui.campaignId
        ? h('button', { type: 'button', className: 'primary', disabled: Boolean(ui.busyKey), text: text('Записать курс', 'Record rate'), onclick: openRecordSeasonRateDialog })
        : null,
    ]);
  }

  function seasonTable() {
    if (!ui.brandId || !ui.campaignId) return null;
    ensureSeasonLoaded();
    if (ui.seasonError) return h('div', { className: 'sourcing-error', text: ui.seasonError });
    const rows = ui.seasonRates.map((rate) => h('tr', {}, [
      h('td', { text: formatDate(rate.effectiveOn) }),
      h('td', { text: `${rate.fromCurrency} → ${rate.toCurrency}` }),
      h('td', { text: formatRate(rate.rate) }),
      h('td', { text: rate.sourceNote || '—' }),
    ]));
    if (!rows.length) rows.push(h('tr', {}, [h('td', { colspan: '4', className: 'sourcing-empty', text: ui.seasonLoading ? text('Загрузка…', 'Loading…') : text('Бренд пока не записал курс на этот сезон.', 'The brand has not recorded a rate for this season yet.') })]));
    return h('div', { className: 'sourcing-table-wrap' }, [h('table', { className: 'sourcing-table' }, [
      h('thead', {}, [h('tr', {}, [text('Дата', 'Date'), text('Пара', 'Pair'), text('Курс', 'Rate'), text('Комментарий', 'Notes')].map((label) => h('th', { text: label, scope: 'col' })))]),
      h('tbody', {}, rows),
    ])]);
  }

  function renderCurrencyRates() {
    ensureReferenceLoaded();
    return h('section', { className: 'sourcing-workspace' }, [
      h('header', { className: 'sourcing-header' }, [
        h('div', {}, [
          h('p', { className: 'eyebrow', text: 'FINANCE / FX' }),
          h('h1', { text: text('Курсы валют', 'Currency rates') }),
          h('p', { className: 'muted', text: text(
            'Официальный курс ЦБ РФ по датам и собственный курс бренда на сезон — оба как история, а не текущее число.',
            'The official CBR rate by date, and each brand’s own season rate — both a history, not a single current figure.',
          ) }),
        ]),
        h('div', { className: 'sourcing-header-actions' }, [
          h('button', { type: 'button', className: 'secondary', disabled: ui.referenceLoading, text: text('Обновить', 'Refresh'), onclick: () => { refreshReference(); } }),
        ]),
      ]),
      h('section', { className: 'sourcing-panel' }, [
        h('div', { className: 'sourcing-toolbar' }, [h('h2', { text: text('Курс ЦБ РФ', 'CBR reference rate') }), pairPicker()]),
        referenceTable(),
      ]),
      h('section', { className: 'sourcing-panel' }, [
        h('div', { className: 'sourcing-toolbar' }, [h('h2', { text: text('Курс бренда на сезон', 'Brand season rate') })]),
        seasonBrandCampaignPicker(),
        seasonTable(),
      ]),
    ]);
  }

  const previousRenderView = renderView;
  renderView = (...args) => (state.view === 'currency-rates' ? renderCurrencyRates() : previousRenderView(...args));
  global.SynthaOmnidataV7Nav?.activate('Currency rates', 'currency-rates', 'Курсы валют', 'Currency rates');
})(window);
