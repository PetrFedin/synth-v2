(function initializeCommercialPublicationActions(global) {
  'use strict';

  // Публикация коммерческого снимка и открытие каталога байеру.
  //
  // Обе операции существовали только как шаги скрипта. На сервере маршруты были — и на публикацию,
  // и на каталог, — а в интерфейсе от них оставалось одно чтение: линшит показывал уже
  // опубликованный снимок, но создать его человеком было нельзя. Измерено грепом по
  // `public/modules/*.js`: ни одной мутации на `commercial-publications` и ни одной на
  // `buyer-catalogs`. Человек доходил до цикла в шоуруме и дальше не мог ничего — не потому, что
  // ему не положено, а потому, что кнопки не было.
  //
  // Каждое действие живёт на своём экране, у той сущности, о которой оно решает: снимок — у
  // коллекции, потому что публикуется именно её ассортимент; каталог — у доступов шоурума, потому
  // что каталог всегда чей-то, и «чей» определяется принятым приглашением.

  const CATALOGS = { byAccess: new Map(), loading: new Set() };

  function text(ru, en) { return global.odText ? global.odText(ru, en) : ru; }

  // Проекция отличается от проекции кодом модели, названием и номером версии. Идентификатор для
  // человека не значит ничего, а выбирать ему.
  function projectionLabel(projection) {
    const title = I18N.getLocale() === 'en'
      ? (projection.titleEn || projection.titleRu)
      : (projection.titleRu || projection.titleEn);
    return [projection.styleCode, title, `v${projection.versionNo}`].filter(Boolean).join(' · ');
  }

  function publicationLabel(publication) {
    const style = (publication.styles || [])[0] || {};
    const title = I18N.getLocale() === 'en' ? (style.titleEn || style.titleRu) : (style.titleRu || style.titleEn);
    const lines = (publication.lines || []).length;
    return [title, `${lines} SKU`, formatDate(publication.publishedAt)].filter(Boolean).join(' · ');
  }

  // Что коллекция может опубликовать, спрашивается у сервера одним чтением: правило — «проекция
  // опубликована и её версия модели назначена в коллекцию» — принадлежит домену, а не браузеру.
  async function publicationForm(collection) {
    const loaded = await api(`/v2/collections/${encodeURIComponent(collection.id)}/publishable-projections`);
    const projections = loaded.items || [];
    if (!projections.length) {
      toast(text(
        'У коллекции нет опубликованных коммерческих проекций. Сначала оцените готовность версии модели и опубликуйте проекцию.',
        'This collection has no published commercial projections. Assess a Style Version readiness and publish a projection first.',
      ), 'error');
      return;
    }
    openForm(text('Опубликовать коммерческий снимок', 'Publish a commercial snapshot'), [
      selectDef('commercialProjectionId', text('Коммерческая проекция', 'Commercial projection'), projections, projectionLabel),
    ], values => mutate('/v2/commercial-publications', {
      collectionId: collection.id,
      commercialProjectionId: values.commercialProjectionId,
    }));
  }

  // Каталог байера собирается из снимка коллекции и принятого приглашения. Оба списка читаются
  // здесь, а не угадываются: снимки — у коллекции шоурума, магазины — у принятых приглашений.
  async function buyerCatalogForm(showroom) {
    const accepted = acceptedAccess(showroom);
    const loaded = await api(`/v2/collections/${encodeURIComponent(showroom.collectionId)}/commercial-publications?limit=50`);
    const publications = (loaded.items || []).filter(item => item.status === 'published');
    if (!publications.length) {
      toast(text(
        'У коллекции этого шоурума нет коммерческого снимка. Опубликуйте снимок на экране коллекции.',
        'The collection this showroom presents has no commercial snapshot. Publish one on the collection screen.',
      ), 'error');
      return;
    }
    openForm(text('Открыть каталог байеру', 'Open the catalogue to a buyer'), [
      selectDef('publicationId', text('Коммерческий снимок', 'Commercial snapshot'), publications, publicationLabel),
      selectDef('shopId', text('Магазин', 'Shop'), accepted.map(invitation => ({ id: invitation.shopId, name: orgName(invitation.shopId) }))),
    ], async values => {
      const published = await mutate(`/v2/commercial-publications/${encodeURIComponent(values.publicationId)}/buyer-catalogs`, {
        showroomId: showroom.id,
        shopId: values.shopId,
      });
      // Найдено живьём: каталог создавался, форма говорила «Изменения сохранены», а в строке
      // доступа оставалась прежняя дата: кэш переживал перезагрузку рабочего пространства, потому
      // что каталоги читаются не в составе него. Собственная запись обязана его сбросить — иначе человек
      // видит подтверждение и тут же доказательство того, что ничего не произошло.
      forget(showroom.id, values.shopId);
      return published;
    });
  }

  function acceptedAccess(showroom) {
    return (state.workspace.invitations || []).filter(item => item.showroomId === showroom.id && item.status === 'accepted');
  }

  function note(message) {
    return el('p', { className: 'od-action-note', rawText: message });
  }

  // Кнопка на коллекции. Способность та же, что проверяет сам маршрут публикации — `CATALOG_MANAGE`
  // у бренда коллекции: список, который видно, но из которого нельзя выбрать, хуже пустого.
  function collectionAction(collection) {
    const caps = global.SynthaUiCapabilities;
    if (!caps.hasForOrganisation(state.workspace, collection.brandId, caps.CAPABILITIES.CATALOG_MANAGE)) return null;
    if (collection.status !== 'published') return null;
    return actionButton(text('Опубликовать снимок', 'Publish snapshot'), () => publicationForm(collection));
  }

  // Кнопка на доступах шоурума — и объяснение, когда её нет. Отсутствующий орган управления обязан
  // сказать, почему он отсутствует: иначе человек, только что пригласивший магазин, смотрит на
  // таблицу приглашений и не знает, чего ждёт.
  function accessAction(showroom) {
    const caps = global.SynthaUiCapabilities;
    if (!caps.hasForOrganisation(state.workspace, showroom.brandId, caps.CAPABILITIES.SHOWROOM_MANAGE)) return null;
    if (showroom.status !== 'open') {
      return note(text(
        'Каталог открывается из работающего шоурума — сначала откройте показ.',
        'A catalogue is opened from a running showroom — open the presentation first.',
      ));
    }
    if (!acceptedAccess(showroom).length) {
      return note(text(
        'Каталог всегда чей-то: он открывается магазину, принявшему приглашение. Пока принятых приглашений нет.',
        'A catalogue always belongs to someone: it is opened to a shop that accepted its invitation. None has been accepted yet.',
      ));
    }
    return actionButton(text('Открыть каталог байеру', 'Open catalogue to buyer'), () => buyerCatalogForm(showroom));
  }

  // Что получилось на экране. Опубликованный каталог виден магазину, но у бренда о нём до сих пор
  // не было ни строки: человек нажимал кнопку, получал «сохранено» и смотрел на ту же таблицу.
  // Каталог читается по доступу — по паре «шоурум и магазин», — поэтому и кэш устроен по паре.
  function catalogFor(showroomId, shopId, { onLoaded } = {}) {
    const key = `${showroomId}:${shopId}`;
    if (CATALOGS.byAccess.has(key)) return CATALOGS.byAccess.get(key);
    if (!CATALOGS.loading.has(key)) {
      CATALOGS.loading.add(key);
      queueMicrotask(async () => {
        try {
          const loaded = await api(`/v2/showrooms/${encodeURIComponent(showroomId)}/buyer-catalog?shopId=${encodeURIComponent(shopId)}`);
          CATALOGS.byAccess.set(key, loaded || null);
        } catch (problem) {
          // Каталога может просто не быть, и это не сбой: пустое значение вместо отсутствующего,
          // иначе экран просил бы его снова и снова.
          CATALOGS.byAccess.set(key, null);
        } finally {
          CATALOGS.loading.delete(key);
          if (typeof onLoaded === 'function') onLoaded();
        }
      });
    }
    return null;
  }

  function catalogCell(showroom, invitation, { onLoaded } = {}) {
    if (invitation.status !== 'accepted') return '—';
    const catalog = catalogFor(showroom.id, invitation.shopId, { onLoaded });
    if (!catalog) return '—';
    return `${(catalog.lines || []).length} SKU · ${formatDate(catalog.publishedAt)}`;
  }

  function forget(showroomId, shopId) {
    const key = `${showroomId}:${shopId}`;
    CATALOGS.byAccess.delete(key);
    CATALOGS.loading.delete(key);
  }

  function reset() {
    CATALOGS.byAccess.clear();
    CATALOGS.loading.clear();
  }

  global.SynthaCommercialPublication = Object.freeze({
    publicationForm, buyerCatalogForm, collectionAction, accessAction, catalogCell, forget, reset,
  });
})(window);
