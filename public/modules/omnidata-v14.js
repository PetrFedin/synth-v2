(function installOmnidataV14(global){
  'use strict';

  const BUILD='visual-20260805-14';
  const HEADER_CLASS='od14-page-header';
  const HEADERS=Object.freeze({
    overview:{section:['Рабочее пространство','Workspace'],title:['Обзор','Overview'],description:['Ключевые показатели, задачи и события единого рабочего пространства Syntha.','Key metrics, tasks and events across the unified Syntha workspace.']},
    planning:{section:['PLM / Планирование','PLM / Planning'],title:['Планирование коллекций','Collection Planning'],description:['Кампании, сезоны, сроки, готовность ассортимента и контроль отклонений в одном рабочем контуре.','Campaigns, seasons, timelines, assortment readiness and exception control in one workspace.']},
    styles:{section:['PLM / Проектирование','PLM / Product Design'],title:['Модели и разработка продукта','Styles and Product Development'],description:['Единый реестр моделей, вариантов, цветов, характеристик и готовности продукта.','A unified register of styles, variants, colours, attributes and product readiness.']},
    materials:{section:['PLM / Материалы и фурнитура','PLM / Materials and Trims'],title:['Материалы и фурнитура','Materials and Trims'],description:['Библиотека материалов, поставщики, цены, остатки, минимальные партии и готовность к закупке.','Material library, suppliers, prices, inventory, minimum order quantities and sourcing readiness.']},
    boms:{section:['PLM / Спецификация и себестоимость','PLM / BOM and Costing'],title:['Спецификация и производственная себестоимость','BOM and Production Costing'],description:['Версии спецификаций, компоненты, снимки цен и воспроизводимый расчёт полной себестоимости.','Versioned bills of materials, components, price snapshots and reproducible total costing.']},
    measurements:{section:['PLM / Размеры и градация','PLM / Fit and Grading'],title:['Размерные таблицы и градация','Measurement Charts and Grading'],description:['Размерные ряды, точки измерения, допуски и межразмерные приращения с контролем версии модели.','Size ranges, points of measure, tolerances and grading increments governed by the style version.']},
    samples:{section:['PLM / Образцы','PLM / Sample Management'],title:['Образцы и согласования','Samples and Approvals'],description:['Раунды образцов от запроса поставщику до проверки, решения и следующей итерации.','Sample rounds from supplier request through review, decision and the next iteration.']},
    suppliers:{section:['PLM / Закупки и производство','PLM / Sourcing and Production'],title:['Поставщики','Suppliers'],description:['Квалификация поставщиков, категории, сроки, минимальные партии и контроль аудитов.','Supplier qualification, categories, lead times, minimum order quantities and audit control.']},
    rfqs:{section:['PLM / Закупки и производство','PLM / Sourcing and Production'],title:['Запросы коммерческих предложений','Requests for Quotation'],description:['Запросы цен, сроки ответа, приглашённые поставщики и готовность к выбору победителя.','Quotation requests, response deadlines, invited suppliers and award readiness.']},
    quotations:{section:['PLM / Закупки и производство','PLM / Sourcing and Production'],title:['Котировки и сравнение предложений','Quotations and Bid Comparison'],description:['Сопоставление цен, фиксированных затрат, сроков, партий и коммерческих условий поставщиков.','Comparison of prices, fixed costs, lead times, quantities and supplier commercial terms.']},
    production:{section:['PLM / Закупки и производство','PLM / Sourcing and Production'],title:['Размещение производства','Production Allocation'],description:['Заказы на закупку, распределение объёмов, даты запуска и контроль поставки.','Purchase orders, quantity allocation, production start dates and delivery control.']},
    catalog:{section:['Разработка','Development'],title:['Каталог продуктов','Product Catalog'],description:['Модели, варианты, публикация и коммерческая готовность товарного каталога.','Styles, variants, publication and commercial readiness of the product catalog.']},
    linesheets:{section:['Оптовая коммерция','Wholesale Commerce'],title:['Листы коллекций','Linesheets'],description:['Ассортимент, коммерческие условия и материалы для совместной работы с покупателями.','Assortments, commercial terms and materials for buyer collaboration.']},
    showrooms:{section:['Оптовая коммерция','Wholesale Commerce'],title:['Шоурумы','Showrooms'],description:['Цифровые торговые пространства, доступность коллекций и работа с покупателями.','Digital selling spaces, collection availability and buyer collaboration.']},
    partners:{section:['Оптовая коммерция','Wholesale Commerce'],title:['Контрагенты','Partners'],description:['Бренды, ретейлеры, поставщики и действующие коммерческие отношения.','Brands, retailers, suppliers and active commercial relationships.']},
    selections:{section:['Оптовая коммерция','Wholesale Commerce'],title:['Отборы','Selections'],description:['Рабочие отборы покупателя, состав ассортимента и подготовка к заказу.','Buyer selections, assortment composition and preparation for ordering.']},
    orders:{section:['Оптовая коммерция','Wholesale Commerce'],title:['Заказы','Orders'],description:['Заказы, подтверждения, статусы исполнения и коммерческие документы.','Orders, confirmations, fulfilment statuses and commercial documents.']},
    calendar:{section:['Управление','Management'],title:['Календарь','Calendar'],description:['Сроки кампаний, коллекций, согласований и ключевых операционных событий.','Campaign, collection, approval and key operational deadlines.']},
    notifications:{section:['Управление','Management'],title:['Уведомления','Notifications'],description:['События, исключения и действия, требующие внимания пользователя.','Events, exceptions and actions requiring user attention.']}
  });
  const PAIRS=Object.freeze([
    ['Операционная система моды','Fashion Operating System'],['Рабочее пространство','Workspace'],['Разработка','Development'],['Оптовая коммерция','Wholesale Commerce'],['Управление','Management'],
    ['Владелец','Owner'],['Администратор','Administrator'],['Финансы','Finance'],['Закупщик','Buyer'],['Продажи','Sales'],['Менеджер','Manager'],['Наблюдатель','Viewer'],['Участник','Member'],
    ['Главная','Home'],['Карта связей','Relationship map'],['Матрица ролей','Role matrix'],['Источники','Sources'],['История изменений','Change history'],
    ['Все листы','All linesheets'],['Активна','Active'],['Отправлена','Sent'],['Просмотрена','Viewed'],['Фильтры','Filters'],['Список','List'],['Сетка','Grid'],
    ['Дополнительные действия','More actions'],['Действия строки','Row actions'],['Покупатель / Ретейлер','Buyer / Retailer'],['Дата обновления','Updated'],['Просмотры','Views'],['Действия','Actions'],
    ['Предыдущая страница','Previous page'],['Следующая страница','Next page'],['Записей на странице','Rows per page'],['Обзор','Overview'],['Товары','Products'],['Покупатели','Buyers'],['Статистика','Statistics'],['История','History'],
    ['Описание','Description'],['Связанные данные','Related data'],['Ассортимент','Assortment'],['Открыть лист','Open linesheet'],['Поделиться','Share'],['Примерный режим','Sample mode'],
    ['Ткань','Fabric'],['Фурнитура','Trim'],['Упаковка','Packaging'],['Прочее','Other'],['метр','metre'],['килограмм','kilogram'],['штука','piece'],['ярд','yard'],
    ['Нейтральный','Neutral'],['Успешно','Success'],['Предупреждение','Warning'],['Опасность','Danger'],['В производстве','In production'],['Получен / на проверке','Received / review'],['Предсерийный','Pre-production'],['Размерный ряд','Size set'],['Прототип','Proto'],['Примерочный','Fit'],['Продажный','Sales'],['Фото','Photo'],
    ['Условие поставки','Incoterm'],['Условия поставки','Incoterms'],['Валюта','Currency'],['Категории','Categories'],['Страна','Country'],['Поставщик','Supplier'],['Количество','Quantity'],['Поставка','Delivery'],['Котировки','Quotations'],['Производство','Production'],
    ['Реестр','Registry'],['Матрица','Matrix'],['Исключения','Exceptions'],['Остатки','Inventory'],['Готовность','Readiness'],['Риск','Risk'],['Статус','Status'],['Версия','Version'],['Строки','Lines'],['Материалы','Materials'],['Итого','Total'],['Труд','Labor'],['Накладные расходы','Overhead'],['Логистика','Logistics'],
    ['Комментарий','Notes'],['Причина','Reason'],['Бренд','Brand'],['Код','Code'],['Название','Name'],['Тип','Type'],['Единица учёта','Unit'],['Состав','Composition'],['Цвет','Color'],['Электронная почта','Email'],
    ['Черновик','Draft'],['Опубликовано','Published'],['Одобрено','Approved'],['Отклонено','Rejected'],['Отменено','Cancelled'],['Готово','Ready'],['Открыто','Open'],['Закрыто','Closed'],['Загрузка','Loading'],['Обновить','Refresh'],['Сохранить','Save'],['Редактировать','Edit'],['Опубликовать','Publish'],['Создать','Create'],['Поиск','Search'],
    ['Портфель','Portfolio'],['Календарный план','Timeline'],['Кампания','Campaign'],['Коллекция','Collection'],['Коллекции','Collections'],['Сезон','Season'],['Период','Period'],['Критические','Critical'],['Просрочены','Overdue'],
    ['Цена за единицу','Unit cost'],['Артикул поставщика','Supplier reference'],['Доступное количество','Available quantity'],['Срок выполнения','Lead time'],['Структура затрат','Cost structure'],['Снимок','Snapshot'],
    ['Линейный лист','Linesheet'],['Линейные листы','Linesheets'],['Размерные таблицы','Measurement Charts'],['Градация размеров','Grading'],['Посадка и градация','Fit and Grading'],['Управление образцами','Sample Management'],['Размещение производства','Production Allocation']
  ]);
  const RU_EXACT=Object.freeze(Object.fromEntries(PAIRS.map(([ru,en])=>[en,ru])));
  const EN_EXACT=Object.freeze(Object.fromEntries(PAIRS.map(([ru,en])=>[ru,en])));
  const ROLE_RU=Object.freeze({owner:'Владелец',admin:'Администратор',finance:'Финансы',buyer:'Закупщик',sales:'Продажи',manager:'Менеджер',viewer:'Наблюдатель',member:'Участник',user:'Пользователь'});
  const ABBREVIATIONS=Object.freeze({
    PLM:['Управление жизненным циклом продукта','Product Lifecycle Management'],BOM:['Спецификация материалов и компонентов','Bill of Materials'],SKU:['Единица складского учёта','Stock Keeping Unit'],POM:['Точка измерения','Point of Measure'],MOQ:['Минимальная партия заказа','Minimum Order Quantity'],ATS:['Доступно к продаже','Available to Sell'],
    RFQ:['Запрос коммерческого предложения','Request for Quotation'],PO:['Заказ на закупку','Purchase Order'],ERP:['Система управления ресурсами предприятия','Enterprise Resource Planning'],WMS:['Система управления складом','Warehouse Management System'],PIM:['Система управления информацией о товарах','Product Information Management'],OMS:['Система управления заказами','Order Management System'],
    QC:['Контроль качества','Quality Control'],QMS:['Система управления качеством','Quality Management System'],FX:['Валютный курс','Foreign Exchange'],API:['Программный интерфейс приложения','Application Programming Interface'],RFID:['Радиочастотная идентификация','Radio Frequency Identification'],EAN:['Международный товарный код','European Article Number'],GTIN:['Глобальный номер товарной позиции','Global Trade Item Number'],
    EXW:['Самовывоз с предприятия','Ex Works'],FCA:['Передача перевозчику','Free Carrier'],FOB:['Свободно на борту','Free on Board'],CIF:['Стоимость, страхование и фрахт','Cost, Insurance and Freight'],DAP:['Поставка в месте назначения','Delivered at Place'],DDP:['Поставка с оплатой пошлин','Delivered Duty Paid'],
    EUR:['Евро','Euro'],USD:['Доллар США','United States Dollar'],RUB:['Российский рубль','Russian Ruble'],CNY:['Китайский юань','Chinese Yuan'],GBP:['Фунт стерлингов','Pound Sterling'],ISO:['Международная организация по стандартизации','International Organization for Standardization'],UTC:['Всемирное координированное время','Coordinated Universal Time'],
    PDF:['Формат электронного документа','Portable Document Format'],ZIP:['Формат архивного файла','ZIP archive format'],PPS:['Предсерийный образец','Pre-Production Sample'],HEX:['Шестнадцатеричное представление цвета','Hexadecimal colour value'],RGB:['Цветовая модель красный, зелёный, синий','Red Green Blue colour model'],SMB:['Малый и средний бизнес','Small and Medium Business'],SaaS:['Программное обеспечение как услуга','Software as a Service'],RU:['Русский язык','Russian language'],EN:['Английский язык','English language']
  });
  const ABBREVIATION_RE=new RegExp(`\\b(${Object.keys(ABBREVIATIONS).join('|')})\\b`,'g');
  const UI_SELECTOR=[
    '.sidebar','.topbar','.od14-page-header','.view-toolbar','.od-tabs','.ls9-tabs','.planning-tabs','.styles-tabs','.materials-tabs','.bom-tabs','.measurement-tabs','.sample-tabs','.sourcing-tabs',
    '.od-commandbar','.ls9-commandbar','.sample-filters','.sourcing-toolbar','.od-metrics','.ls9-metrics','.bom-kpis','.measurement-kpis','.sample-kpis','.sourcing-kpis',
    '.section-toolbar','.od-section-head','.od-inspector','.bom-inspector','.measurement-inspector','.sample-inspector','.sourcing-inspector','.ls9-inspector',
    '.workspace-content button','.workspace-content label','.workspace-content legend','.workspace-content th','.workspace-content option','.workspace-content .badge','.workspace-content .od-status','.workspace-content .bom-badge','.workspace-content .measurement-badge','.workspace-content .sample-badge','.workspace-content .sourcing-badge','.workspace-content .ls9-status',
    '.workspace-content dt','.workspace-content .notice','.workspace-content .empty','.workspace-content .od-empty','.workspace-content .material-state','.dialog','[role="dialog"]'
  ].join(',');
  const DIAGNOSTIC_SELECTOR='button,label,legend,th,option,[role="tab"],.badge,.od-status,.bom-badge,.measurement-badge,.sample-badge,.sourcing-badge,.ls9-status,.eyebrow,.toolbar-kicker,.nav-label,.nav-group-label,.button-label,.od14-page-header';
  let observer=null;
  let scheduled=false;

  function locale(){return global.SynthaI18n?.getLocale?.()==='en'?'en':'ru'}
  function text(ru,en){return locale()==='en'?en:ru}
  function currentView(){try{return typeof state!=='undefined'?state.view:'overview'}catch{return'overview'}}
  function headerDefinition(view){return HEADERS[view]||{section:[text('Рабочее пространство','Workspace'),text('Рабочее пространство','Workspace')],title:[safeViewTitle(view),safeViewTitle(view)],description:['Единый рабочий раздел Syntha.','Unified Syntha workspace section.']}}
  function safeViewTitle(view){try{return typeof viewTitle==='function'?viewTitle(view):view}catch{return view}}
  function safeSectionName(view){try{return typeof viewSectionName==='function'?viewSectionName(view):text('Рабочее пространство','Workspace')}catch{return text('Рабочее пространство','Workspace')}}
  function localizedDefinition(view){const definition=headerDefinition(view);return{section:definition.section?text(definition.section[0],definition.section[1]):safeSectionName(view),title:definition.title?text(definition.title[0],definition.title[1]):safeViewTitle(view),description:definition.description?text(definition.description[0],definition.description[1]):''}}
  function create(tag,className,value){const node=document.createElement(tag);if(className)node.className=className;if(value!==undefined)node.textContent=value;return node}
  function uniqueNodes(nodes){return [...new Set(nodes.filter(Boolean))]}
  function sourceActionNodes(workspace){
    const selectors=[
      '.view-toolbar > button','.view-toolbar > .button',
      '.bom-header-actions > button','.measurement-header-actions > button','.sample-header-actions > button','.sourcing-header-actions > button',
      '.od-commandbar > button.primary','.od-commandbar > .button.primary'
    ];
    return uniqueNodes(selectors.flatMap((selector)=>[...workspace.querySelectorAll(selector)]).filter((node)=>!node.closest(`.${HEADER_CLASS}`)));
  }
  function markSourceLayouts(workspace){
    workspace.querySelectorAll('.view-toolbar').forEach((node)=>node.classList.add('od14-source-toolbar'));
    workspace.querySelectorAll('.bom-header,.measurement-header,.sample-header,.sourcing-header').forEach((node)=>node.classList.add('od14-source-header'));
    workspace.querySelectorAll('.od-commandbar').forEach((node)=>node.classList.toggle('od14-no-action',!node.querySelector(':scope > button,:scope > .button')));
  }
  function buildUnifiedHeader(workspace){
    const view=currentView();
    let header=workspace.querySelector(`:scope > .${HEADER_CLASS}`);
    const definition=localizedDefinition(view);
    if(header){
      header.dataset.view=view;
      const section=header.querySelector('.od14-page-section');
      const titleNode=header.querySelector('.od14-page-title');
      const description=header.querySelector('.od14-page-description');
      if(section&&section.textContent!==definition.section)section.textContent=definition.section;
      if(titleNode&&titleNode.textContent!==definition.title)titleNode.textContent=definition.title;
      if(description&&description.textContent!==definition.description)description.textContent=definition.description;
      markSourceLayouts(workspace);
      return header;
    }
    header=create('header',HEADER_CLASS);
    header.dataset.view=view;
    const heading=create('div','od14-page-heading');
    heading.append(create('p','od14-page-section',definition.section),create('h1','od14-page-title',definition.title),create('p','od14-page-description',definition.description));
    const actions=create('div','od14-page-actions');
    sourceActionNodes(workspace).forEach((node)=>actions.append(node));
    header.append(heading,actions);
    workspace.prepend(header);
    markSourceLayouts(workspace);
    return header;
  }
  function preserveWhitespace(original,replacement){const leading=original.match(/^\s*/)?.[0]||'';const trailing=original.match(/\s*$/)?.[0]||'';return`${leading}${replacement}${trailing}`}
  function localizeExact(value){
    let result=String(value||'');
    if(global.SynthaI18n?.translate)result=global.SynthaI18n.translate(result);
    const dictionary=locale()==='en'?EN_EXACT:RU_EXACT;
    return dictionary[result]||dictionary[String(value||'')]||result;
  }
  function translateNodeText(root){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{
      acceptNode(node){
        const parent=node.parentElement;
        if(!parent||!node.nodeValue?.trim())return NodeFilter.FILTER_REJECT;
        if(parent.closest('script,style,textarea,input,[contenteditable="true"],.od13-abbr'))return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach((node)=>{const original=node.nodeValue||'';const value=original.trim();const translated=localizeExact(value);if(translated&&translated!==value)node.nodeValue=preserveWhitespace(original,translated)});
  }
  function translateAttributes(root){
    const elements=[];
    if(root.nodeType===Node.ELEMENT_NODE)elements.push(root);
    root.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach((node)=>elements.push(node));
    uniqueNodes(elements).forEach((node)=>['placeholder','aria-label'].forEach((attribute)=>{const value=node.getAttribute?.(attribute)?.trim();if(!value)return;const translated=localizeExact(value);if(translated&&translated!==value)node.setAttribute(attribute,translated)}));
  }
  function decorateAbbreviations(root=document){
    const active=locale()==='en'?1:0;
    const nodes=[];
    root.querySelectorAll?.(`${UI_SELECTOR},td,dd`).forEach((node)=>nodes.push(node));
    uniqueNodes(nodes).forEach((node)=>{
      if(node.closest('.od13-abbr')||node.children.length>0)return;
      const value=node.textContent?.trim()||'';
      ABBREVIATION_RE.lastIndex=0;
      const matches=[...new Set([...value.matchAll(ABBREVIATION_RE)].map((match)=>match[1]))];
      ABBREVIATION_RE.lastIndex=0;
      if(!matches.length)return;
      const explanation=matches.map((code)=>`${code}: ${ABBREVIATIONS[code][active]}`).join('\n');
      node.dataset.od14Tooltip=explanation;
      node.title=explanation;
      node.setAttribute('aria-label',`${value}. ${explanation.replaceAll('\n','. ')}`);
    });
  }
  function translateRole(){
    const role=document.querySelector('.topbar-user .user-copy small');
    if(!role)return;
    const raw=role.textContent?.trim()||'';
    if(locale()==='ru'&&ROLE_RU[raw.toLowerCase()])role.textContent=ROLE_RU[raw.toLowerCase()];
  }
  function translateBrand(){
    const brand=document.querySelector('.brand-copy small');
    if(brand)brand.textContent=text('Операционная система моды','Fashion Operating System');
  }
  function auditInterface(root=document){
    const roots=[];
    if(root.nodeType===Node.ELEMENT_NODE&&root.matches?.(UI_SELECTOR))roots.push(root);
    root.querySelectorAll?.(UI_SELECTOR).forEach((node)=>roots.push(node));
    uniqueNodes(roots).forEach(translateNodeText);
    translateAttributes(root);
    translateRole();
    translateBrand();
    decorateAbbreviations(root);
  }
  function diagnosticAudit(){
    if(locale()!=='ru'){
      document.querySelectorAll('[data-od14-untranslated="true"]').forEach((node)=>node.removeAttribute('data-od14-untranslated'));
      return;
    }
    const allowed=new Set(['SYNTHA',...Object.keys(ABBREVIATIONS)]);
    document.querySelectorAll(DIAGNOSTIC_SELECTOR).forEach((node)=>{
      if(node.closest('.od13-abbr'))return;
      const words=(node.textContent||'').match(/[A-Za-z][A-Za-z-]*/g)||[];
      const unresolved=words.filter((word)=>!allowed.has(word)&&!allowed.has(word.toUpperCase()));
      node.toggleAttribute('data-od14-untranslated',unresolved.length>0);
    });
  }
  function compactFilters(workspace){
    workspace.querySelectorAll('.od-commandbar').forEach((bar)=>bar.classList.toggle('od14-no-action',!bar.querySelector(':scope > button,:scope > .button')));
    workspace.querySelectorAll('input[type="search"]').forEach((input)=>{
      const parent=input.closest('.od-search,.ls9-search,.global-search');
      if(parent)parent.classList.add('od14-compact-search');
    });
  }
  function apply(){
    document.documentElement.lang=locale();
    document.body.classList.add('omnidata-v14');
    document.body.dataset.synthaVisual=BUILD;
    const workspace=document.querySelector('.workspace-content');
    if(workspace){buildUnifiedHeader(workspace);compactFilters(workspace)}
    auditInterface(document);
    diagnosticAudit();
  }
  function scheduleApply(){if(scheduled)return;scheduled=true;global.queueMicrotask(()=>{scheduled=false;apply()})}
  function installObserver(){
    if(observer||!global.MutationObserver)return;
    observer=new global.MutationObserver((mutations)=>{if(mutations.some((mutation)=>mutation.addedNodes.length))scheduleApply()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }

  const previousRenderApp=renderApp;
  renderApp=(...args)=>{const result=previousRenderApp(...args);apply();return result};
  global.addEventListener('syntha:locale-changed',scheduleApply);
  installObserver();
  global.SynthaOmnidataV14=Object.freeze({build:BUILD,apply,buildUnifiedHeader,auditInterface,diagnosticAudit});
})(window);
