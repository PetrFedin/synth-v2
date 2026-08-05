(function installOmnidataV14ComponentSystem(global){
  'use strict';

  const BUILD='visual-20260805-14-components-2';
  const COMPONENTS=Object.freeze({
    surface:'.card,.section,.od-section,.sourcing-panel,.measurement-matrix-panel,.bom-cost-card,.ls9-master',
    sectionHead:'.section-toolbar,.od-section-head,.card-header,.panel-header,.bom-section-header,.measurement-section-header,.sample-section-header,.sourcing-section-header',
    toolbar:'.toolbar:not(.view-toolbar):not(.section-toolbar),.bom-toolbar,.measurement-toolbar,.sample-toolbar,.sourcing-toolbar-actions,.table-toolbar',
    filterbar:'.od-commandbar,.ls9-commandbar,.sample-filters,.sourcing-toolbar,.toolbar-filters,.filter-row,.filters,.bom-filters,.measurement-filters,.sample-toolbar-filters,.sourcing-filters',
    tabs:'.od-tabs,.ls9-tabs,.planning-tabs,.styles-tabs,.materials-tabs,.bom-tabs,.measurement-tabs,.sample-tabs,.sourcing-tabs,.inspector-tabs,.ls9-inspector-tabs,.od-inspector-tabs',
    tab:'.od-tab,.ls9-tab,.planning-tab,.styles-tab,.materials-tab,.bom-tab,.measurement-tab,.sample-tab,.sourcing-tabs>button,.inspector-tabs>button,.ls9-inspector-tabs>button,.od-inspector-tabs>*',
    metrics:'.od-metrics,.ls9-metrics,.bom-kpis,.measurement-kpis,.sample-kpis,.sourcing-kpis,.kpi-grid',
    metric:'.od-metric,.ls9-metric,.bom-kpi,.measurement-kpi,.sample-kpi,.sourcing-kpi,.card.kpi',
    masterDetail:'.od-master-detail,.ls9-layout,.bom-layout,.measurement-layout,.sample-layout,.sourcing-grid',
    tableWrap:'.od-table-wrap,.ls9-table-wrap,.bom-table-wrap,.measurement-table-wrap,.measurement-matrix-panel,.sample-table-wrap,.sourcing-table-wrap,.od-mini-table-wrap,.table-wrap',
    table:'.od-table,.ls9-table,.bom-table,.measurement-table,.measurement-matrix,.sample-table,.sourcing-table,.od-mini-table,.data-table',
    inspector:'.od-inspector,.ls9-inspector,.bom-inspector,.measurement-inspector,.sample-inspector,.sourcing-inspector,.details-panel',
    definitionGrid:'.od-definition-grid,.bom-summary,.measurement-summary,.sample-summary,.sourcing-details,.ls9-info-grid,.ls9-inspector-summary',
    definitionItem:'.od-definition-item,.bom-summary>div,.measurement-summary>div,.sample-summary>div,.sourcing-details>div,.ls9-info-item,.ls9-inspector-summary>div',
    entity:'.entity,.partner-card,.order-card,.selection-card,.notification-card,.calendar-card',
    empty:'.empty,.od-empty,.ls9-empty,.empty-state,.no-data',
    status:'.badge,.od-status,.bom-badge,.measurement-badge,.sample-badge,.sourcing-badge,.ls9-status,.material-state,.status-badge'
  });
  const STRICT_PAIRS=Object.freeze([
    ['Операционная система моды','Fashion Operating System'],
    ['Рабочее пространство','Workspace'],
    ['PLM / Планирование','PLM / Planning'],
    ['PLM / Проектирование продукта','PLM / Product Design'],
    ['PLM / Материалы и фурнитура','PLM / Materials and Trims'],
    ['PLM / BOM и себестоимость','PLM / BOM and Costing'],
    ['PLM / Посадка и градация','PLM / Fit and Grading'],
    ['PLM / Управление образцами','PLM / Sample Management'],
    ['PLM / Закупки и производство','PLM / Sourcing and Production'],
    ['Листы коллекций','Linesheets'],
    ['Лист коллекции','Linesheet'],
    ['Нет листа коллекции','No linesheet'],
    ['Лист коллекции не открыт','Linesheet is not open'],
    ['Календарный план','Timeline'],
    ['Градация размеров','Grading'],
    ['Посадка и градация','Fit and Grading'],
    ['Управление образцами','Sample Management'],
    ['Размещение производства','Production Allocation'],
    ['Материалы и фурнитура','Materials and Trims'],
    ['Проектирование продукта','Product Design'],
    ['Закупки и производство','Sourcing and Production'],
    ['Спецификация и себестоимость','BOM and Costing'],
    ['Размерные таблицы','Measurement Charts'],
    ['Запросы коммерческих предложений','Requests for Quotation'],
    ['Сравнение предложений','Bid Comparison'],
    ['Срок выполнения','Lead time'],
    ['Цена за единицу','Unit cost'],
    ['Артикул поставщика','Supplier reference'],
    ['Доступное количество','Available quantity'],
    ['Структура затрат','Cost structure'],
    ['Снимок стоимости','Cost snapshot'],
    ['Покупатель / Ретейлер','Buyer / Retailer'],
    ['Дата обновления','Updated'],
    ['Записей на странице','Rows per page'],
    ['Предыдущая страница','Previous page'],
    ['Следующая страница','Next page'],
    ['Дополнительные действия','More actions'],
    ['Действия строки','Row actions'],
    ['Связанные данные','Related data'],
    ['Примерный режим','Sample mode'],
    ['Все листы','All linesheets'],
    ['Главная','Home'],
    ['Карта связей','Relationship map'],
    ['Матрица ролей','Role matrix'],
    ['История изменений','Change history'],
    ['Обзор','Overview'],
    ['Товары','Products'],
    ['Покупатели','Buyers'],
    ['Статистика','Statistics'],
    ['История','History'],
    ['Описание','Description'],
    ['Ассортимент','Assortment'],
    ['Поделиться','Share'],
    ['Открыть лист','Open linesheet'],
    ['Фильтры','Filters'],
    ['Поиск','Search'],
    ['Статус','Status'],
    ['Сезон','Season'],
    ['Коллекция','Collection'],
    ['Коллекции','Collections'],
    ['Кампания','Campaign'],
    ['Кампании','Campaigns'],
    ['Поставщик','Supplier'],
    ['Поставщики','Suppliers'],
    ['Котировки','Quotations'],
    ['Производство','Production'],
    ['Готовность','Readiness'],
    ['Риск','Risk'],
    ['Риски','Risks'],
    ['Исключения','Exceptions'],
    ['Действия','Actions'],
    ['Просмотры','Views'],
    ['Список','List'],
    ['Сетка','Grid'],
    ['Создать','Create'],
    ['Сохранить','Save'],
    ['Редактировать','Edit'],
    ['Опубликовать','Publish'],
    ['Открыть','Open'],
    ['Закрыть','Close'],
    ['Обновить','Refresh'],
    ['Загрузить ещё','Load more'],
    ['Повторить','Retry'],
    ['Загрузка…','Loading…'],
    ['Черновик','Draft'],
    ['Опубликовано','Published'],
    ['Одобрено','Approved'],
    ['Отклонено','Rejected'],
    ['Отменено','Cancelled'],
    ['Готово','Ready'],
    ['Активна','Active'],
    ['Отправлена','Sent'],
    ['Просмотрена','Viewed'],
    ['Ткань','Fabric'],
    ['Фурнитура','Trim'],
    ['Упаковка','Packaging'],
    ['Прочее','Other'],
    ['Условие поставки','Incoterm'],
    ['Условия поставки','Incoterms'],
    ['Электронная почта','Email'],
    ['Валюта','Currency'],
    ['Категории','Categories'],
    ['Страна','Country'],
    ['Количество','Quantity'],
    ['Поставка','Delivery'],
    ['Комментарий','Notes'],
    ['Название','Name'],
    ['Тип','Type'],
    ['Цвет','Color'],
    ['Единица учёта','Unit'],
    ['Состав','Composition'],
    ['Остались черновики SKU','Draft SKU remain'],
    ['Нет SKU','No SKU']
  ]);
  const RU_EXACT=Object.freeze(Object.fromEntries(STRICT_PAIRS.map(([ru,en])=>[en,ru])));
  const EN_EXACT=Object.freeze(Object.fromEntries(STRICT_PAIRS.map(([ru,en])=>[ru,en])));
  const ABBREVIATIONS=Object.freeze({
    PLM:['Управление жизненным циклом продукта','Product Lifecycle Management'],
    BOM:['Спецификация материалов и компонентов','Bill of Materials'],
    SKU:['Единица складского учёта','Stock Keeping Unit'],
    POM:['Точка измерения','Point of Measure'],
    MOQ:['Минимальная партия заказа','Minimum Order Quantity'],
    ATS:['Доступно к продаже','Available to Sell'],
    RFQ:['Запрос коммерческого предложения','Request for Quotation'],
    PO:['Заказ на закупку','Purchase Order'],
    ERP:['Система управления ресурсами предприятия','Enterprise Resource Planning'],
    WMS:['Система управления складом','Warehouse Management System'],
    PIM:['Система управления информацией о товарах','Product Information Management'],
    OMS:['Система управления заказами','Order Management System'],
    QC:['Контроль качества','Quality Control'],
    QMS:['Система управления качеством','Quality Management System'],
    FX:['Валютный курс','Foreign Exchange'],
    API:['Программный интерфейс приложения','Application Programming Interface'],
    RFID:['Радиочастотная идентификация','Radio Frequency Identification'],
    EAN:['Международный товарный код','European Article Number'],
    GTIN:['Глобальный номер товарной позиции','Global Trade Item Number'],
    EXW:['Самовывоз с предприятия','Ex Works'],
    FCA:['Передача перевозчику','Free Carrier'],
    FOB:['Свободно на борту','Free on Board'],
    CIF:['Стоимость, страхование и фрахт','Cost, Insurance and Freight'],
    DAP:['Поставка в месте назначения','Delivered at Place'],
    DDP:['Поставка с оплатой пошлин','Delivered Duty Paid'],
    EUR:['Евро','Euro'],USD:['Доллар США','United States Dollar'],RUB:['Российский рубль','Russian Ruble'],CNY:['Китайский юань','Chinese Yuan'],GBP:['Фунт стерлингов','Pound Sterling'],
    PDF:['Формат электронного документа','Portable Document Format'],ZIP:['Формат архивного файла','ZIP archive format'],PPS:['Предсерийный образец','Pre-Production Sample'],HEX:['Шестнадцатеричное представление цвета','Hexadecimal colour value'],RGB:['Цветовая модель красный, зелёный, синий','Red Green Blue colour model'],
    RU:['Русский язык','Russian language'],EN:['Английский язык','English language']
  });
  const UI_TEXT_SELECTOR=[
    '.sidebar','.topbar','.od14-page-header','[data-od14-component="tabs"]','[data-od14-component="filterbar"]','[data-od14-component="section-head"]','[data-od14-component="status"]',
    '.workspace-content button','.workspace-content label','.workspace-content legend','.workspace-content th','.workspace-content option','.workspace-content .toolbar-kicker','.workspace-content .eyebrow','.workspace-content .notice','.workspace-content .empty','.workspace-content .od-empty','.workspace-content .ls9-empty',
    'dialog button','dialog label','dialog legend','dialog option','[role="dialog"] button','[role="dialog"] label','[role="dialog"] legend','[role="dialog"] option'
  ].join(',');
  const ALLOWED_LATIN=new Set(['SYNTHA',...Object.keys(ABBREVIATIONS)]);
  let observer=null;
  let scheduled=false;

  function locale(){return global.SynthaI18n?.getLocale?.()==='en'?'en':'ru'}
  function unique(nodes){return [...new Set(nodes.filter(Boolean))]}
  function roots(root,selector){
    const nodes=[];
    if(root?.nodeType===Node.ELEMENT_NODE&&root.matches?.(selector))nodes.push(root);
    root?.querySelectorAll?.(selector).forEach((node)=>nodes.push(node));
    return unique(nodes);
  }
  function setRole(root,selector,role){roots(root,selector).forEach((node)=>{node.dataset.od14Component=role})}
  function isIconButton(button){
    const className=String(button.className||'');
    const text=(button.textContent||'').trim();
    return /icon|menu|view-button|row-menu|pagination/i.test(className)||(!text&&button.querySelector('svg'))||['×','‹','›','•••'].includes(text);
  }
  function assignComponents(root=document){
    setRole(root,COMPONENTS.surface,'surface');
    setRole(root,COMPONENTS.sectionHead,'section-head');
    setRole(root,COMPONENTS.toolbar,'toolbar');
    setRole(root,COMPONENTS.filterbar,'filterbar');
    setRole(root,COMPONENTS.tabs,'tabs');
    setRole(root,COMPONENTS.tab,'tab');
    setRole(root,COMPONENTS.metrics,'metrics');
    setRole(root,COMPONENTS.metric,'metric');
    setRole(root,COMPONENTS.masterDetail,'master-detail');
    setRole(root,COMPONENTS.tableWrap,'table-wrap');
    setRole(root,COMPONENTS.table,'table');
    setRole(root,COMPONENTS.inspector,'inspector');
    setRole(root,COMPONENTS.definitionGrid,'definition-grid');
    setRole(root,COMPONENTS.definitionItem,'definition-item');
    setRole(root,COMPONENTS.entity,'entity');
    setRole(root,COMPONENTS.empty,'empty');
    setRole(root,COMPONENTS.status,'status');
    roots(root,'[data-od14-component="tab"]').forEach((node)=>{node.dataset.od14Active=String(node.classList.contains('active')||node.getAttribute('aria-pressed')==='true')});
    roots(root,'.workspace-content button,dialog button,[role="dialog"] button').forEach((button)=>{
      button.dataset.od14Component=isIconButton(button)?'icon-button':'button';
      const className=String(button.className||'').toLowerCase();
      button.dataset.od14Variant=className.includes('primary')||button.type==='submit'?'primary':className.includes('danger')||className.includes('destructive')?'danger':'secondary';
    });
    roots(root,'.workspace-content input:not([type="checkbox"]):not([type="radio"]),.workspace-content select,.workspace-content textarea,dialog input:not([type="checkbox"]):not([type="radio"]),dialog select,dialog textarea,[role="dialog"] input:not([type="checkbox"]):not([type="radio"]),[role="dialog"] select,[role="dialog"] textarea').forEach((field)=>{field.dataset.od14Component='field'});
  }
  function preserveWhitespace(original,replacement){const leading=original.match(/^\s*/)?.[0]||'';const trailing=original.match(/\s*$/)?.[0]||'';return`${leading}${replacement}${trailing}`}
  function translateValue(value){
    const original=String(value||'');
    let translated=global.SynthaI18n?.translate?global.SynthaI18n.translate(original):original;
    const dictionary=locale()==='en'?EN_EXACT:RU_EXACT;
    translated=dictionary[translated]||dictionary[original]||translated;
    return translated;
  }
  function translateText(root=document){
    roots(root,UI_TEXT_SELECTOR).forEach((container)=>{
      const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT,{
        acceptNode(node){
          const parent=node.parentElement;
          if(!parent||!node.nodeValue?.trim())return NodeFilter.FILTER_REJECT;
          if(parent.closest('script,style,textarea,input,[contenteditable="true"],.entity-title,.entity-code,td,dd,[data-od14-business-data="true"]'))return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
      nodes.forEach((node)=>{const original=node.nodeValue||'';const value=original.trim();const translated=translateValue(value);if(translated&&translated!==value)node.nodeValue=preserveWhitespace(original,translated)});
    });
    roots(root,'[placeholder],[aria-label],[title]').forEach((node)=>{
      ['placeholder','aria-label'].forEach((attribute)=>{const value=node.getAttribute(attribute)?.trim();if(!value)return;const translated=translateValue(value);if(translated&&translated!==value)node.setAttribute(attribute,translated)});
    });
  }
  function decorateAbbreviations(root=document){
    const active=locale()==='en'?1:0;
    roots(root,UI_TEXT_SELECTOR).forEach((node)=>{
      if(node.children.length>0)return;
      const value=node.textContent?.trim()||'';
      const codes=Object.keys(ABBREVIATIONS).filter((code)=>new RegExp(`(^|[^A-Za-z])${code}(?=$|[^A-Za-z])`).test(value));
      if(!codes.length)return;
      const explanation=codes.map((code)=>`${code}: ${ABBREVIATIONS[code][active]}`).join('\n');
      node.dataset.od14Tooltip=explanation;
      node.title=explanation;
    });
  }
  function auditLanguage(root=document){
    let unresolved=0;
    if(locale()==='ru'){
      roots(root,UI_TEXT_SELECTOR).forEach((node)=>{
        if(node.children.length>0||node.closest('[data-od14-business-data="true"]'))return;
        const words=(node.textContent||'').match(/[A-Za-z][A-Za-z-]*/g)||[];
        const leaks=words.filter((word)=>!ALLOWED_LATIN.has(word)&&!ALLOWED_LATIN.has(word.toUpperCase()));
        node.toggleAttribute('data-od14-untranslated',leaks.length>0);
        unresolved+=leaks.length;
      });
    }else roots(root,'[data-od14-untranslated="true"]').forEach((node)=>node.removeAttribute('data-od14-untranslated'));
    document.body.dataset.od14LanguageAudit=String(unresolved);
    return unresolved;
  }
  function apply(root=document){
    document.body.classList.add('omnidata-v14');
    document.body.dataset.synthaComponentSystem=BUILD;
    assignComponents(root);
    translateText(root);
    decorateAbbreviations(root);
    auditLanguage(root);
  }
  function scheduleApply(){if(scheduled)return;scheduled=true;global.queueMicrotask(()=>{scheduled=false;apply(document)})}
  function installObserver(){
    if(observer||!global.MutationObserver)return;
    observer=new global.MutationObserver((mutations)=>{if(mutations.some((mutation)=>mutation.addedNodes.length))scheduleApply()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }

  if(typeof renderApp==='function'){
    const previousRenderApp=renderApp;
    renderApp=(...args)=>{const result=previousRenderApp(...args);apply(document);return result};
  }
  global.addEventListener('syntha:locale-changed',scheduleApply);
  installObserver();
  scheduleApply();
  global.SynthaOmnidataV14Components=Object.freeze({build:BUILD,apply,assignComponents,translateText,auditLanguage});
})(window);
