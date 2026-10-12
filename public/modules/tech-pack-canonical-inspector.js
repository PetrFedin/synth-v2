(function installTechPackCanonicalInspector(global) {
  'use strict';

  const results = Object.create(null);
  const errors = Object.create(null);
  let loadingCode = '';
  // Invalidation also revokes in-flight UI reads (e.g. after a tenant switch).
  let requestEpoch = 0;
  const blockers = Object.freeze({
    CANONICAL_IDENTITY_MISSING: ['Нет точной версии изделия, цвета или размерной системы.', 'Exact style, colour or size scale identity is missing.'],
    PUBLISHED_CANONICAL_BOM_REQUIRED: ['Не найдена опубликованная каноническая BOM.', 'A published canonical BOM is missing.'],
    PUBLISHED_CANONICAL_MEASUREMENT_REQUIRED: ['Не найдена опубликованная размерная таблица.', 'A published canonical measurement chart is missing.'],
    APPROVED_CANONICAL_PPS_REQUIRED: ['Нет утверждённого предсерийного образца.', 'An approved pre-production sample is missing.'],
    PPS_SUPPLIER_MISMATCH: ['Фабрика образца не совпадает с фабрикой техпака.', 'The pre-production sample belongs to another supplier.'],
    CANONICAL_BRAND_MISMATCH: ['Неверная принадлежность изделия бренду.', 'Product Identity belongs to a different brand.'],
    BOM_PRODUCT_SKU_MISMATCH: ['BOM относится к другому ProductSku.', 'The BOM belongs to a different ProductSku.'],
    PPS_PRODUCT_SKU_MISMATCH: ['Образец относится к другому ProductSku.', 'The sample belongs to a different ProductSku.'],
    MEASUREMENT_IDENTITY_MISMATCH: ['Таблица мер относится к другой версии изделия.', 'Measurement Chart belongs to another product version.'],
  });
  const text = (ru, en) => typeof localText === 'function' ? localText(ru, en) : ru;
  function element(tag, className, label) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (label !== undefined) item.textContent = String(label);
    return item;
  }
  function detail(label, value) {
    const group = element('div');
    group.append(element('dt', '', label), element('dd', '', value == null || value === '' ? '—' : value));
    return group;
  }
  function invalidate(code) {
    // A pending response must not rehydrate data after a reload, revision or tenant switch.
    // Clear the active request lease so a fresh user check can start immediately.
    requestEpoch += 1;
    loadingCode = '';
    if (typeof code === 'string') { delete results[code]; delete errors[code]; }
    else { for (const key of Object.keys(results)) delete results[key]; for (const key of Object.keys(errors)) delete errors[key]; }
  }
  const identityKeys = ['productSkuId', 'styleVersionId', 'colorwayId', 'sizeScaleVersionId'];
  const dependencyKeys = ['bom', 'measurement', 'sample'];
  const identifier = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 160;
  const version = value => Number.isInteger(value) && value >= 1 && value <= 2147483647;
  const objectWithKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
  function validResponse(result, code, brandId) {
    if (!objectWithKeys(result, ['techPackCode', 'brandId', 'eligible', 'blockers', 'identity', 'dependencies']) ||
        result.techPackCode !== code || !identifier(result.brandId) ||
        (brandId !== undefined && result.brandId !== brandId) || typeof result.eligible !== 'boolean' ||
        !Array.isArray(result.blockers) || !result.blockers.every(reason => typeof reason === 'string' && reason.trim()) ||
        new Set(result.blockers).size !== result.blockers.length ||
        result.eligible !== (result.blockers.length === 0) ||
        !objectWithKeys(result.identity, identityKeys) || !objectWithKeys(result.dependencies, dependencyKeys)) return false;
    if (!identityKeys.every(key => result.identity[key] === null ? !result.eligible : identifier(result.identity[key]))) return false;
    return dependencyKeys.every(key => {
      const source = result.dependencies[key];
      if (source === null) return !result.eligible;
      const idKey = key === 'sample' ? 'code' : 'id';
      return objectWithKeys(source, [idKey, 'version']) && identifier(source[idKey]) &&
        (key !== 'sample' || /^[A-Z0-9][A-Z0-9._/-]{2,63}$/.test(source.code)) &&
        (source.version === null ? !result.eligible : version(source.version));
    });
  }
  async function check(code, brandId) {
    if (loadingCode || typeof code !== 'string' || !code) return;
    const epoch = ++requestEpoch;
    loadingCode = code;
    // A past green result must not remain visible while re-verification is pending.
    delete results[code];
    delete errors[code];
    if (state.view === 'tech-packs') renderApp();
    try {
      const result = await api(`/v2/tech-packs/${encodeURIComponent(code)}/canonical-preflight`);
      if (epoch !== requestEpoch) return;
      if (!validResponse(result, code, brandId)) {
        throw new Error('TECH_PACK_PREFLIGHT_RESPONSE_INVALID');
      }
      results[code] = Object.freeze({ result, checkedAt: new Date().toISOString() });
    } catch (error) {
      if (epoch !== requestEpoch) return;
      delete results[code];
      errors[code] = error?.message || text('Не удалось проверить источники.', 'Could not verify source dependencies.');
    } finally {
      if (epoch === requestEpoch) {
        loadingCode = '';
        if (state.view === 'tech-packs') renderApp();
      }
    }
  }
  function render(pack) {
    const code = pack.techPackCode;
    const stored = results[code];
    const record = stored && stored.result.brandId === pack.brandId ? stored : undefined;
    const error = errors[code], loading = loadingCode === code;
    const section = element('section', 'tech-pack-card syntha-canonical-evidence');
    section.dataset.odsPart = 'card';
    const heading = element('div', 'syntha-canonical-heading');
    const intro = element('div');
    intro.append(element('h3', '', text('Канонические источники', 'Canonical source verification')),
      element('p', 'muted', text('ProductSku, BOM, измерения и одобренный образец по данным PostgreSQL.', 'ProductSku, BOM, measurements and approved sample from PostgreSQL.')));
    const button = element('button', 'secondary', loading ? text('Проверка…', 'Checking…') :
      record ? text('Проверить снова', 'Recheck sources') : text('Проверить источники', 'Check sources'));
    button.type = 'button';
    button.disabled = Boolean(loadingCode);
    button.addEventListener('click', () => { void check(code, pack.brandId); });
    heading.append(intro, button);
    section.append(heading);
    if (error) {
      const alert = element('p', 'tech-pack-error', error);
      alert.setAttribute('role', 'alert');
      section.append(alert);
    }
    if (record) {
      const source = record.result;
      const stamp = new Date(record.checkedAt);
      const timestamp = Number.isFinite(stamp.getTime()) ? stamp.toLocaleString(typeof I18N !== 'undefined' ? I18N.localeTag() : 'ru-RU') : '';
      const status = element('div', `syntha-canonical-status ${source.eligible ? 'ready' : 'blocked'}`);
      status.append(element('strong', '', source.eligible ? text('Источники согласованы', 'Sources are consistent') : text('Требуются исправления', 'Corrections required')),
        element('span', '', `${text('Проверено', 'Checked')}: ${timestamp}`));
      section.append(status);
      if (source.blockers.length) {
        const list = element('ul', 'syntha-canonical-blockers');
        for (const reason of source.blockers) {
          list.append(element('li', '', blockers[reason] ? text(...blockers[reason]) :
            text(`Проверить: ${reason}`, `Review: ${reason}`)));
        }
        section.append(list);
      }
      const identity = source.identity, dependency = source.dependencies;
      const facts = element('dl', 'tech-pack-facts');
      const versioned = (item) => item ? `${item.id ?? item.code} · v${item.version ?? '—'}` : '—';
      facts.append(detail('ProductSku', identity.productSkuId), detail('StyleVersion', identity.styleVersionId),
        detail('Colorway', identity.colorwayId), detail('SizeScaleVersion', identity.sizeScaleVersionId),
        detail('BOM', versioned(dependency.bom)),
        detail(text('Таблица мер', 'Measurement chart'), versioned(dependency.measurement)),
        detail(text('Предсерийный образец', 'Pre-production sample'), versioned(dependency.sample)));
      section.append(facts);
    } else if (!error) {
      section.append(element('p', 'muted', loading ? text('Сверяем точные версии источников…', 'Checking exact source versions…') :
        text('Проверка ещё не запускалась.', 'Source verification has not been run yet.')));
    }
    section.append(element('p', 'syntha-canonical-disclaimer', text(
      'Это диагностика на момент проверки, не разрешение на выпуск. Команда выпуска должна повторно проверить версии в транзакции.',
      'Point-in-time diagnostic only, not permission to issue. The issuing transaction must revalidate source versions.',
    )));
    return section;
  }
  global.SynthaTechPackCanonicalInspector = Object.freeze({ render, check, invalidate });
})(window);
