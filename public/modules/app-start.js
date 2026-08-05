window.I18N = window.SynthaI18n;

(function installStrictLocaleAudit(global) {
  'use strict';

  const RU = Object.freeze({
    fabric: 'Ткань', Fabric: 'Ткань', trim: 'Фурнитура', Trim: 'Фурнитура', packaging: 'Упаковка', Packaging: 'Упаковка', other: 'Прочее', Other: 'Прочее',
    metre: 'метр', Metre: 'Метр', kilogram: 'килограмм', Kilogram: 'Килограмм', piece: 'штука', Piece: 'Штука', yard: 'ярд', Yard: 'Ярд',
    neutral: 'Нейтральный', Neutral: 'Нейтральный', success: 'Успешно', Success: 'Успешно', warning: 'Предупреждение', Warning: 'Предупреждение', danger: 'Опасность', Danger: 'Опасность',
    'In production': 'В производстве', 'Received / review': 'Получен / на проверке', 'Pre-production': 'Предсерийный', 'Size set': 'Размерный ряд', Proto: 'Прототип', Fit: 'Примерочный', Sales: 'Продажный', Photo: 'Фото',
    Incoterm: 'Условие поставки', Incoterms: 'Условия поставки', Currency: 'Валюта', Categories: 'Категории', Country: 'Страна', Supplier: 'Поставщик',
    Quantity: 'Количество', Delivery: 'Поставка', Quotations: 'Котировки', Production: 'Производство', Registry: 'Реестр', Matrix: 'Матрица', Exceptions: 'Исключения', Inventory: 'Остатки',
    Readiness: 'Готовность', Risk: 'Риск', Status: 'Статус', Version: 'Версия', Lines: 'Строки', Materials: 'Материалы', Total: 'Итого', Labor: 'Труд', Overhead: 'Накладные расходы', Logistics: 'Логистика',
    Notes: 'Комментарий', Reason: 'Причина', Brand: 'Бренд', Code: 'Код', Name: 'Название', Type: 'Тип', Unit: 'Единица учёта', Composition: 'Состав', Color: 'Цвет',
    Draft: 'Черновик', Published: 'Опубликовано', Approved: 'Одобрено', Rejected: 'Отклонено', Cancelled: 'Отменено', Ready: 'Готово', Open: 'Открыто', Closed: 'Закрыто',
    Loading: 'Загрузка', Refresh: 'Обновить', Save: 'Сохранить', Edit: 'Редактировать', Publish: 'Опубликовать', Create: 'Создать', Search: 'Поиск',
    Portfolio: 'Портфель', Timeline: 'Календарный план', Campaign: 'Кампания', Collection: 'Коллекция', Collections: 'Коллекции', Season: 'Сезон', Period: 'Период',
  });
  const EN = Object.freeze(Object.fromEntries(Object.entries(RU).map(([en, ru]) => [ru, en])));
  const ABBREVIATIONS = Object.freeze({
    EXW: ['Самовывоз с предприятия', 'Ex Works'], FCA: ['Передача перевозчику', 'Free Carrier'], FOB: ['Свободно на борту', 'Free on Board'],
    CIF: ['Стоимость, страхование и фрахт', 'Cost, Insurance and Freight'], DAP: ['Поставка в месте назначения', 'Delivered at Place'], DDP: ['Поставка с оплатой пошлин', 'Delivered Duty Paid'],
    EUR: ['Евро', 'Euro'], USD: ['Доллар США', 'United States Dollar'], RUB: ['Российский рубль', 'Russian Ruble'], CNY: ['Китайский юань', 'Chinese Yuan'], GBP: ['Фунт стерлингов', 'Pound Sterling'],
  });
  const SCOPE = '.sidebar,.topbar,.workspace-content,.dialog-host,.dialog,.modal,[role="dialog"]';
  let scheduled = false;

  function locale() { return global.SynthaI18n?.getLocale?.() === 'en' ? 'en' : 'ru'; }
  function preserveWhitespace(original, replacement) {
    const leading = original.match(/^\s*/)?.[0] || '';
    const trailing = original.match(/\s*$/)?.[0] || '';
    return `${leading}${replacement}${trailing}`;
  }
  function translateExact(value) {
    const dictionary = locale() === 'en' ? EN : RU;
    return dictionary[value] || value;
  }
  function abbreviationTitle(value) {
    const active = locale() === 'en' ? 1 : 0;
    const matches = [...new Set(String(value).match(/\b(?:EXW|FCA|FOB|CIF|DAP|DDP|EUR|USD|RUB|CNY|GBP)\b/g) || [])];
    return matches.map((code) => `${code}: ${ABBREVIATIONS[code][active]}`).join('\n');
  }
  function audit(root = document) {
    const scopes = [];
    if (root.nodeType === Node.ELEMENT_NODE && root.matches?.(SCOPE)) scopes.push(root);
    root.querySelectorAll?.(SCOPE).forEach((node) => scopes.push(node));
    for (const scope of scopes) {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || !node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
          if (parent.closest('script,style,textarea,input,select,option,[contenteditable="true"],.od13-abbr')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const original = node.nodeValue || '';
        const value = original.trim();
        const translated = translateExact(value);
        if (translated !== value) node.nodeValue = preserveWhitespace(original, translated);
        const parent = node.parentElement;
        const title = abbreviationTitle(translated);
        if (parent && title && !parent.classList.contains('od13-abbr')) {
          parent.title = title;
          parent.setAttribute('aria-label', `${translated}. ${title.replaceAll('\n', '. ')}`);
        }
      }
    }
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    global.queueMicrotask(() => { scheduled = false; audit(document); });
  }

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.addedNodes.length)) schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  global.addEventListener('syntha:locale-changed', schedule);
  global.SynthaStrictLocaleAudit = Object.freeze({ audit, schedule });

  Promise.resolve(boot()).finally(schedule);
})(window);
