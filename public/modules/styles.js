(function installStyleMasterV6() {
  'use strict';

  const core = window.SynthaStylesCore;
  if (!core) throw new Error('SynthaStylesCore must load before styles.js');
  const nav = OD_V5_GROUPS.flatMap((group) => group.items).find((item) => item.en === 'Styles and colourways' || item.en === 'Styles / SKU');
  if (nav) { nav.view = 'styles'; nav.ru = 'Модели'; nav.en = 'Product Master'; nav.planned = false; }

  function text(ru, en) { return localText(ru, en); }
  function title(product) { return I18N.getLocale?.() === 'en' ? (product.titleEn || product.titleRu || product.styleCode) : (product.titleRu || product.titleEn || product.styleCode); }
  function riskLabel(code) {
    const labels = {
      STYLE_VERSION_MISSING: ['Нет канонической версии модели', 'Canonical StyleVersion is missing'],
      COLORWAYS_MISSING: ['Нет цветовых вариантов', 'No Colorways'],
      PRODUCT_SKUS_MISSING: ['Нет канонических Product SKU', 'No canonical Product SKUs'],
      READINESS_NOT_ASSESSED: ['Product Readiness не оценён', 'Product Readiness not assessed'],
      READINESS_BLOCKED: ['Product Readiness заблокирован', 'Product Readiness is blocked'],
      COMMERCIAL_PROJECTION_MISSING: ['Нет Commercial Projection', 'Commercial Projection is missing'],
      LEGACY_BRIDGE_INCOMPLETE: ['Миграционный SKU bridge неполный', 'Legacy SKU migration bridge incomplete'],
    };
    const pair = labels[code] || [code, code];
    return text(pair[0], pair[1]);
  }

  function readiness(item) {
    const node = el('div', { className: 'industrial-readiness', 'data-ods-part': 'progress' });
    const bar = el('progress', { className: 'industrial-readiness-bar' });
    bar.max = 100;
    bar.value = Math.max(0, Math.min(100, item.readinessPercent));
    bar.setAttribute('aria-label', 'Product Readiness');
    node.append(bar, el('strong', { rawText: item.product.readinessSnapshotId ? `${item.readinessPercent}%` : '—' }));
    return node;
  }

  function readinessBadge(item) {
    if (!item.product.readinessSnapshotId) return statusBadge('not_assessed');
    return statusBadge(item.product.readinessStatus);
  }

  // Governed product dimensions. They are written as MDM-referenced attribute values on the style
  // version and projected by product_master_workspace with both names resolved, so the section reads
  // them without knowing anything about the dictionary they came from.
  function dimension(product, attributeCode) {
    const value = product?.dimensions?.[attributeCode];
    if (!value) return '';
    const name = I18N.getLocale?.() === 'en' ? value.nameEn : value.nameRu;
    return name || value.code || '';
  }
  // The desks that answer for a style. A register in this industry is read by asking "which of these
  // are mine", so every role is a column of its own and therefore filterable like any other.
  const ROLE_LABELS = [
    ['buyer', 'Байер', 'Buyer'],
    ['product_manager', 'Продуктовый менеджер', 'Product manager'],
    ['fabric_manager', 'Менеджер по тканям', 'Fabric manager'],
    ['technologist', 'Технолог', 'Technologist'],
    ['designer', 'Дизайнер', 'Designer'],
  ];
  function people(product, role) {
    const list = product?.responsibilities?.[role];
    if (!Array.isArray(list) || !list.length) return '';
    return list.map((person) => person.displayName || person.email || person.userId).join(', ');
  }

  // Every governed attribute the style carries, labelled by the catalogue rather than by a hardcoded
  // list here, so a card can show an attribute nobody thought to write a label for.
  // The lifecycle comes from the server so this screen offers exactly the steps the domain allows and
  // cannot drift from them. It is the same for every style, so it is fetched once.
  const lifecycle = { statuses: [], transitions: null, loading: false, error: '' };
  // The main line of development, in order. The remaining states (on hold, rejected, superseded) are
  // exits from it rather than steps along it, so they are shown as where the style is, not as a rail.
  const LIFECYCLE_MAIN_LINE = [
    'draft', 'in_development', 'sample_review', 'technically_approved', 'sourcing_approved',
    'purchase_or_production_ready', 'compliance_ready', 'commercial_ready', 'active',
  ];
  function ensureLifecycle() {
    if (lifecycle.transitions || lifecycle.loading) return;
    lifecycle.loading = true;
    api('/v2/product/lifecycle')
      .then((result) => { lifecycle.statuses = result.statuses || []; lifecycle.transitions = result.transitions || {}; })
      .catch((error) => { lifecycle.error = error?.message || ''; })
      .finally(() => { lifecycle.loading = false; renderApp(); });
  }
  function lifecycleRail(product) {
    const rail = el('div', { className: 'od-lifecycle-rail' });
    const currentIndex = LIFECYCLE_MAIN_LINE.indexOf(product.lifecycleStatus);
    LIFECYCLE_MAIN_LINE.forEach((status, index) => {
      const step = el('span', {
        className: `od-lifecycle-step${index === currentIndex ? ' current' : ''}${currentIndex >= 0 && index < currentIndex ? ' passed' : ''}`,
        rawText: statusLabel(status),
      });
      step.title = statusLabel(status);
      rail.append(step);
    });
    return rail;
  }
  function transitionButtons(item) {
    const product = item.product;
    const next = lifecycle.transitions?.[product.lifecycleStatus] || [];
    if (!lifecycle.transitions) return [notice(text('Загрузка жизненного цикла…', 'Loading the lifecycle…'))];
    if (!next.length) {
      return [notice(text(
        `Состояние «${statusLabel(product.lifecycleStatus)}» конечное: дальше модель не переводится.`,
        `"${statusLabel(product.lifecycleStatus)}" is a final state: the style goes no further.`,
      ))];
    }
    const row = el('div', { className: 'od-lifecycle-actions' });
    next.forEach((status) => {
      const button = el('button', { className: 'button small', type: 'button', rawText: statusLabel(status) });
      button.addEventListener('click', () => runAction(async () => {
        await mutate(`/v2/product/styles/${encodeURIComponent(product.id)}/transition`, {
          expectedVersion: product.styleHeadVersion,
          nextStatus: status,
        });
        await reload();
        renderApp();
        toast(text(`Модель переведена в «${statusLabel(status)}».`, `The style moved to "${statusLabel(status)}".`), 'success');
      }, button));
      row.append(button);
    });
    return [row];
  }

  // A register of garments that shows no garment is hard to read. The image is whatever the read model
  // chose — the hero shot, else the technical sketch — and it has to survive a URI that does not load
  // as well as one that is missing, because a broken-image icon in every row is worse than no image.
  function mediaFor(item) {
    const all = Array.isArray(state.workspace.media) ? state.workspace.media : [];
    return all.find((entry) => entry.styleVersionId === item.product.styleVersionId && !entry.colorwayId) || null;
  }
  function initialsTile(product) {
    const code = String(product.styleCode || '').replace(/[^A-Za-z0-9]/g, '');
    const tile = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tile.setAttribute('class', 'od-thumb od-thumb-empty');
    tile.setAttribute('viewBox', '0 0 48 48');
    tile.setAttribute('width', '48');
    tile.setAttribute('height', '48');
    tile.setAttribute('role', 'img');
    tile.setAttribute('aria-label', text('Изображение не загружено', 'No image'));
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '0.5'); rect.setAttribute('y', '0.5');
    rect.setAttribute('width', '47'); rect.setAttribute('height', '47');
    rect.setAttribute('rx', '4'); rect.setAttribute('fill', '#F6F7F8'); rect.setAttribute('stroke', '#E1E4E7');
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', '24'); label.setAttribute('y', '29');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '13');
    label.setAttribute('fill', '#98A2B3');
    label.textContent = code.slice(0, 3).toUpperCase() || '—';
    tile.append(rect, label);
    return tile;
  }
  function productThumb(item) {
    const media = mediaFor(item);
    if (!media?.uri) return initialsTile(item.product);
    const wrap = el('span', { className: 'od-thumb-wrap' });
    const image = el('img', { className: 'od-thumb', src: media.uri, alt: title(item.product), loading: 'lazy' });
    // A stored URI is not a promise that it resolves. When it does not, the row falls back to the
    // same tile an image-less style gets instead of showing a broken picture.
    image.addEventListener('error', () => {
      if (!wrap.isConnected) return;
      wrap.replaceChildren(initialsTile(item.product));
    }, { once: true });
    wrap.append(image);
    return wrap;
  }

  // What the object has been through. Every mutation already recorded who did it and when; until now
  // none of it could be read back, so the audit trail existed only for someone with a SQL prompt.
  const HISTORY = { items: [], loading: false, loadedFor: null };
  // The attribute stream is loaded and filtered on its own, because an auditor narrows it and a
  // reader of the event feed does not.
  const CHANGES = { items: [], loading: false, loadedFor: null, attribute: '', actor: '', from: '', to: '' };
  const HISTORY_LABELS = {
    'ProductStyleCreated': ['\u041c\u043e\u0434\u0435\u043b\u044c \u0441\u043e\u0437\u0434\u0430\u043d\u0430', 'Style created'],
    'ProductStyleChanged': ['\u0421\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u043c\u043e\u0434\u0435\u043b\u0438 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u043e', 'Style state changed'],
    'ProductStyleVersionCreated': ['\u0421\u043e\u0437\u0434\u0430\u043d\u0430 \u0432\u0435\u0440\u0441\u0438\u044f \u043c\u043e\u0434\u0435\u043b\u0438', 'Style version created'],
    'ProductColorwayCreated': ['\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u0430 \u0446\u0432\u0435\u0442\u043e\u043c\u043e\u0434\u0435\u043b\u044c', 'Colourway added'],
    'ProductSkuCreated': ['\u0421\u043e\u0437\u0434\u0430\u043d \u0442\u043e\u0432\u0430\u0440\u043d\u044b\u0439 SKU', 'Product SKU created'],
    'ProductAttributeValueCreated': ['\u0417\u0430\u0434\u0430\u043d \u0430\u0442\u0440\u0438\u0431\u0443\u0442', 'Attribute set'],
    'ProductMediaCreated': ['\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435', 'Image added'],
    'ProductReadinessSnapshotCreated': ['\u041e\u0446\u0435\u043d\u0435\u043d\u0430 \u0433\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c', 'Readiness assessed'],
    'product.responsibility.assigned': ['\u041d\u0430\u0437\u043d\u0430\u0447\u0435\u043d \u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439', 'A desk was assigned'],
    'product.responsibility.released': ['\u0421\u043d\u044f\u0442 \u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439', 'A desk was released'],
    'assortment.placeholder.style-linked': ['\u041f\u0440\u0438\u0432\u044f\u0437\u0430\u043d\u0430 \u043a \u043f\u043b\u0435\u0439\u0441\u0445\u043e\u043b\u0434\u0435\u0440\u0443', 'Linked to a placeholder'],
    'ProductCatalogSkuLinkCreated': ['\u0421\u0432\u044f\u0437\u0430\u043d\u0430 \u0441 \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u043e\u043c', 'Linked to the catalogue'],
  };
  function historyLabel(type) {
    const pair = HISTORY_LABELS[type];
    return pair ? text(pair[0], pair[1]) : type;
  }
  async function loadHistory(subjectId) {
    if (!subjectId || HISTORY.loading) return;
    HISTORY.loading = true;
    try {
      const result = await api(`/v2/history/${encodeURIComponent(subjectId)}?limit=50`);
      HISTORY.items = result.items || [];
      HISTORY.loadedFor = subjectId;
    } catch (error) {
      HISTORY.items = [];
      toast(error?.message || I18N.t('common.requestError'), 'error');
    } finally {
      HISTORY.loading = false;
      if (state.view === 'styles') renderApp();
    }
  }
  // What an attribute is called, said the way the interface says it everywhere else. A column name
  // is our word, not the reader's: nobody outside the schema calls it lifecycle_status.
  const ATTRIBUTE_LABELS = {
    lifecycle_status: ['Состояние', 'Lifecycle status'],
    style_code: ['Код модели', 'Style code'],
    title_ru: ['Название (RU)', 'Title (RU)'],
    title_en: ['Название (EN)', 'Title (EN)'],
    description_ru: ['Описание (RU)', 'Description (RU)'],
    description_en: ['Описание (EN)', 'Description (EN)'],
    category_entry_id: ['Категория', 'Category'],
    gender_entry_id: ['Пол', 'Gender'],
    season_entry_id: ['Сезон', 'Season'],
    colorway_code: ['Код цветомодели', 'Colourway code'],
    swatch_hex: ['Образец цвета', 'Swatch'],
    name_ru: ['Название (RU)', 'Name (RU)'],
    name_en: ['Название (EN)', 'Name (EN)'],
    version_no: ['Номер версии', 'Version number'],
    media_role: ['Роль изображения', 'Media role'],
    uri: ['Ссылка', 'Link'],
    payload: ['Дополнительные поля', 'Extra fields'],
  };
  function changedAttributeLabel(name) {
    const pair = ATTRIBUTE_LABELS[name];
    return pair ? text(pair[0], pair[1]) : name;
  }
  // A value as a person reads it. A JSON null is "not set", not the word null; an object is shown
  // compactly rather than as [object Object], which is what a raw template literal would print.
  //
  // Named for what it is rather than the obvious `attributeValue`, which this file already declares
  // further down for the category-attribute panel. Two function declarations of one name in one
  // scope do not collide loudly: the later simply wins, and every caller of the earlier one gets
  // the wrong function. Here that showed as a column of dashes where the old and new values belong.
  // The stored enums are our words. The interface already says them in the reader's language
  // everywhere else, and an audit line reading "draft -> in_development" beside a badge reading
  // «черновик» is two names for one thing.
  const CHANGED_VALUES = {
    draft: ['черновик', 'draft'],
    in_development: ['в разработке', 'in development'],
    approved: ['утверждена', 'approved'],
    published: ['опубликована', 'published'],
    archived: ['в архиве', 'archived'],
    cancelled: ['отменена', 'cancelled'],
    active: ['активна', 'active'],
  };
  function changedValue(raw) {
    if (raw === null || raw === undefined || raw === '') return '—';
    if (typeof raw === 'object') { try { return JSON.stringify(raw); } catch { return '—'; } }
    const value = String(raw);
    if (value.trim() === '') return '—';
    const known = CHANGED_VALUES[value];
    return known ? text(known[0], known[1]) : value;
  }

  async function loadChanges(subjectId) {
    if (!subjectId || CHANGES.loading) return;
    CHANGES.loading = true;
    try {
      const query = new URLSearchParams({ limit: '100' });
      if (CHANGES.attribute) query.set('attribute', CHANGES.attribute);
      if (CHANGES.actor) query.set('actor', CHANGES.actor);
      if (CHANGES.from) query.set('from', CHANGES.from);
      if (CHANGES.to) query.set('to', CHANGES.to);
      const result = await api(`/v2/history/${encodeURIComponent(subjectId)}/attributes?${query}`);
      CHANGES.items = result.items || [];
      CHANGES.loadedFor = subjectId;
    } catch (error) {
      CHANGES.items = [];
      toast(error?.message || I18N.t('common.requestError'), 'error');
    } finally {
      CHANGES.loading = false;
      if (state.view === 'styles') renderApp();
    }
  }

  // Omnidata's change history puts three streams side by side: state, version, and the value of
  // each attribute before and after. The first two are the event feed above; this is the third, and
  // it is the one an audit, a supplier dispute and a post-season review are actually made of.
  function changesPanel(item) {
    const subjectId = item.product.id;
    if (CHANGES.loadedFor !== subjectId && !CHANGES.loading) queueMicrotask(() => { void loadChanges(subjectId); });
    const block = el('div', { className: 'stack' });
    // Not `.od-commandbar`: that class means "this view's registry command bar", and the fidelity
    // layer moves every one of them into the registry column. A filter row that belongs to a panel
    // inside the inspector has to carry its own name or it silently teleports out of the panel.
    const filters = el('div', { className: 'od-change-filters', 'data-od14-component': 'filterbar' });
    const names = [...new Set(CHANGES.items.map((entry) => entry.attribute))].sort();
    const people = [...new Map(CHANGES.items.filter((entry) => entry.actorId)
      .map((entry) => [entry.actorId, entry.actorName || entry.actorEmail || entry.actorId])).entries()];
    filters.append(
      changeFilter(text('Атрибут', 'Attribute'), 'attribute', subjectId,
        [['', text('Все', 'All')], ...names.map((name) => [name, changedAttributeLabel(name)])]),
      changeFilter(text('Кто', 'Who'), 'actor', subjectId,
        [['', text('Все', 'All')], ...people.map(([id, name]) => [id, name])]),
      changeDate(text('С', 'From'), 'from', subjectId),
      changeDate(text('По', 'To'), 'to', subjectId),
    );
    block.append(filters);
    if (CHANGES.loading || CHANGES.loadedFor !== subjectId) {
      block.append(notice(text('Загрузка изменений…', 'Loading the changes…')));
      return block;
    }
    if (!CHANGES.items.length) {
      // An empty list means one of two different things, and saying which is the difference between
      // "nothing happened" and "your filter hid it".
      const filtered = CHANGES.attribute || CHANGES.actor || CHANGES.from || CHANGES.to;
      block.append(notice(filtered
        ? text('По заданным фильтрам изменений нет.', 'No changes match these filters.')
        : text('Значения атрибутов ещё не менялись — модель только создана.', 'No attribute has changed yet — the style has only been created.')));
      return block;
    }
    block.append(odMiniTable(
      [text('Когда', 'When'), text('Атрибут', 'Attribute'), text('Было', 'Was'), text('Стало', 'Became'), text('Кто', 'Who')],
      CHANGES.items.map((entry) => [
        entry.occurredAt ? formatDate(entry.occurredAt) : '—',
        changedAttributeLabel(entry.attribute),
        changedValue(entry.before),
        changedValue(entry.after),
        entry.actorName || entry.actorEmail || '—',
      ]),
    ));
    return block;
  }

  function changeFilter(label, key, subjectId, options) {
    const field = el('label', { className: 'od-filter' });
    field.append(el('span', { rawText: label }));
    const select = el('select', { 'data-od14-component': 'field' });
    options.forEach(([value, caption]) => {
      const option = el('option', { value: String(value), rawText: String(caption) });
      if (String(value) === String(CHANGES[key] || '')) option.selected = true;
      select.append(option);
    });
    select.addEventListener('change', () => { CHANGES[key] = select.value; CHANGES.loadedFor = null; void loadChanges(subjectId); });
    field.append(select);
    return field;
  }

  function changeDate(label, key, subjectId) {
    const field = el('label', { className: 'od-filter' });
    field.append(el('span', { rawText: label }));
    const input = el('input', { type: 'date', value: CHANGES[key] || '', 'data-od14-component': 'field' });
    input.addEventListener('change', () => { CHANGES[key] = input.value; CHANGES.loadedFor = null; void loadChanges(subjectId); });
    field.append(input);
    return field;
  }

  function historyPanel(item) {
    const subjectId = item.product.id;
    if (HISTORY.loadedFor !== subjectId && !HISTORY.loading) queueMicrotask(() => { void loadHistory(subjectId); });
    if (HISTORY.loading || HISTORY.loadedFor !== subjectId) return notice(text('\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0438\u0441\u0442\u043e\u0440\u0438\u0438\u2026', 'Loading the history\u2026'));
    if (!HISTORY.items.length) return notice(text('\u041f\u043e \u044d\u0442\u043e\u0439 \u043c\u043e\u0434\u0435\u043b\u0438 \u043f\u043e\u043a\u0430 \u043d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u0437\u0430\u043f\u0438\u0441\u0430\u043d\u043e.', 'Nothing has been recorded for this style yet.'));
    return odMiniTable(
      [text('\u041a\u043e\u0433\u0434\u0430', 'When'), text('\u0427\u0442\u043e \u043f\u0440\u043e\u0438\u0437\u043e\u0448\u043b\u043e', 'What happened'), text('\u041a\u0442\u043e', 'Who')],
      HISTORY.items.map((entry) => [
        entry.occurredAt ? formatDate(entry.occurredAt) : '\u2014',
        historyLabel(entry.type),
        entry.actorName || entry.actorEmail || '\u2014',
      ]),
    );
  }

  // Colourways of the style, with the governed colour resolved. The article is derived by the read
  // model from the style code and the colourway code, which is how it is read off a label.
  function colorwaysOf(item) {
    const all = Array.isArray(state.workspace.colorways) ? state.workspace.colorways : [];
    return all.filter((entry) => entry.styleVersionId === item.product.styleVersionId);
  }
  // One swatch for the product, shared from the DOM helpers.
  function swatch(entry) {
    return colourSwatch(entry.swatchHex, entry.swatchHex || text('\u0426\u0432\u0435\u0442 \u043d\u0435 \u0437\u0430\u0434\u0430\u043d', 'No colour set'));
  }
  function colorwayPanel(item) {
    const rows = colorwaysOf(item);
    if (!rows.length) return notice(text('У модели пока нет цветомоделей.', 'This style has no colourways yet.'));
    return odMiniTable(
      ['', text('Цветомодель', 'Colourway'), 'Pantone', text('Семейство', 'Family'), text('Артикул', 'Article'), 'SKU'],
      rows.map((entry) => [
        swatch(entry),
        I18N.getLocale?.() === 'en' ? (entry.nameEn || entry.nameRu) : (entry.nameRu || entry.nameEn),
        entry.pantone || '—',
        (I18N.getLocale?.() === 'en' ? entry.familyNameEn : entry.familyNameRu) || '—',
        entry.article,
        String(entry.skuCount ?? 0),
      ]),
    );
  }

  function dimensionLabel(product) {
    return (I18N.getLocale?.() === 'en' ? product.categoryNameEn : product.categoryNameRu) || product.categoryCode || '—';
  }
  function attributeValue(item) {
    const named = I18N.getLocale?.() === 'en' ? item.nameEn : item.nameRu;
    if (named) return named;
    // A boolean false is an answer, not a missing value: showing it as a dash said "not filled in"
    // about a field that said "no".
    if (typeof item.value === 'boolean') return item.value ? text('Да', 'Yes') : text('Нет', 'No');
    if (Array.isArray(item.value)) return item.value.length ? item.value.join(', ') : '—';
    if (item.value === null || item.value === undefined || item.value === '') return '—';
    return String(item.value);
  }
  function categoryAttributes(product) {
    const values = product?.dimensions || {};
    return Object.entries(values).map(([code, item]) => ({
      code,
      label: (I18N.getLocale?.() === 'en' ? item.labelEn : item.labelRu) || code,
      value: attributeValue(item),
    })).sort((left, right) => left.label.localeCompare(right.label));
  }

  function gender(product) {
    const name = I18N.getLocale?.() === 'en' ? product.genderNameEn : product.genderNameRu;
    return name || product.genderCode || '';
  }

  function projectionBadge(item) {
    return item.projected ? statusBadge('published') : statusBadge('not_published');
  }


  // ---------------------------------------------------------------------------------------------
  // Writing.
  //
  // This register is the core of the product model and until now it could only be read. The card
  // announced its own gaps — «Ответственные не назначены», «Заполнено 0 из 40 полей» — with nothing
  // to press: every command existed in the API and none of them had a control. A screen that states
  // a gap and offers no way to close it is worse than one that says nothing, because it teaches the
  // reader that the gap is permanent.
  //
  // Each form below writes through the command the domain already exposes, so the rules that refuse
  // a bad value are the same ones a script would meet.

  function field(labelText, control) {
    const label = el('label', { className: 'od-form-field' });
    label.append(el('span', { rawText: labelText }), control);
    return label;
  }

  function input(name, type, attrs = {}) {
    const node = el('input', { name, type, ...attrs });
    return node;
  }

  function select(name, options, attrs = {}) {
    const node = el('select', { name, ...attrs });
    options.forEach(([value, label]) => node.append(el('option', { value, rawText: label })));
    return node;
  }

  // One dialog shape for this section, so filling a field, adding a colourway and assigning a desk
  // all feel like the same act. It borrows the geometry the rest of the application already uses.
  function openForm({ title: heading, hint, fields, submitLabel, onSubmit }) {
    const modal = el('dialog', { className: 'od-form-dialog' });
    const form = el('form', { method: 'dialog' });
    const head = el('header');
    head.append(el('h2', { rawText: heading }));
    if (hint) head.append(el('p', { className: 'muted', rawText: hint }));
    // The design system lays a dialog's form out as a two-column grid and forces every direct <div>
    // to span both columns as a flex row. Wrapping the fields in a grid of my own therefore made one
    // flex row of them and squeezed a number field to 147 pixels. The fields are direct children of
    // the form instead, which is the shape the rest of the application's dialogs already have.
    const error = el('div', { className: 'od-form-error', hidden: true });
    const footer = el('footer');
    const cancel = el('button', { className: 'button secondary', type: 'button', rawText: I18N.t('common.cancel') });
    const submit = el('button', { className: 'button primary', type: 'submit', rawText: submitLabel });
    cancel.addEventListener('click', () => modal.close());
    footer.append(cancel, submit);
    form.append(head, ...fields, error, footer);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      submit.disabled = true;
      error.hidden = true;
      try {
        await onSubmit(Object.fromEntries(new FormData(form).entries()));
        modal.close();
        await reload();
        renderApp();
      } catch (problem) {
        // The refusal belongs beside the field that caused it, not in a toast that has moved on by
        // the time the reader looks up.
        error.textContent = styleErrorMessage(problem);
        error.hidden = false;
      } finally {
        if (submit.isConnected) submit.disabled = false;
      }
    });
    modal.addEventListener('close', () => modal.remove(), { once: true });
    modal.append(form);
    document.body.append(modal);
    modal.showModal();
    return modal;
  }

  const STYLE_ERRORS = {
    PRODUCT_RESPONSIBILITY_NOT_A_MEMBER: ['Ответственным может быть только сотрудник бренда, которому принадлежит модель.', 'Only a member of the brand that owns the style can take a desk.'],
    PRODUCT_RESPONSIBILITY_ALREADY_ASSIGNED: ['Этот человек уже отвечает за этот стол.', 'This person already holds that desk.'],
    PRODUCT_ATTRIBUTE_NOT_IN_CATALOGUE: ['Такого поля нет в каталоге атрибутов.', 'That field is not in the attribute catalogue.'],
    PRODUCT_ATTRIBUTE_CATEGORY_MISMATCH: ['Это поле не относится к категории модели.', 'That field does not belong to this style\u2019s category.'],
    PRODUCT_COLORWAY_CODE_TAKEN: ['Такой код цветомодели уже есть у этой версии.', 'That colourway code already exists on this version.'],
    PRODUCT_IDENTITY_SNAPSHOT_IMMUTABLE: ['Значение уже зафиксировано и не меняется — заведите новую версию модели.', 'The value is frozen and cannot be changed \u2014 open a new style version.'],
  };
  function styleErrorMessage(problem) {
    const pair = STYLE_ERRORS[String(problem?.code || '')];
    return pair ? text(pair[0], pair[1]) : (problem?.message || I18N.t('common.requestError'));
  }

  // The brand's roster, fetched once per brand. The workspace carries only the reader's own
  // membership, so the only colleague the assignment form could name was the reader — and it named
  // them by their generated user id, because that was all a membership payload holds.
  const ROSTER = { byBrand: new Map(), loading: new Set() };
  function brandRoster(brandId) {
    if (!brandId) return null;
    if (ROSTER.byBrand.has(brandId)) return ROSTER.byBrand.get(brandId);
    if (!ROSTER.loading.has(brandId)) {
      ROSTER.loading.add(brandId);
      queueMicrotask(async () => {
        try {
          const loaded = await api(`/v2/organisations/${encodeURIComponent(brandId)}/members`);
          ROSTER.byBrand.set(brandId, loaded.items || []);
        } catch (problem) {
          ROSTER.byBrand.set(brandId, []);
        } finally {
          ROSTER.loading.delete(brandId);
          if (state.view === 'styles') renderApp();
        }
      });
    }
    return null;
  }
  function personName(member) { return member.displayName || member.email || member.userId; }

  function assignDesk(product, role, roleLabel) {
    const roster = brandRoster(product.brandId);
    if (!roster) {
      toast(text('Загружаем состав бренда…', 'Loading the brand roster…'));
      return;
    }
    if (!roster.length) {
      toast(text('В бренде нет активных участников, которым можно передать стол.', 'The brand has no active members to hand the desk to.'), 'error');
      return;
    }
    const person = select('userId', roster.map((member) => [member.userId, `${personName(member)} · ${statusLabel(member.role)}`]), { required: true });
    openForm({
      title: text(`Назначить: ${roleLabel}`, `Assign: ${roleLabel}`),
      hint: text('Стол закрепляется за сотрудником бренда, которому принадлежит модель.', 'A desk is held by a member of the brand that owns the style.'),
      fields: [field(text('Кто', 'Who'), person)],
      submitLabel: text('Назначить', 'Assign'),
      onSubmit: async (values) => {
        await mutate(`/v2/product/styles/${encodeURIComponent(product.id)}/responsibilities`, { role, userId: values.userId });
        toast(text('Стол закреплён.', 'The desk is assigned.'), 'success');
      },
    });
  }

  async function releaseDesk(person, roleLabel) {
    const accepted = await confirmAction({
      title: text('Освободить стол', 'Release desk'),
      question: text(
        `${person.displayName || person.email || person.userId} перестанет отвечать за «${roleLabel}».`,
        `${person.displayName || person.email || person.userId} will no longer answer for "${roleLabel}".`,
      ),
      confirmLabel: text('Освободить', 'Release'),
      danger: true,
    });
    if (!accepted) return;
    try {
      await mutate(`/v2/product/responsibilities/${encodeURIComponent(person.id)}/release`, {});
      await reload();
      renderApp();
      toast(text('Стол освобождён.', 'The desk is free.'), 'success');
    } catch (problem) { toast(styleErrorMessage(problem), 'error'); }
  }

  function teamPanel(product) {
    // Warm the roster while the tab is open, so pressing «Назначить» opens a filled form rather than
    // asking the reader to press it twice.
    brandRoster(product.brandId);
    const manage = window.SynthaUiCapabilities?.hasForOrganisation(state.workspace, product.brandId, window.SynthaUiCapabilities.CAPABILITIES.PRODUCT_MANAGE);
    const list = el('div', { className: 'od-desk-list' });
    ROLE_LABELS.forEach(([role, ru, en]) => {
      const roleLabel = text(ru, en);
      const row = el('div', { className: 'od-desk-row' });
      const held = Array.isArray(product.responsibilities?.[role]) ? product.responsibilities[role] : [];
      const names = el('div', { className: 'od-desk-people' });
      names.append(el('strong', { rawText: roleLabel }));
      if (held.length) {
        held.forEach((person) => {
          const chip = el('span', { className: 'od-desk-person' });
          chip.append(el('span', { rawText: person.displayName || person.email || person.userId }));
          if (manage && person.id) {
            const drop = el('button', { className: 'od-desk-release', type: 'button', title: text('Освободить стол', 'Release desk'), rawText: '\u00d7' });
            drop.addEventListener('click', () => { void releaseDesk(person, roleLabel); });
            chip.append(drop);
          }
          names.append(chip);
        });
      } else names.append(el('span', { className: 'muted', rawText: text('стол пуст', 'no one yet') }));
      row.append(names);
      if (manage) {
        const assign = el('button', { className: 'button small', type: 'button', rawText: text('Назначить', 'Assign') });
        assign.addEventListener('click', () => assignDesk(product, role, roleLabel));
        row.append(assign);
      }
      list.append(row);
    });
    return list;
  }

  function addColorway(item) {
    const product = item.product;
    if (!product.styleVersionId) {
      toast(text('У модели ещё нет версии, к которой можно добавить цвет.', 'This style has no version to add a colour to yet.'), 'error');
      return;
    }
    openForm({
      title: text('Добавить цветомодель', 'Add a colourway'),
      hint: text('Артикул цветомодели складывается из кода модели и кода цвета.', 'The colourway article is the style code joined to the colour code.'),
      fields: [
        field(text('Код цвета', 'Colour code'), input('colorwayCode', 'text', { required: true, maxlength: '32', pattern: '[A-Za-z0-9._-]{2,32}' })),
        field(text('Название RU', 'Name RU'), input('nameRu', 'text', { required: true, minlength: '2', maxlength: '160' })),
        field(text('Название EN', 'Name EN'), input('nameEn', 'text', { required: true, minlength: '2', maxlength: '160' })),
        field(text('Образец цвета', 'Swatch'), input('swatchHex', 'color', { value: '#1d2939' })),
      ],
      submitLabel: text('Добавить', 'Add'),
      onSubmit: async (values) => {
        await mutate(`/v2/product/style-versions/${encodeURIComponent(product.styleVersionId)}/colorways`, {
          colorwayCode: values.colorwayCode.trim().toUpperCase(),
          nameRu: values.nameRu.trim(),
          nameEn: values.nameEn.trim(),
          swatchHex: values.swatchHex,
        });
        toast(text('Цветомодель добавлена.', 'The colourway is added.'), 'success');
      },
    });
  }

  function addMedia(item) {
    const product = item.product;
    const colorways = colorwaysOf(item);
    openForm({
      title: text('Добавить изображение', 'Add an image'),
      hint: text('Ссылка на изображение. Изображение без цветомодели становится общим для всей версии.', 'A link to the image. One with no colourway belongs to the whole version.'),
      fields: [
        field(text('Цветомодель', 'Colourway'), select('colorwayId', [['', text('— вся версия —', '\u2014 the whole version \u2014')], ...colorways.map((entry) => [entry.id, `${entry.colorwayCode} · ${entry.nameRu || entry.nameEn}`])])),
        field(text('Ссылка', 'Link'), input('uri', 'url', { required: true, maxlength: '2000', placeholder: 'https://…' })),
        field(text('Роль', 'Role'), select('mediaRole', [['hero', text('Основное фото', 'Hero shot')], ['sketch', text('Технический эскиз', 'Technical sketch')], ['detail', text('Деталь', 'Detail')], ['flat', text('Раскладка', 'Flat')]])),
        field(text('Порядок', 'Order'), input('sortOrder', 'number', { required: true, min: '1', max: '999', value: String(mediaCountFor(item) + 1) })),
      ],
      submitLabel: text('Добавить', 'Add'),
      onSubmit: async (values) => {
        await mutate(`/v2/product/style-versions/${encodeURIComponent(product.styleVersionId)}/media`, {
          ...(values.colorwayId ? { colorwayId: values.colorwayId } : {}),
          mediaType: 'image',
          mediaRole: values.mediaRole,
          uri: values.uri.trim(),
          sortOrder: Number(values.sortOrder),
        });
        toast(text('Изображение добавлено.', 'The image is added.'), 'success');
      },
    });
  }

  function mediaCountFor(item) {
    const all = Array.isArray(state.workspace.media) ? state.workspace.media : [];
    return all.filter((entry) => entry.styleVersionId === item.product.styleVersionId).length;
  }

  // The expected field set for the style's category, fetched when the tab is opened. The register
  // knew only how many fields were expected, which is a number nobody can fill in.
  const ATTR = { byVersion: new Map(), loading: new Set() };
  function categoryCatalogue(styleVersionId) {
    if (!styleVersionId) return null;
    if (ATTR.byVersion.has(styleVersionId)) return ATTR.byVersion.get(styleVersionId);
    if (!ATTR.loading.has(styleVersionId)) {
      ATTR.loading.add(styleVersionId);
      queueMicrotask(async () => {
        try {
          const loaded = await api(`/v2/product/style-versions/${encodeURIComponent(styleVersionId)}/category-attributes`);
          ATTR.byVersion.set(styleVersionId, loaded);
        } catch (problem) {
          ATTR.byVersion.set(styleVersionId, { items: [], catalogVersion: null, error: styleErrorMessage(problem) });
        } finally {
          ATTR.loading.delete(styleVersionId);
          if (state.view === 'styles') renderApp();
        }
      });
    }
    return null;
  }

  function fillAttribute(product, definition, catalogVersion) {
    const dictionary = definition.dictionary;
    const control = definition.dataType === 'number' || definition.dataType === 'quantity'
      ? input('value', 'number', { required: true, step: 'any' })
      : input('value', 'text', { required: true, maxlength: '400' });
    openForm({
      title: text(`Заполнить: ${definition.nameRu}`, `Fill in: ${definition.nameEn}`),
      hint: dictionary
        ? text(`Значение берётся из справочника «${dictionary}».`, `The value comes from the "${dictionary}" dictionary.`)
        : text('Значение фиксируется вместе с версией модели и после этого не меняется.', 'The value is frozen with the style version and does not change afterwards.'),
      fields: [field(text(definition.nameRu, definition.nameEn), control)],
      submitLabel: text('Сохранить', 'Save'),
      onSubmit: async (values) => {
        const raw = String(values.value).trim();
        const numeric = definition.dataType === 'number' || definition.dataType === 'quantity';
        await mutate('/v2/product/attributes', {
          ownerType: 'style_version',
          ownerId: product.styleVersionId,
          attributeCode: definition.code,
          attributeCatalogVersion: catalogVersion,
          value: numeric ? Number(raw) : raw,
        });
        ATTR.byVersion.delete(product.styleVersionId);
        toast(text('Поле заполнено.', 'The field is filled.'), 'success');
      },
    });
  }

  function attributePanel(item) {
    const product = item.product;
    const manage = window.SynthaUiCapabilities?.hasForOrganisation(state.workspace, product.brandId, window.SynthaUiCapabilities.CAPABILITIES.PRODUCT_MANAGE);
    const catalogue = categoryCatalogue(product.styleVersionId);
    if (!product.categoryEntryId) {
      return notice(text('У модели не выбрана категория, поэтому набор полей ещё не определён.', 'This style has no category yet, so the field set is not decided.'), 'warning');
    }
    if (!catalogue) return notice(text('Загрузка полей категории…', 'Loading the category fields…'));
    if (catalogue.error) return notice(catalogue.error, 'error');
    const items = catalogue.items || [];
    if (!items.length) return notice(text('Категория не требует дополнительных полей.', 'This category expects no extra fields.'));
    const filled = items.filter((entry) => entry.value !== null && entry.value !== undefined);
    const list = el('div', { className: 'od-attribute-list' });
    items.forEach((definition) => {
      const row = el('div', { className: `od-attribute-row ${definition.value === null || definition.value === undefined ? 'empty' : ''}`.trim() });
      const name = el('div', { className: 'od-attribute-name' });
      name.append(el('strong', { rawText: I18N.getLocale?.() === 'en' ? definition.nameEn : definition.nameRu }));
      name.append(el('small', { rawText: definition.code }));
      const value = el('div', { className: 'od-attribute-value' });
      const shown = definition.entryNameRu || definition.entryNameEn
        ? (I18N.getLocale?.() === 'en' ? definition.entryNameEn : definition.entryNameRu)
        : formatAttributeValue(definition.value);
      value.append(el('span', { rawText: shown ?? '\u2014' }));
      row.append(name, value);
      if (manage && (definition.value === null || definition.value === undefined)) {
        const fill = el('button', { className: 'button small', type: 'button', rawText: text('Заполнить', 'Fill in') });
        fill.addEventListener('click', () => fillAttribute(product, definition, catalogue.catalogVersion));
        row.append(fill);
      }
      list.append(row);
    });
    const summary = notice(text(
      `Заполнено ${filled.length} из ${items.length} полей, которые предполагает категория «${dimensionLabel(product)}».`,
      `${filled.length} of ${items.length} fields expected by the ${dimensionLabel(product)} category are filled.`,
    ), filled.length === items.length ? 'success' : filled.length ? '' : 'warning');
    const wrap = document.createDocumentFragment();
    wrap.append(summary, list);
    return wrap;
  }

  function formatAttributeValue(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') return Object.entries(value).map(([key, part]) => `${key}: ${part}`).join(', ');
    return String(value);
  }

  function colorwayActions(item) {
    const manage = window.SynthaUiCapabilities?.hasForOrganisation(state.workspace, item.product.brandId, window.SynthaUiCapabilities.CAPABILITIES.PRODUCT_MANAGE);
    if (!manage) return null;
    const row = el('div', { className: 'od-inline-actions' });
    const colour = el('button', { className: 'button small primary', type: 'button', rawText: text('Добавить цветомодель', 'Add a colourway') });
    colour.addEventListener('click', () => addColorway(item));
    const image = el('button', { className: 'button small', type: 'button', rawText: text('Добавить изображение', 'Add an image') });
    image.addEventListener('click', () => addMedia(item));
    row.append(colour, image);
    return row;
  }

  function inspector(item) {
    const product = item.product;
    const risks = item.risks.length
      ? odMiniTable([text('Проверка', 'Gate'), text('Уровень', 'Severity')], item.risks.map((risk) => [riskLabel(risk.code), statusBadge(risk.severity)]))
      : notice(text('Цепочка «Модель → Готовность → Коммерческая проекция» замкнута.', 'Product Master → Readiness → Commercial Projection chain is complete.'), 'success');
    return odInspector({
      title: title(product),
      subtitle: `${product.styleCode} · v${product.styleVersionNo || '—'}`,
      status: product.lifecycleStatus,
      preview: true,
      tabs: [
        {
          label: text('Продукт', 'Product'),
          fields: [
            { label: text('Артикул', 'Style code'), value: product.styleCode || '—' },
            { label: text('Идентификатор', 'Identifier'), value: shortId(product.id), title: product.id },
            { label: text('Версия', 'Version'), value: product.styleVersionNo ? `v${product.styleVersionNo}` : '—', title: product.styleVersionId || '' },
            { label: text('Цветовые решения', 'Colorways'), value: item.colorwayCount },
            { label: text('Товарные SKU', 'Product SKU'), value: item.productSkuCount },
            { label: text('Пол', 'Gender'), value: gender(product) || '—' },
            { label: text('Возрастная группа', 'Age group'), value: dimension(product, 'common.age_group') || '—' },
            { label: text('Посадка', 'Fit'), value: dimension(product, 'apparel.fit') || '—' },
            { label: text('Новизна', 'Novelty'), value: dimension(product, 'common.novelty') || '—' },
            { label: text('Сезон', 'Season'), value: dimension(product, 'common.operating_season') || '—' },
          ],
        },
        {
          label: text('Готовность', 'Readiness'),
          fields: [
            { label: text('Оценка готовности', 'Readiness'), value: product.readinessSnapshotId ? `${statusLabel(product.readinessStatus)} · ${item.readinessPercent}%` : text('Не оценён', 'Not assessed') },
            { label: text('Связка с каталогом', 'Catalogue link'), value: `${item.legacyCatalogLinkCount}/${item.productSkuCount}` },
          ],
          content: [risks],
        },
        {
          label: text('Цветомодели', 'Colourways'),
          fields: [
            { label: text('Цветомоделей', 'Colourways'), value: colorwaysOf(item).length },
            { label: text('С управляемым цветом', 'With a governed colour'), value: colorwaysOf(item).filter((entry) => entry.pantone).length },
          ],
          content: [colorwayActions(item), colorwayPanel(item)],
        },
        {
          label: text('Состояние', 'State'),
          fields: [
            { label: text('Текущее состояние', 'Current state'), value: statusLabel(product.lifecycleStatus) },
            { label: text('Версия карточки', 'Card version'), value: product.styleHeadVersion ?? '—' },
          ],
          content: [lifecycleRail(product), ...transitionButtons(item)],
        },
        {
          label: text('Атрибуты категории', 'Category attributes'),
          content: [attributePanel(item)],
        },
        {
          label: text('\u0418\u0441\u0442\u043e\u0440\u0438\u044f', 'History'),
          content: [historyPanel(item)],
        },
        {
          label: text('\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u0430\u0442\u0440\u0438\u0431\u0443\u0442\u043e\u0432', 'Attribute changes'),
          content: [changesPanel(item)],
        },
        {
          label: text('Команда', 'Team'),
          content: [
            Object.keys(product.responsibilities || {}).length
              ? null
              : notice(text('Ответственные не назначены. Пока стол пуст, вопрос по модели некому адресовать.', 'No desks are assigned yet. While a desk is empty there is nobody to address a question about this style to.'), 'warning'),
            teamPanel(product),
          ],
        },
        {
          label: text('Коммерция', 'Commercial'),
          fields: [
            { label: text('Коммерческая проекция', 'Commercial projection'), value: product.commercialProjectionId ? `v${product.commercialProjectionVersionNo} · ${statusLabel(product.commercialProjectionStatus)}` : text('Не опубликована', 'Not published') },
          ],
        },
      ],
      actions: [],
    });
  }

  // Worst first: blocked, then not yet assessed, then ready. A person opening a readiness view is
  // looking for what is holding the season up, not for an alphabet.
  function readinessRank(item) {
    const status = item.product?.readinessStatus;
    if (item.risks?.length) return 0;
    if (status === 'blocked') return 1;
    if (status !== 'ready') return 2;
    return 3;
  }
  function projectionRank(item) {
    if (!item.readinessReady) return 0;
    if (!item.projected) return 1;
    return 2;
  }

  function renderStyles() {
    ensureLifecycle();
    const registry = core.buildRegistry(state.workspace);
    const header = odHeader('styles', [
      { id: 'registry', label: text('Реестр моделей', 'Product Master') },
      { id: 'readiness', label: text('Готовность', 'Readiness') },
      { id: 'publication', label: text('Коммерческая проекция', 'Commercial projection') },
      { id: 'exceptions', label: text('Исключения', 'Exceptions') },
    ], [
      { label: text('Модели', 'Styles'), value: registry.summary.total, detail: `${registry.summary.productSkus} ${text('товарных SKU', 'product SKU')}` },
      { label: text('Готовы', 'Ready'), value: registry.summary.ready, detail: `${registry.summary.averageReadiness}% ${text('средняя готовность', 'average readiness')}` },
      { label: text('Проекции', 'Projected'), value: registry.summary.projected, detail: text('опубликованы неизменяемо', 'immutable published') },
      { label: text('Заблокированы', 'Blocked'), value: registry.summary.blocked, detail: `${registry.summary.notAssessed} ${text('не оценено', 'not assessed')}` },
      { label: text('Связка с каталогом', 'Catalogue bridge'), value: registry.summary.bridgeIncomplete, detail: text('неполные связи legacy SKU', 'incomplete legacy SKU links') },
    ], [], text('Поиск модели или версии', 'Search style or version'), null);

    // The two middle tabs are named for a view and were built as exception lists: «Готовность» kept
    // only the styles that are not ready, «Коммерческая проекция» only those without one. With a
    // season in good shape both are empty by construction, so a tab promising a readiness view showed
    // a blank table under the register's own headers — and the screen's own KPI strip said «Готовы 14»
    // three inches above it.
    //
    // They show every style now, ordered so that whatever needs attention is at the top. An empty
    // readiness view then means there are no styles, not that everything is fine, which is the only
    // reading that cannot mislead. «Исключения» stays a filter, because that is what it is called.
    let rows = registry.styles;
    if (header.active === 'readiness') {
      rows = [...rows].sort((left, right) => readinessRank(left) - readinessRank(right)
        || String(left.product.styleCode).localeCompare(String(right.product.styleCode)));
    }
    if (header.active === 'publication') {
      rows = [...rows].sort((left, right) => projectionRank(left) - projectionRank(right)
        || String(left.product.styleCode).localeCompare(String(right.product.styleCode)));
    }
    if (header.active === 'exceptions') rows = rows.filter((item) => item.risks.length);

    const content = odRegistry({
      scope: 'od-styles', filterScope: 'styles', rows, rowKey: (item) => item.product.id,
      statusAccessor: (item) => item.product.lifecycleStatus,
      columns: [
        { key: 'image', label: text('Изображение', 'Image'), className: 'od-thumb-cell', render: productThumb },
        { key: 'styleCode', label: text('Код модели', 'Style code'), value: (item) => item.product.styleCode },
        { key: 'title', label: text('Название', 'Title'), value: (item) => title(item.product) },
        { key: 'version', label: text('Версия', 'Version'), value: (item) => `v${item.product.styleVersionNo || '—'}` },
        { key: 'lifecycle', label: text('Статус', 'Lifecycle'), render: (item) => statusBadge(item.product.lifecycleStatus) },
        { key: 'placeholder', label: text('Плейсхолдер', 'Placeholder'), value: (item) => item.product.placeholderCode || '—', title: (item) => item.product.placeholderNameRu || '' },
        { key: 'buyer', label: text('Байер', 'Buyer'), value: (item) => people(item.product, 'buyer') || '—' },
        { key: 'productManager', label: text('Продуктовый менеджер', 'Product manager'), value: (item) => people(item.product, 'product_manager') || '—' },
        { key: 'fabricManager', label: text('Менеджер по тканям', 'Fabric manager'), value: (item) => people(item.product, 'fabric_manager') || '—' },
        { key: 'technologist', label: text('Технолог', 'Technologist'), value: (item) => people(item.product, 'technologist') || '—' },
        { key: 'fit', label: text('Посадка', 'Fit'), value: (item) => dimension(item.product, 'apparel.fit') || '—' },
        { key: 'novelty', label: text('Новизна', 'Novelty'), value: (item) => dimension(item.product, 'common.novelty') || '—' },
        { key: 'gender', label: text('Пол', 'Gender'), value: (item) => gender(item.product) || '—' },
        { key: 'ageGroup', label: text('Возрастная группа', 'Age group'), value: (item) => dimension(item.product, 'common.age_group') || '—' },
        { key: 'season', label: text('Сезон', 'Season'), value: (item) => dimension(item.product, 'common.operating_season') || '—' },
        { key: 'colorways', label: text('Цвета', 'Colorways'), value: (item) => item.colorwayCount },
        { key: 'productSkus', label: text('Товарные SKU', 'Product SKU'), value: (item) => item.productSkuCount },
        { key: 'readiness', label: text('Готовность', 'Readiness'), render: readiness },
        { key: 'gate', label: text('Проверка', 'Gate'), render: readinessBadge },
        { key: 'projection', label: text('Проекция', 'Projection'), render: projectionBadge },
      ],
      inspector,
    });
    return odPage(text('Канонический Product Master', 'Canonical Product Master'), header, content);
  }

  const previousRenderView = renderView;
  renderView = function renderStyleView() { return state.view === 'styles' ? renderStyles() : previousRenderView(); };
})();
