(function installOmnidataV14ComponentSystem(global){
  'use strict';

  const BUILD='visual-20260805-14-components-3';
  const COMPONENTS=Object.freeze({
    surface:'.section,.od-section,.sourcing-panel,.measurement-matrix-panel,.bom-cost-card,.ls9-master',
    card:'.card:not(.kpi),.panel,.tile,.widget,.box,.tech-pack-card,.production-orders-card,.production-execution-card',
    sectionHead:'.section-toolbar,.od-section-head,.card-header,.panel-header,.section-header,.bom-section-header,.measurement-section-header,.sample-section-header,.sourcing-section-header',
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
    status:'.badge,.od-status,.bom-badge,.measurement-badge,.sample-badge,.sourcing-badge,.ls9-status,.material-state,.status-badge',
    alert:'.alert,.notice,.error-banner,.warning-banner,.production-execution-error,.production-orders-error',
    timeline:'.timeline,.milestone-list,.production-milestone-list,.steps,.step-list',
    timelineItem:'.timeline-item,.milestone,.production-milestone,.step-item',
    progress:'.progress,.progress-bar,.readiness-bar,.completion-bar',
    list:'.record-list,.entity-list,.card-list,.compact-list,.activity-list',
    listItem:'.record-list>*,.entity-list>*,.card-list>*,.compact-list>*,.activity-list>*'
  });
  const ROLE_RULES=Object.freeze([
    Object.freeze({role:'section-head',pattern:/(^|[-_ ])(?:section|card|panel)[-_ ]?(?:head|header|titlebar)(?:$|[-_ ])/}),
    Object.freeze({role:'filterbar',pattern:/(^|[-_ ])(?:filter|filters|filterbar|commandbar|command-bar|searchbar|search-bar)(?:$|[-_ ])/}),
    Object.freeze({role:'table-wrap',pattern:/(^|[-_ ])(?:table[-_ ]?(?:wrap|wrapper|container|registry)|registry|data-grid)(?:$|[-_ ])/}),
    Object.freeze({role:'table',pattern:/(^|[-_ ])(?:table|matrix|data-table)(?:$|[-_ ])/}),
    Object.freeze({role:'inspector',pattern:/(^|[-_ ])(?:inspector|details-panel|detail-panel|properties|property-panel|drawer|side-panel)(?:$|[-_ ])/}),
    Object.freeze({role:'metrics',pattern:/(^|[-_ ])(?:metrics|kpis|stats-grid|summary-cards)(?:$|[-_ ])/}),
    Object.freeze({role:'metric',pattern:/(^|[-_ ])(?:metric|kpi|stat-card|stat-tile)(?:$|[-_ ])/}),
    Object.freeze({role:'tabs',pattern:/(^|[-_ ])(?:tabs|tablist|tab-list)(?:$|[-_ ])/}),
    Object.freeze({role:'tab',pattern:/(^|[-_ ])tab(?:$|[-_ ])/}),
    Object.freeze({role:'toolbar',pattern:/(^|[-_ ])(?:toolbar|actions|controls|command-actions)(?:$|[-_ ])/}),
    Object.freeze({role:'definition-grid',pattern:/(^|[-_ ])(?:facts|summary|info-grid|details-grid|definition-grid|metadata-grid)(?:$|[-_ ])/}),
    Object.freeze({role:'status',pattern:/(^|[-_ ])(?:status|badge|pill|chip|state|tag)(?:$|[-_ ])/}),
    Object.freeze({role:'empty',pattern:/(^|[-_ ])(?:empty|empty-state|no-data|placeholder-state)(?:$|[-_ ])/}),
    Object.freeze({role:'alert',pattern:/(^|[-_ ])(?:alert|notice|error|warning|callout|message-banner)(?:$|[-_ ])/}),
    Object.freeze({role:'timeline',pattern:/(^|[-_ ])(?:timeline|milestone-list|step-list|steps)(?:$|[-_ ])/}),
    Object.freeze({role:'timeline-item',pattern:/(^|[-_ ])(?:timeline-item|milestone|step-item)(?:$|[-_ ])/}),
    Object.freeze({role:'progress',pattern:/(^|[-_ ])(?:progress|progress-bar|readiness-bar|completion-bar)(?:$|[-_ ])/}),
    Object.freeze({role:'list',pattern:/(^|[-_ ])(?:record-list|entity-list|card-list|compact-list|activity-list)(?:$|[-_ ])/}),
    Object.freeze({role:'list-item',pattern:/(^|[-_ ])(?:record-item|entity-item|card-item|activity-item)(?:$|[-_ ])/}),
    Object.freeze({role:'entity',pattern:/(^|[-_ ])(?:entity|partner|order|selection|notification|calendar)[-_ ]?(?:card|record|item)(?:$|[-_ ])/}),
    Object.freeze({role:'card',pattern:/(^|[-_ ])(?:card|panel|tile|widget|box)(?:$|[-_ ])/}),
    Object.freeze({role:'surface',pattern:/(^|[-_ ])(?:surface|section|workspace-panel)(?:$|[-_ ])/})
  ]);
  const COMPONENT_LIKE=/(table|registry|grid|filter|searchbar|commandbar|card|panel|tile|widget|badge|status|pill|chip|inspector|details|drawer|toolbar|actions|metric|kpi|tabs?|timeline|milestone|progress|empty|alert|notice|list)/i;
  const STRICT_PAIRS=Object.freeze([
    ['Операционная система моды','Fashion Operating System'],['Рабочее пространство','Workspace'],
    ['PLM / Планирование','PLM / Planning'],['PLM / Проектирование продукта','PLM / Product Design'],['PLM / Материалы и фурнитура','PLM / Materials and Trims'],['PLM / BOM и себестоимость','PLM / BOM and Costing'],['PLM / Посадка и градация','PLM / Fit and Grading'],['PLM / Управление образцами','PLM / Sample Management'],['PLM / Закупки и производство','PLM / Sourcing and Production'],
    ['PLM / Контроль технических пакетов','PLM / Tech Pack Control'],['PLM / Контроль технических пакетов','PLM / TECH PACK CONTROL'],['PLM / Контроль производственных заказов','PLM / Production Order Control'],['PLM / Контроль производственных заказов','PLM / PRODUCTION ORDER CONTROL'],['PLM / Исполнение производства','PLM / Production Execution'],['PLM / Исполнение производства','PLM / PRODUCTION EXECUTION'],
    ['Технические пакеты','Tech Packs'],['Производственные заказы','Production Orders'],['Исполнение производства','Production Execution'],
    ['Листы коллекций','Linesheets'],['Лист коллекции','Linesheet'],['Нет листа коллекции','No linesheet'],['Лист коллекции не открыт','Linesheet is not open'],['Календарный план','Timeline'],['Градация размеров','Grading'],['Посадка и градация','Fit and Grading'],['Управление образцами','Sample Management'],['Размещение производства','Production Allocation'],['Материалы и фурнитура','Materials and Trims'],['Проектирование продукта','Product Design'],['Закупки и производство','Sourcing and Production'],['Спецификация и себестоимость','BOM and Costing'],['Размерные таблицы','Measurement Charts'],['Запросы коммерческих предложений','Requests for Quotation'],['Сравнение предложений','Bid Comparison'],
    ['Срок выполнения','Lead time'],['Цена за единицу','Unit cost'],['Артикул поставщика','Supplier reference'],['Доступное количество','Available quantity'],['Структура затрат','Cost structure'],['Снимок стоимости','Cost snapshot'],['Покупатель / Ретейлер','Buyer / Retailer'],['Дата обновления','Updated'],['Записей на странице','Rows per page'],['Предыдущая страница','Previous page'],['Следующая страница','Next page'],['Дополнительные действия','More actions'],['Действия строки','Row actions'],['Связанные данные','Related data'],['Примерный режим','Sample mode'],['Все листы','All linesheets'],
    ['Главная','Home'],['Карта связей','Relationship map'],['Матрица ролей','Role matrix'],['История изменений','Change history'],['Обзор','Overview'],['Товары','Products'],['Покупатели','Buyers'],['Статистика','Statistics'],['История','History'],['Описание','Description'],['Ассортимент','Assortment'],['Поделиться','Share'],['Открыть лист','Open linesheet'],
    ['Фильтры','Filters'],['Поиск','Search'],['Статус','Status'],['Все статусы','All statuses'],['Все уровни риска','All risk states'],['Только заблокированные','Blocked only'],['Только просроченные','Overdue only'],['Текущий этап','Current milestone'],['Производственный шлюз закрыт','Production gate closed'],['Готово к контролю качества','Ready for QC'],['Материалы готовы','Materials ready'],['Раскрой завершён','Cutting complete'],['Сборка завершена','Assembly complete'],['Отделка завершена','Finishing complete'],['Упаковка завершена','Packing complete'],
    ['Сезон','Season'],['Коллекция','Collection'],['Коллекции','Collections'],['Кампания','Campaign'],['Кампании','Campaigns'],['Поставщик','Supplier'],['Поставщики','Suppliers'],['Котировки','Quotations'],['Производство','Production'],['Готовность','Readiness'],['Риск','Risk'],['Риски','Risks'],['Исключения','Exceptions'],['Действия','Actions'],['Просмотры','Views'],['Список','List'],['Сетка','Grid'],
    ['Создать','Create'],['Сохранить','Save'],['Редактировать','Edit'],['Опубликовать','Publish'],['Открыть','Open'],['Закрыть','Close'],['Обновить','Refresh'],['Загрузить ещё','Load more'],['Повторить','Retry'],['Загрузка…','Loading…'],
    ['Черновик','Draft'],['Опубликовано','Published'],['Одобрено','Approved'],['Отклонено','Rejected'],['Отменено','Cancelled'],['Готово','Ready'],['Активна','Active'],['Отправлена','Sent'],['Просмотрена','Viewed'],['Подтверждено','Confirmed'],['Ожидает','Pending'],['Заблокировано','Blocked'],['Просрочено','Overdue'],
    ['Ткань','Fabric'],['Фурнитура','Trim'],['Упаковка','Packaging'],['Прочее','Other'],['Условие поставки','Incoterm'],['Условия поставки','Incoterms'],['Электронная почта','Email'],['Валюта','Currency'],['Категории','Categories'],['Страна','Country'],['Количество','Quantity'],['Поставка','Delivery'],['Комментарий','Notes'],['Название','Name'],['Тип','Type'],['Цвет','Color'],['Единица учёта','Unit'],['Состав','Composition'],['Остались черновики SKU','Draft SKU remain'],['Нет SKU','No SKU']
  ]);
  const RU_EXACT=Object.freeze(Object.fromEntries(STRICT_PAIRS.map(([ru,en])=>[en,ru])));
  const EN_EXACT=Object.freeze(Object.fromEntries(STRICT_PAIRS.map(([ru,en])=>[ru,en])));
  const ABBREVIATIONS=Object.freeze({
    PLM:['Управление жизненным циклом продукта','Product Lifecycle Management'],BOM:['Спецификация материалов и компонентов','Bill of Materials'],SKU:['Единица складского учёта','Stock Keeping Unit'],POM:['Точка измерения','Point of Measure'],MOQ:['Минимальная партия заказа','Minimum Order Quantity'],ATS:['Доступно к продаже','Available to Sell'],RFQ:['Запрос коммерческого предложения','Request for Quotation'],PO:['Заказ на закупку','Purchase Order'],ERP:['Система управления ресурсами предприятия','Enterprise Resource Planning'],WMS:['Система управления складом','Warehouse Management System'],PIM:['Система управления информацией о товарах','Product Information Management'],OMS:['Система управления заказами','Order Management System'],QC:['Контроль качества','Quality Control'],QMS:['Система управления качеством','Quality Management System'],FX:['Валютный курс','Foreign Exchange'],API:['Программный интерфейс приложения','Application Programming Interface'],RFID:['Радиочастотная идентификация','Radio Frequency Identification'],EAN:['Международный товарный код','European Article Number'],GTIN:['Глобальный номер товарной позиции','Global Trade Item Number'],EXW:['Самовывоз с предприятия','Ex Works'],FCA:['Передача перевозчику','Free Carrier'],FOB:['Свободно на борту','Free on Board'],CIF:['Стоимость, страхование и фрахт','Cost, Insurance and Freight'],DAP:['Поставка в месте назначения','Delivered at Place'],DDP:['Поставка с оплатой пошлин','Delivered Duty Paid'],EUR:['Евро','Euro'],USD:['Доллар США','United States Dollar'],RUB:['Российский рубль','Russian Ruble'],CNY:['Китайский юань','Chinese Yuan'],GBP:['Фунт стерлингов','Pound Sterling'],ISO:['Международная организация по стандартизации','International Organization for Standardization'],UTC:['Всемирное координированное время','Coordinated Universal Time'],PDF:['Формат электронного документа','Portable Document Format'],ZIP:['Формат архивного файла','ZIP archive format'],PPS:['Предсерийный образец','Pre-Production Sample'],HEX:['Шестнадцатеричное представление цвета','Hexadecimal colour value'],RGB:['Цветовая модель красный, зелёный, синий','Red Green Blue colour model'],RU:['Русский язык','Russian language'],EN:['Английский язык','English language']
  });
  const UI_TEXT_SELECTOR=[
    '.sidebar','.topbar','.od14-page-header','[data-od14-component="tabs"]','[data-od14-component="filterbar"]','[data-od14-component="section-head"]','[data-od14-component="status"]','[data-od14-component="alert"]',
    '.workspace-content button','.workspace-content label','.workspace-content legend','.workspace-content th','.workspace-content option','.workspace-content .toolbar-kicker','.workspace-content .eyebrow','.workspace-content .notice','.workspace-content .empty','.workspace-content .od-empty','.workspace-content .ls9-empty',
    'dialog button','dialog label','dialog legend','dialog option','[role="dialog"] button','[role="dialog"] label','[role="dialog"] legend','[role="dialog"] option'
  ].join(',');
  const ALLOWED_LATIN=new Set(['SYNTHA',...Object.keys(ABBREVIATIONS)]);
  let observer=null;
  let scheduled=false;

  function locale(){return global.SynthaI18n?.getLocale?.()==='en'?'en':'ru'}
  function unique(nodes){return [...new Set(nodes.filter(Boolean))]}
  function isElement(node){return Boolean(node&&node.nodeType===1&&typeof node.matches==='function')}
  function roots(root,selector){const nodes=[];if(isElement(root)&&root.matches(selector))nodes.push(root);root?.querySelectorAll?.(selector).forEach((node)=>nodes.push(node));return unique(nodes)}
  function markExistingRoles(root=document){roots(root,'[data-od14-component]').forEach((node)=>{if(!node.dataset.od14RoleSource)node.dataset.od14RoleSource='adapter'})}
  function assignRole(node,role,source='heuristic',force=false){if(!node?.dataset||!role)return false;const currentSource=node.dataset.od14RoleSource;if(!force&&currentSource==='adapter')return false;if(!force&&node.dataset.od14Component&&source==='heuristic')return false;node.dataset.od14Component=role;node.dataset.od14RoleSource=source;return true}
  function setRole(root,selector,role){roots(root,selector).forEach((node)=>assignRole(node,role,'explicit',true))}
  function classNameOf(node){return String(node?.className&&typeof node.className==='string'?node.className:'').toLowerCase()}
  function contains(node,selector){try{return Boolean(node?.querySelector?.(selector))}catch{return false}}
  function semanticRoleFor(node){
    if(!node)return null;
    const tag=String(node.tagName||'').toLowerCase();const role=String(node.getAttribute?.('role')||'').toLowerCase();const classes=classNameOf(node).replace(/\s+/g,' ');
    if(tag==='table')return'table';if(role==='tablist')return'tabs';if(role==='tab')return'tab';if(role==='status')return'status';if(role==='alert')return'alert';if(tag==='progress')return'progress';
    if((tag==='ul'||tag==='ol')&&/(timeline|milestone|step)/.test(classes))return'timeline';if(tag==='li'&&node.parentElement?.dataset?.od14Component==='timeline')return'timeline-item';
    if(/(?:^|[-_ ])layout(?:$|[-_ ])|(?:^|[-_ ])grid(?:$|[-_ ])/.test(classes)&&contains(node,'table')&&contains(node,'[class*="inspector"],[class*="details-panel"],[data-od14-component="inspector"]'))return'master-detail';
    if(contains(node,'table')&&/(registry|table|matrix|grid)/.test(classes))return'table-wrap';
    for(const rule of ROLE_RULES)if(rule.pattern.test(classes))return rule.role;return null;
  }
  function componentCandidates(root=document){return roots(root,'.workspace-content [class],dialog [class],[role="dialog"] [class],.workspace-content table,.workspace-content progress,dialog table,[role="dialog"] table')}
  function classifyLegacyComponents(root=document){let classified=0;componentCandidates(root).forEach((node)=>{if(node.dataset.od14Component)return;const role=semanticRoleFor(node);if(role&&assignRole(node,role,'heuristic'))classified+=1});roots(root,'[data-od14-component="definition-grid"]>*').forEach((node)=>{if(!node.dataset.od14Component)assignRole(node,'definition-item','structure')});roots(root,'[data-od14-component="list"]>*').forEach((node)=>{if(!node.dataset.od14Component)assignRole(node,'list-item','structure')});roots(root,'[data-od14-component="timeline"]>*').forEach((node)=>{if(!node.dataset.od14Component)assignRole(node,'timeline-item','structure')});return classified}
  function isIconButton(button){const className=classNameOf(button);const text=(button.textContent||'').trim();return /icon|menu|view-button|row-menu|pagination/.test(className)||(!text&&button.querySelector?.('svg'))||['×','‹','›','•••'].includes(text)}
  function toneFor(node){const value=`${classNameOf(node)} ${(node?.textContent||'').toLowerCase()}`;if(/danger|error|critical|rejected|cancelled|canceled|blocked|overdue|failed|high/.test(value))return'danger';if(/warning|risk|pending|awaiting|medium|attention|draft/.test(value))return'warning';if(/success|approved|confirmed|ready|active|complete|completed|acknowledged|ok|low/.test(value))return'success';if(/info|issued|sent|in-progress|in progress|running/.test(value))return'info';return'neutral'}
  function decorateRoles(root=document){roots(root,'[data-od14-component="tab"]').forEach((node)=>{node.dataset.od14Active=String(node.classList?.contains('active')||node.getAttribute?.('aria-pressed')==='true'||node.getAttribute?.('aria-selected')==='true')});roots(root,'[data-od14-component="status"],[data-od14-component="alert"],[data-od14-component="progress"]').forEach((node)=>{node.dataset.od14Tone=toneFor(node)})}
  function assignControls(root=document){roots(root,'.workspace-content button,dialog button,[role="dialog"] button').forEach((button)=>{button.dataset.od14Component=isIconButton(button)?'icon-button':'button';button.dataset.od14RoleSource='native';const className=classNameOf(button);button.dataset.od14Variant=className.includes('primary')||button.type==='submit'?'primary':className.includes('danger')||className.includes('destructive')?'danger':'secondary'});roots(root,'.workspace-content input:not([type="checkbox"]):not([type="radio"]),.workspace-content select,.workspace-content textarea,dialog input:not([type="checkbox"]):not([type="radio"]),dialog select,dialog textarea,[role="dialog"] input:not([type="checkbox"]):not([type="radio"]),[role="dialog"] select,[role="dialog"] textarea').forEach((field)=>{field.dataset.od14Component='field';field.dataset.od14RoleSource='native'})}
  function assignComponents(root=document){
    markExistingRoles(root);
    setRole(root,COMPONENTS.surface,'surface');setRole(root,COMPONENTS.card,'card');setRole(root,COMPONENTS.sectionHead,'section-head');setRole(root,COMPONENTS.toolbar,'toolbar');setRole(root,COMPONENTS.filterbar,'filterbar');setRole(root,COMPONENTS.tabs,'tabs');setRole(root,COMPONENTS.tab,'tab');setRole(root,COMPONENTS.metrics,'metrics');setRole(root,COMPONENTS.metric,'metric');setRole(root,COMPONENTS.masterDetail,'master-detail');setRole(root,COMPONENTS.tableWrap,'table-wrap');setRole(root,COMPONENTS.table,'table');setRole(root,COMPONENTS.inspector,'inspector');setRole(root,COMPONENTS.definitionGrid,'definition-grid');setRole(root,COMPONENTS.definitionItem,'definition-item');setRole(root,COMPONENTS.entity,'entity');setRole(root,COMPONENTS.empty,'empty');setRole(root,COMPONENTS.status,'status');setRole(root,COMPONENTS.alert,'alert');setRole(root,COMPONENTS.timeline,'timeline');setRole(root,COMPONENTS.timelineItem,'timeline-item');setRole(root,COMPONENTS.progress,'progress');setRole(root,COMPONENTS.list,'list');setRole(root,COMPONENTS.listItem,'list-item');
    classifyLegacyComponents(root);assignControls(root);decorateRoles(root);
  }
  function auditComponents(root=document){const candidates=componentCandidates(root).filter((node)=>COMPONENT_LIKE.test(classNameOf(node)));const unclassified=candidates.filter((node)=>!node.dataset.od14Component);candidates.forEach((node)=>node.toggleAttribute?.('data-od14-unclassified',!node.dataset.od14Component));if(document.body?.dataset){document.body.dataset.od14ComponentAudit=`${candidates.length-unclassified.length}/${candidates.length}`;document.body.dataset.od14UnclassifiedComponents=String(unclassified.length)}return Object.freeze({total:candidates.length,classified:candidates.length-unclassified.length,unclassified:unclassified.length})}
  function preserveWhitespace(original,replacement){const leading=original.match(/^\s*/)?.[0]||'';const trailing=original.match(/\s*$/)?.[0]||'';return`${leading}${replacement}${trailing}`}
  function translateValue(value){const original=String(value||'');let translated=global.SynthaI18n?.translate?global.SynthaI18n.translate(original):original;const dictionary=locale()==='en'?EN_EXACT:RU_EXACT;return dictionary[translated]||dictionary[original]||translated}
  function translateText(root=document){roots(root,UI_TEXT_SELECTOR).forEach((container)=>{const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT,{acceptNode(node){const parent=node.parentElement;if(!parent||!node.nodeValue?.trim())return NodeFilter.FILTER_REJECT;if(parent.closest('script,style,textarea,input,[contenteditable="true"],.entity-title,.entity-code,td,dd,[data-od14-business-data="true"]'))return NodeFilter.FILTER_REJECT;return NodeFilter.FILTER_ACCEPT}});const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);nodes.forEach((node)=>{const original=node.nodeValue||'';const value=original.trim();const translated=translateValue(value);if(translated&&translated!==value)node.nodeValue=preserveWhitespace(original,translated)})});roots(root,'[placeholder],[aria-label],[title]').forEach((node)=>{['placeholder','aria-label'].forEach((attribute)=>{const value=node.getAttribute(attribute)?.trim();if(!value)return;const translated=translateValue(value);if(translated&&translated!==value)node.setAttribute(attribute,translated)})})}
  function decorateAbbreviations(root=document){const active=locale()==='en'?1:0;roots(root,UI_TEXT_SELECTOR).forEach((node)=>{if(node.children.length>0)return;const value=node.textContent?.trim()||'';const codes=Object.keys(ABBREVIATIONS).filter((code)=>new RegExp(`(^|[^A-Za-z])${code}(?=$|[^A-Za-z])`).test(value));if(!codes.length)return;const explanation=codes.map((code)=>`${code}: ${ABBREVIATIONS[code][active]}`).join('\n');node.dataset.od14Tooltip=explanation;node.title=explanation})}
  function auditLanguage(root=document){let unresolved=0;if(locale()==='ru'){roots(root,UI_TEXT_SELECTOR).forEach((node)=>{if(node.children.length>0||node.closest('[data-od14-business-data="true"]'))return;const words=(node.textContent||'').match(/[A-Za-z][A-Za-z-]*/g)||[];const leaks=words.filter((word)=>!ALLOWED_LATIN.has(word)&&!ALLOWED_LATIN.has(word.toUpperCase()));node.toggleAttribute('data-od14-untranslated',leaks.length>0);unresolved+=leaks.length})}else roots(root,'[data-od14-untranslated="true"]').forEach((node)=>node.removeAttribute('data-od14-untranslated'));document.body.dataset.od14LanguageAudit=String(unresolved);return unresolved}
  function apply(root=document){document.body.classList.add('omnidata-v14');document.body.dataset.synthaComponentSystem=BUILD;assignComponents(root);translateText(root);decorateAbbreviations(root);auditLanguage(root);auditComponents(root)}
  function scheduleApply(){if(scheduled)return;scheduled=true;global.queueMicrotask(()=>{scheduled=false;apply(document)})}
  function installObserver(){if(observer||!global.MutationObserver)return;observer=new global.MutationObserver((mutations)=>{if(mutations.some((mutation)=>mutation.addedNodes.length||mutation.type==='attributes'))scheduleApply()});observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-selected','aria-pressed']})}

  if(typeof renderApp==='function'){const previousRenderApp=renderApp;renderApp=(...args)=>{const result=previousRenderApp(...args);apply(document);return result}}
  global.addEventListener('syntha:locale-changed',scheduleApply);
  installObserver();scheduleApply();
  global.SynthaOmnidataV14Components=Object.freeze({build:BUILD,apply,assignComponents,semanticRoleFor,classifyLegacyComponents,auditComponents,translateText,auditLanguage,roleRules:ROLE_RULES});
})(window);
