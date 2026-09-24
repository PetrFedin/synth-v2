(function installShowroomLooks(global) {
  'use strict';

  // The showroom as something a buyer is shown.
  //
  // A showroom used to be a permission: it named a collection, opened, and let an invited shop read a
  // table of articles. That is a price list. A brand presents a season the way it wants it read — a
  // look at a time, with the photograph, the thought behind it and the pieces it is made of — and the
  // buyer orders from what they were shown rather than from a spreadsheet they have to reassemble.
  //
  // The composing surface lives in the brand's showroom card; the same looks are what the buyer meets
  // in their own catalogue, through the invitation that already governs what they may see.
  const ui = global.SynthaShowroomLooks || (global.SynthaShowroomLooks = {
    byShowroom: new Map(), loading: new Set(), errors: new Map(),
  });

  function text(ru, en) { return typeof localText === 'function' ? localText(ru, en) : ru; }
  function title(look) { return I18N.getLocale?.() === 'en' ? (look.titleEn || look.titleRu) : (look.titleRu || look.titleEn); }
  function story(look) { return I18N.getLocale?.() === 'en' ? (look.storyEn || look.storyRu) : (look.storyRu || look.storyEn); }

  function looksOf(showroomId, { refresh = false } = {}) {
    if (!showroomId) return [];
    if (refresh) ui.byShowroom.delete(showroomId);
    if (ui.byShowroom.has(showroomId)) return ui.byShowroom.get(showroomId);
    if (!ui.loading.has(showroomId)) {
      ui.loading.add(showroomId);
      queueMicrotask(async () => {
        try {
          const loaded = await api(`/v2/showrooms/${encodeURIComponent(showroomId)}/looks`);
          ui.byShowroom.set(showroomId, loaded.items || []);
          ui.errors.delete(showroomId);
        } catch (problem) {
          ui.byShowroom.set(showroomId, []);
          ui.errors.set(showroomId, problem?.message || I18N.t('common.requestError'));
        } finally {
          ui.loading.delete(showroomId);
          renderApp();
        }
      });
    }
    return null;
  }

  const LOOK_ERRORS = {
    SHOWROOM_LOOK_SKU_OUTSIDE_COLLECTION: ['Образ может показывать только товары коллекции этого шоурума.', 'A look can only show products from the collection its showroom presents.'],
    SHOWROOM_LOOK_PRODUCTS_INVALID: ['В образе должен быть хотя бы один товар и не больше двадцати четырёх.', 'A look holds between one and twenty-four products.'],
    SHOWROOM_LOOK_SKU_DUPLICATE: ['Один и тот же товар указан в образе дважды.', 'The same product is listed twice in this look.'],
    SHOWROOM_LOOK_IMAGE_INVALID: ['Ссылка на изображение должна начинаться с https://', 'An image link has to start with https://'],
    SHOWROOM_LOOK_POSITION_INVALID: ['Позиция образа — число от 1 до 500.', 'A look sits at a position from 1 to 500.'],
    SHOWROOM_CLOSED: ['Закрытый шоурум больше не составляют.', 'A closed showroom is not composed any further.'],
    SHOWROOM_ACCESS_DENIED: ['Этот шоурум вам не открывали.', 'This showroom has not been shared with you.'],
  };
  function lookError(problem) {
    const pair = LOOK_ERRORS[String(problem?.code || '')];
    return pair ? text(pair[0], pair[1]) : (problem?.message || I18N.t('common.requestError'));
  }

  function collectionSkus(collectionId) {
    return (state.workspace.catalogSkus || []).filter((item) => item.collectionId === collectionId);
  }

  function openLookForm(showroom, look) {
    const skus = collectionSkus(showroom.collectionId);
    if (!skus.length) {
      toast(text('В коллекции этого шоурума ещё нет товаров.', 'The collection this showroom presents has no products yet.'), 'error');
      return;
    }
    const modal = el('dialog', { className: 'od-form-dialog od-look-dialog' });
    const form = el('form', { method: 'dialog' });
    const head = el('header');
    head.append(el('h2', { rawText: look ? text('Изменить образ', 'Edit look') : text('Добавить образ', 'Add a look') }));
    head.append(el('p', { className: 'muted', rawText: text(
      'Образ — это то, что увидит байер: снимок, короткий текст и вещи, из которых он собран.',
      'A look is what the buyer sees: the photograph, a short text, and the pieces it is made of.',
    ) }));

    const field = (labelText, control) => { const label = el('label', { className: 'od-form-field' }); label.append(el('span', { rawText: labelText }), control); return label; };
    const titleRu = el('input', { name: 'titleRu', type: 'text', required: true, minlength: '2', maxlength: '160', value: look?.titleRu || '' });
    const titleEn = el('input', { name: 'titleEn', type: 'text', required: true, minlength: '2', maxlength: '160', value: look?.titleEn || '' });
    const imageUri = el('input', { name: 'imageUri', type: 'url', maxlength: '2000', placeholder: 'https://…', value: look?.imageUri || '' });
    const storyRu = el('textarea', { name: 'storyRu', rows: '3', maxlength: '2000' });
    storyRu.value = look?.storyRu || '';
    const storyEn = el('textarea', { name: 'storyEn', rows: '3', maxlength: '2000' });
    storyEn.value = look?.storyEn || '';

    // Products are picked, not typed: a look may only carry pieces from this collection, and a text
    // box would invite the one mistake the rule exists to prevent.
    const chosen = new Set(look?.skus || []);
    const picker = el('div', { className: 'od-look-picker' });
    skus.forEach((sku) => {
      const row = el('label', { className: 'od-look-pick' });
      const box = el('input', { type: 'checkbox', value: sku.sku });
      box.checked = chosen.has(sku.sku);
      box.addEventListener('change', () => { if (box.checked) chosen.add(sku.sku); else chosen.delete(sku.sku); });
      row.append(box, el('span', { rawText: `${sku.sku} · ${sku.name || ''}` }));
      picker.append(row);
    });

    const error = el('div', { className: 'od-form-error', hidden: true });
    const footer = el('footer');
    const cancel = el('button', { className: 'button secondary', type: 'button', rawText: I18N.t('common.cancel') });
    const submit = el('button', { className: 'button primary', type: 'submit', rawText: look ? I18N.t('common.save') : text('Добавить', 'Add') });
    cancel.addEventListener('click', () => modal.close());
    footer.append(cancel, submit);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      if (!chosen.size) {
        error.textContent = text('Выберите хотя бы один товар.', 'Choose at least one product.');
        error.hidden = false;
        return;
      }
      submit.disabled = true;
      error.hidden = true;
      const payload = {
        titleRu: titleRu.value.trim(), titleEn: titleEn.value.trim(),
        storyRu: storyRu.value.trim() || null, storyEn: storyEn.value.trim() || null,
        imageUri: imageUri.value.trim() || null, skus: [...chosen],
      };
      try {
        if (look) await mutate(`/v2/showroom-looks/${encodeURIComponent(look.id)}`, { expectedVersion: look.version, ...payload }, 'PATCH');
        else await mutate(`/v2/showrooms/${encodeURIComponent(showroom.id)}/looks`, payload);
        modal.close();
        looksOf(showroom.id, { refresh: true });
        toast(look ? text('Образ изменён.', 'The look is updated.') : text('Образ добавлен.', 'The look is added.'), 'success');
      } catch (problem) {
        error.textContent = lookError(problem);
        error.hidden = false;
      } finally {
        if (submit.isConnected) submit.disabled = false;
      }
    });

    form.append(head, field(text('Название RU', 'Title RU'), titleRu), field(text('Название EN', 'Title EN'), titleEn),
      field(text('Ссылка на снимок', 'Image link'), imageUri), field(text('Текст RU', 'Story RU'), storyRu),
      field(text('Текст EN', 'Story EN'), storyEn), field(text('Вещи в образе', 'Pieces in the look'), picker), error, footer);
    modal.addEventListener('close', () => modal.remove(), { once: true });
    modal.append(form);
    document.body.append(modal);
    modal.showModal();
  }

  async function removeLook(showroom, look) {
    const accepted = await confirmAction({
      title: text('Убрать образ', 'Remove look'),
      question: text(`«${title(look)}» исчезнет из шоурума. Товары останутся в коллекции.`, `"${title(look)}" leaves the showroom. The products stay in the collection.`),
      confirmLabel: text('Убрать', 'Remove'),
      danger: true,
    });
    if (!accepted) return;
    try {
      await mutate(`/v2/showroom-looks/${encodeURIComponent(look.id)}`, {}, 'DELETE');
      looksOf(showroom.id, { refresh: true });
      toast(text('Образ убран.', 'The look is removed.'), 'success');
    } catch (problem) { toast(lookError(problem), 'error'); }
  }

  function lookCard(showroom, look, { manage }) {
    const card = el('article', { className: 'od-look-card' });
    const figure = el('div', { className: 'od-look-figure' });
    if (look.imageUri) {
      const image = el('img', { src: look.imageUri, alt: title(look), loading: 'lazy', decoding: 'async' });
      // A link that does not load must not leave a broken icon in the middle of a presentation.
      image.addEventListener('error', () => { if (figure.isConnected) figure.replaceChildren(el('span', { className: 'od-look-placeholder', rawText: String(look.position) })); }, { once: true });
      figure.append(image);
    } else figure.append(el('span', { className: 'od-look-placeholder', rawText: String(look.position) }));
    const body = el('div', { className: 'od-look-body' });
    body.append(el('p', { className: 'od-look-index', rawText: `${text('Образ', 'Look')} ${look.position}` }));
    body.append(el('h3', { rawText: title(look) }));
    if (story(look)) body.append(el('p', { className: 'od-look-story', rawText: story(look) }));
    const pieces = el('ul', { className: 'od-look-pieces' });
    (look.products || []).forEach((product) => {
      const item = el('li');
      item.append(el('strong', { rawText: product.name || product.sku }));
      const facts = [product.sku];
      if (Number.isFinite(Number(product.wholesalePrice))) facts.push(`${I18N.formatNumber(Number(product.wholesalePrice), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${product.currency || ''}`.trim());
      if (product.minimumOrderQuantity) facts.push(`${text('мин.', 'min')} ${product.minimumOrderQuantity}`);
      item.append(el('span', { className: 'muted', rawText: facts.join(' · ') }));
      pieces.append(item);
    });
    body.append(pieces);
    if (manage) {
      const actions = el('div', { className: 'od-inline-actions' });
      const edit = el('button', { className: 'button small', type: 'button', rawText: text('Изменить', 'Edit') });
      edit.addEventListener('click', () => openLookForm(showroom, look));
      const drop = el('button', { className: 'button small danger', type: 'button', rawText: text('Убрать', 'Remove') });
      drop.addEventListener('click', () => { void removeLook(showroom, look); });
      actions.append(edit, drop);
      body.append(actions);
    }
    card.append(figure, body);
    return card;
  }

  function lookPanel(showroom, { manage }) {
    const wrap = document.createDocumentFragment();
    if (manage) {
      const actions = el('div', { className: 'od-inline-actions' });
      const add = el('button', { className: 'button small primary', type: 'button', rawText: text('Добавить образ', 'Add a look') });
      add.addEventListener('click', () => openLookForm(showroom, null));
      actions.append(add);
      wrap.append(actions);
    }
    const looks = looksOf(showroom.id);
    if (ui.errors.has(showroom.id)) { wrap.append(notice(ui.errors.get(showroom.id), 'error')); return wrap; }
    if (looks === null) { wrap.append(notice(text('Загрузка образов…', 'Loading looks…'))); return wrap; }
    if (!looks.length) {
      wrap.append(notice(manage
        ? text('В шоуруме ещё нет образов. Байер увидит только таблицу артикулов — а видеть он должен коллекцию.', 'This showroom has no looks yet. A buyer will see a table of articles, when what they should see is the collection.')
        : text('Бренд ещё не собрал показ для этого шоурума.', 'The brand has not composed this showroom yet.')));
      return wrap;
    }
    const grid = el('div', { className: 'od-look-grid' });
    looks.forEach((look) => grid.append(lookCard(showroom, look, { manage })));
    wrap.append(grid);
    return wrap;
  }

  global.SynthaShowroomLooks.panel = lookPanel;
  global.SynthaShowroomLooks.refresh = (showroomId) => looksOf(showroomId, { refresh: true });
})(window);
