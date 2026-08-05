(function installOmnidataV14ComponentSystem(global){
  'use strict';

  const BUILD='visual-20260805-14-components-4';
  const ROLE_PRIORITY=Object.freeze({heuristic:10,structure:20,explicit:30,adapter:40,native:50});
  const COMPONENTS=Object.freeze({
    card:'.card:not(.kpi),.panel,.tile,.widget,.box,.tech-pack-card,.production-orders-card,.production-execution-card,.info-card,.summary-card',
    surface:'.section,.od-section,.sourcing-panel,.measurement-matrix-panel,.bom-cost-card,.ls9-master,.workspace-panel',
    sectionHead:'.section-toolbar,.od-section-head,.card-header,.panel-header,.section-header,.bom-section-header,.measurement-section-header,.sample-section-header,.sourcing-section-header',
    toolbar:'.toolbar:not(.section-toolbar),.bom-toolbar,.measurement-toolbar,.sample-toolbar,.sourcing-toolbar-actions,.table-toolbar,.action-bar,.actions-bar,.command-actions',
    filterbar:'.od-commandbar,.ls9-commandbar,.sample-filters,.sourcing-toolbar,.toolbar-filters,.filter-row,.filters,.filter-panel,.search-panel,.bom-filters,.measurement-filters,.sample-toolbar-filters,.sourcing-filters',
    tabs:'.od-tabs,.ls9-tabs,.planning-tabs,.styles-tabs,.materials-tabs,.bom-tabs,.measurement-tabs,.sample-tabs,.sourcing-tabs,.inspector-tabs,.ls9-inspector-tabs,.od-inspector-tabs,[role="tablist"]',
    tab:'.od-tab,.ls9-tab,.planning-tab,.styles-tab,.materials-tab,.bom-tab,.measurement-tab,.sample-tab,.sourcing-tabs>button,.inspector-tabs>button,.ls9-inspector-tabs>button,.od-inspector-tabs>*,[role="tab"]',
    metrics:'.od-metrics,.ls9-metrics,.bom-kpis,.measurement-kpis,.sample-kpis,.sourcing-kpis,.kpi-grid,.grid.kpis,.stats-grid,.summary-cards',
    metric:'.od-metric,.ls9-metric,.bom-kpi,.measurement-kpi,.sample-kpi,.sourcing-kpi,.card.kpi,.stat-card,.stat-tile',
    layout:'.grid.two,.two-column,.two-column-grid,.cards-grid,.dashboard-grid,.content-grid',
    masterDetail:'.od-master-detail,.ls9-layout,.bom-layout,.measurement-layout,.sample-layout,.sourcing-grid',
    tableWrap:'.od-table-wrap,.ls9-table-wrap,.bom-table-wrap,.measurement-table-wrap,.measurement-matrix-panel,.sample-table-wrap,.sourcing-table-wrap,.od-mini-table-wrap,.table-wrap,.table-wrapper,.table-container,.registry,.registry-container,.data-grid-wrapper',
    table:'.od-table,.ls9-table,.bom-table,.measurement-table,.measurement-matrix,.sample-table,.sourcing-table,.od-mini-table,.data-table,table',
    inspector:'.od-inspector,.ls9-inspector,.bom-inspector,.measurement-inspector,.sample-inspector,.sourcing-inspector,.details-panel,.detail-panel,.detail-drawer,.property-panel,.properties-panel',
    definitionGrid:'.od-definition-grid,.bom-summary,.measurement-summary,.sample-summary,.sourcing-details,.ls9-info-grid,.ls9-inspector-summary,.facts,.info-grid,.details-grid,.metadata-grid',
    definitionItem:'.od-definition-item,.bom-summary>div,.measurement-summary>div,.sample-summary>div,.sourcing-details>div,.ls9-info-item,.ls9-inspector-summary>div',
    entity:'.entity,.partner-card,.order-card,.selection-card,.notification-card,.calendar-card',
    list:'.stack,.record-list,.entity-list,.card-list,.compact-list,.activity-list',
    listItem:'.record-list>*,.entity-list>*,.card-list>*,.compact-list>*,.activity-list>*',
    empty:'.empty,.od-empty,.ls9-empty,.empty-state,.no-data,.placeholder-state',
    status:'.badge,.od-status,.bom-badge,.measurement-badge,.sample-badge,.sourcing-badge,.ls9-status,.material-state,.status-badge,.status-chip,.state-pill',
    alert:'.alert,.notice,.error-banner,.warning-banner,.callout,.message-banner,.production-execution-error,.production-orders-error',
    timeline:'.timeline,.production-timeline,.milestone-list,.production-milestone-list,.steps,.step-list',
    timelineItem:'.timeline-item,.milestone,.production-milestone,.step-item',
    timelinePart:'.production-milestone-sequence,.timeline-marker,.milestone-marker,.step-marker',
    progress:'.progress,.production-progress,.progress-bar,.readiness-bar,.completion-bar',
    progressTrack:'.production-progress-track,.progress-track,.readiness-track,.completion-track',
    progressFill:'.production-progress-fill,.progress-fill,.readiness-fill,.completion-fill',
    form:'form',
    buttonGroup:'.row,.actions-row,.button-group,.form-actions,.entity-actions,.pagination-actions',
    pagination:'.pagination,.pager,.ls9-pagination,.table-pagination',
    breadcrumb:'.breadcrumb,.breadcrumbs',
    toast:'.toast,.toast-message',
    globalSearch:'.global-search',
    segmented:'.language-switcher,.segmented-control'
  });
  const ROLE_RULES=Object.freeze([
    Object.freeze({role:'section-head',pattern:/(^|[-_ ])(?:section|card|panel)[-_ ]?(?:head|header|titlebar)(?:$|[-_ ])/}),
    Object.freeze({role:'filterbar',pattern:/(^|[-_ ])(?:filter|filters|filterbar|filter-panel|commandbar|command-bar|searchbar|search-bar|search-panel)(?:$|[-_ ])/}),
    Object.freeze({role:'button-group',pattern:/(^|[-_ ])(?:button-group|actions-row|action-group|form-actions|command-actions)(?:$|[-_ ])/}),
    Object.freeze({role:'pagination',pattern:/(^|[-_ ])(?:pagination|pager|page-controls)(?:$|[-_ ])/}),
    Object.freeze({role:'breadcrumb',pattern:/(^|[-_ ])breadcrumbs?(?:$|[-_ ])/}),
    Object.freeze({role:'toast',pattern:/(^|[-_ ])(?:toast|snackbar)(?:$|[-_ ])/}),
    Object.freeze({role:'table-wrap',pattern:/(^|[-_ ])(?:(?:table|data-grid)[-_ ]?(?:wrap|wrapper|container)|registry(?:-container)?|data-grid-wrapper)(?:$|[-_ ])/}),
    Object.freeze({role:'table',pattern:/(^|[-_ ])(?:table|matrix|data-table)(?:$|[-_ ])/}),
    Object.freeze({role:'inspector',pattern:/(^|[-_ ])(?:inspector|details-panel|detail-panel|detail-drawer|properties|properties-panel|property-panel|drawer|side-panel)(?:$|[-_ ])/}),
    Object.freeze({role:'metrics',pattern:/(^|[-_ ])(?:metrics|kpis|stats-grid|summary-cards)(?:$|[-_ ])/}),
    Object.freeze({role:'metric',pattern:/(^|[-_ ])(?:metric|kpi|stat-card|stat-tile)(?:$|[-_ ])/}),
    Object.freeze({role:'tabs',pattern:/(^|[-_ ])(?:tabs|tablist|tab-list)(?:$|[-_ ])/}),
    Object.freeze({role:'tab',pattern:/(^|[-_ ])tab(?:$|[-_ ])/}),
    Object.freeze({role:'toolbar',pattern:/(^|[-_ ])(?:toolbar|action-bar|actions-bar|command-actions|controls)(?:$|[-_ ])/}),
    Object.freeze({role:'definition-grid',pattern:/(^|[-_ ])(?:facts|summary|info-grid|details-grid|definition-grid|metadata-grid)(?:$|[-_ ])/}),
    Object.freeze({role:'status',pattern:/(^|[-_ ])(?:status|status-chip|badge|pill|chip|state|tag)(?:$|[-_ ])/}),
    Object.freeze({role:'empty',pattern:/(^|[-_ ])(?:empty|empty-state|no-data|placeholder-state)(?:$|[-_ ])/}),
    Object.freeze({role:'alert',pattern:/(^|[-_ ])(?:alert|notice|error|warning|callout|message-banner)(?:$|[-_ ])/}),
    Object.freeze({role:'timeline-item',pattern:/(^|[-_ ])(?:timeline-item|milestone|step-item)(?:$|[-_ ])/}),
    Object.freeze({role:'timeline',pattern:/(^|[-_ ])(?:timeline|milestone-list|step-list|steps)(?:$|[-_ ])/}),
    Object.freeze({role:'progress-fill',pattern:/(^|[-_ ])(?:progress|readiness|completion)[-_ ]?fill(?:$|[-_ ])/}),
    Object.freeze({role:'progress-track',pattern:/(^|[-_ ])(?:progress|readiness|completion)[-_ ]?track(?:$|[-_ ])/}),
    Object.freeze({role:'progress',pattern:/(^|[-_ ])(?:progress|progress-bar|readiness-bar|completion-bar)(?:$|[-_ ])/}),
    Object.freeze({role:'field-group',pattern:/(^|[-_ ])(?:field-group|form-field|input-group|control-group)(?:$|[-_ ])/}),
    Object.freeze({role:'list',pattern:/(^|[-_ ])(?:record-list|entity-list|card-list|compact-list|activity-list|stack)(?:$|[-_ ])/}),
    Object.freeze({role:'list-item',pattern:/(^|[-_ ])(?:record-item|entity-item|card-item|activity-item)(?:$|[-_ ])/}),
    Object.freeze({role:'entity',pattern:/(^|[-_ ])(?:entity|partner|order|selection|notification|calendar)[-_ ]?(?:card|record|item)(?:$|[-_ ])/}),
    Object.freeze({role:'layout',pattern:/(^|[-_ ])(?:two-column|cards-grid|dashboard-grid|content-grid|workspace-layout)(?:$|[-_ ])/}),
    Object.freeze({role:'card',pattern:/(^|[-_ ])(?:card|info-card|summary-card|panel|tile|widget|box)(?:$|[-_ ])/}),
    Object.freeze({role:'surface',pattern:/(^|[-_ ])(?:surface|section|workspace-panel)(?:$|[-_ ])/})
  ]);
  const COMPONENT_LIKE=/(table|registry|grid|filters?|searchbar|commandbar|card|panel|tile|widget|badge|status|pill|chip|inspector|details|drawer|toolbar|action|metric|kpi|tabs?|timeline|milestone|progress|empty|alert|notice|list|stack|row|form|field|pagination|pager|breadcrumb|toast)/i;
  const STRICT_PAIRS=Object.freeze([
    ['Операционная система моды','Fashion Operating System'],['Рабочее пространство','Workspace'],['Коммерческий процесс','Commercial pipeline'],
    ['PLM / Планирование','PLM / Planning'],['PLM / Проектирование продукта','PLM / Product Design'],['PLM / Материалы и фурнитура','PLM / Materials and Trims'],['PLM / BOM и себестоимость','PLM / BOM and Costing'],['PLM / Посадка и градация','PLM / Fit and Grading'],['PLM / Управление образцами','PLM / Sample Management'],['PLM / Закупки и производство','PLM / Sourcing and Production'],['PLM / Контроль технических пакетов','PLM / Tech Pack Control'],['PLM / Контроль производственных заказов','PLM / Production Order Control'],['PLM / Исполнение производства','PLM / Production Execution'],
    ['Технические пакеты','Tech Packs'],['Производственные заказы','Production Orders'],['Исполнение производства','Production Execution'],['Производственный календарь','Production Calendar'],
    ['Листы коллекций','Linesheets'],['Лист коллекции','Linesheet'],['Нет листа коллекции','No linesheet'],['Лист коллекции не открыт','Linesheet is not open'],['Календарный план','Timeline'],['Градация размеров','Grading'],['Посадка и градация','Fit and Grading'],['Управление образцами','Sample Management'],['Размещение производства','Production Allocation'],['Материалы и фурнитура','Materials and Trims'],['Проектирование продукта','Product Design'],['Закупки и производство','Sourcing and Production'],['Спецификация и себестоимость','BOM and Costing'],['Размерные таблицы','Measurement Charts'],['Запросы коммерческих предложений','Requests for Quotation'],['Сравнение предложений','Bid Comparison'],
    ['Срок выполнения','Lead time'],['Цена за единицу','Unit cost'],['Артикул поставщика','Supplier reference'],['Доступное количество','Available quantity'],['Структура затрат','Cost structure'],['Снимок стоимости','Cost snapshot'],['Покупатель / Ретейлер','Buyer / Retailer'],['Дата обновления','Updated'],['Записей на странице','Rows per page'],['Предыдущая страница','Previous page'],['Следующая страница','Next page'],['Дополнительные действия','More actions'],['Действия строки','Row actions'],['Связанные данные','Related data'],['Примерный режим','Sample mode'],['Все листы','All linesheets'],
    ['Главная','Home'],['Карта связей','Relationship map'],['Матрица ролей','Role matrix'],['История изменений','Change history'],['Обзор','Overview'],['Товары','Products'],['Покупатели','Buyers'],['Статистика','Statistics'],['История','History'],['Описание','Description'],['Ассортимент','Assortment'],['Поделиться','Share'],['Открыть лист','Open linesheet'],
    ['Фильтры','Filters'],['Поиск','Search'],['Статус','Status'],['Все статусы','All statuses'],['Все уровни риска','All risk states'],['Только заблокированные','Blocked only'],['Только просроченные','Overdue only'],['Текущий этап','Current milestone'],['Производственный шлюз закрыт','Production gate closed'],['Готово к контролю качества','Ready for QC'],['Материалы готовы','Materials ready'],['Раскрой завершён','Cutting complete'],['Сборка завершена','Assembly complete'],['Пошив завершён','Sewing complete'],['Отделка завершена','Finishing complete'],['Упаковка завершена','Packing complete'],['План','Due'],['Факт','Actual'],['Прогресс','Progress'],
    ['Сезон','Season'],['Коллекция','Collection'],['Коллекции','Collections'],['Кампания','Campaign'],['Кампании','Campaigns'],['Поставщик','Supplier'],['Поставщики','Suppliers'],['Котировки','Quotations'],['Производство','Production'],['Готовность','Readiness'],['Риск','Risk'],['Риски','Risks'],['Исключения','Exceptions'],['Действия','Actions'],['Просмотры','Views'],['Список','List'],['Сетка','Grid'],
    ['Создать','Create'],['Создать календарь','Create calendar'],['Сохранить','Save'],['Редактировать','Edit'],['Опубликовать','Publish'],['Открыть','Open'],['Закрыть','Close'],['Обновить','Refresh'],['Загрузить ещё','Load more'],['Повторить','Retry'],['Выйти','Sign out'],['Загрузка…','Loading…'],
    ['Черновик','Draft'],['Запланировано','Planned'],['В производстве','Active'],['Опубликовано','Published'],['Одобрено','Approved'],['Отклонено','Rejected'],['Отменено','Cancelled'],['Готово','Ready'],['Активна','Active'],['Отправлена','Sent'],['Просмотрена','Viewed'],['Подтверждено','Confirmed'],['Ожидает','Pending'],['Заблокировано','Blocked'],['Просрочено','Overdue'],['Завершено','Completed'],
    ['Ткань','Fabric'],['Фурнитура','Trim'],['Упаковка','Packaging'],['Прочее','Other'],['Условие поставки','Incoterm'],['Условия поставки','Incoterms'],['Электронная почта','Email'],['Валюта','Currency'],['Категории','Categories'],['Страна','Country'],['Количество','Quantity'],['Поставка','Delivery'],['Комментарий','Notes'],['Название','Name'],['Тип','Type'],['Цвет','Color'],['Единица учёта','Unit'],['Состав','Composition'],['Остались черновики SKU','Draft SKU remain'],['Нет SKU','No SKU']
  ]);
  const RU_ALIASES=Object.freeze({
    'FASHION OPERATING SYSTEM':'Операционная система моды',
    'WORKSPACE':'Рабочее пространство',
    'Commercial pipeline':'Коммерческий процесс',
    'Коммерческий pipeline':'Коммерческий процесс',
    'PLM / TECH PACK CONTROL':'PLM / Контроль технических пакетов',
    'PLM / PRODUCTION ORDER CONTROL':'PLM / Контроль производственных заказов',
    'PLM / PRODUCTION EXECUTION':'PLM / Исполнение производства'
  });
  const RU_EXACT=Object.freeze(Object.fromEntries(STRICT_PAIRS.map(([ru,en])=>[en,ru])));
  const EN_EXACT=Object.freeze(Object.fromEntries(STRICT_PAIRS.map(([ru,en])=>[ru,en])));
  const ABBREVIATIONS=Object.freeze({
    PLM:['Управление жизненным циклом продукта','Product Lifecycle Management'],BOM:['Спецификация материалов и компонентов','Bill of Materials'],SKU:['Единица складского учёта','Stock Keeping Unit'],POM:['Точка измерения','Point of Measure'],MOQ:['Минимальная партия заказа','Minimum Order Quantity'],ATS:['Доступно к продаже','Available to Sell'],RFQ:['Запрос коммерческого предложения','Request for Quotation'],PO:['Заказ на закупку','Purchase Order'],ERP:['Система управления ресурсами предприятия','Enterprise Resource Planning'],WMS:['Система управления складом','Warehouse Management System'],PIM:['Система управления информацией о товарах','Product Information Management'],OMS:['Система управления заказами','Order Management System'],QC:['Контроль качества','Quality Control'],QMS:['Система управления качеством','Quality Management System'],FX:['Валютный курс','Foreign Exchange'],API:['Программный интерфейс приложения','Application Programming Interface'],RFID:['Радиочастотная идентификация','Radio Frequency Identification'],EAN:['Международный товарный код','European Article Number'],GTIN:['Глобальный номер товарной позиции','Global Trade Item Number'],EXW:['Самовывоз с предприятия','Ex Works'],FCA:['Передача перевозчику','Free Carrier'],FOB:['Свободно на борту','Free on Board'],CIF:['Стоимость, страхование и фрахт','Cost, Insurance and Freight'],DAP:['Поставка в месте назначения','Delivered at Place'],DDP:['Поставка с оплатой пошлин','Delivered Duty Paid'],EUR:['Евро','Euro'],USD:['Доллар США','United States Dollar'],RUB:['Российский рубль','Russian Ruble'],CNY:['Китайский юань','Chinese Yuan'],GBP:['Фунт стерлингов','Pound Sterling'],ISO:['Международная организация по стандартизации','International Organization for Standardization'],UTC:['Всемирное координированное время','Coordinated Universal Time'],PDF:['Формат электронного документа','Portable Document Format'],ZIP:['Формат архивного файла','ZIP archive format'],PPS:['Предсерийный образец','Pre-Production Sample'],HEX:['Шестнадцатеричное представление цвета','Hexadecimal colour value'],RGB:['Цветовая модель красный, зелёный, синий','Red Green Blue colour model'],RU:['Русский язык','Russian language'],EN:['Английский язык','English language']
  });
  const UI_ROOT_SELECTOR='.sidebar,.topbar,.od14-page-header,.workspace-content,dialog,[role="dialog"],.toast,.login-wrap';
  const BUSINESS_SELECTOR='.entity-title,.entity-code,.meta,td,dd,.topbar-user,.topbar-organisation,[data-od14-business-data="true"],[data-od14-no-translate="true"]';
  const ALLOWED_LATIN=new Set(['SYNTHA','DEALSPACE',...Object.keys(ABBREVIATIONS)]);
  let observer=null;
  let scheduled=false;

  function locale(){return global.SynthaI18n?.getLocale?.()==='en'?'en':'ru'}
  function unique(nodes){return [...new Set(nodes.filter(Boolean))]}
  function isElement(node){return Boolean(node&&node.nodeType===1&&typeof node.matches==='function')}
  function roots(root,selector){const nodes=[];if(isElement(root)&&root.matches(selector))nodes.push(root);root?.querySelectorAll?.(selector).forEach((node)=>nodes.push(node));return unique(nodes)}
  function priority(source){return ROLE_PRIORITY[source]||0}
  function markExistingRoles(root=document){roots(root,'[data-od14-component]').forEach((node)=>{if(!node.dataset.od14RoleSource)node.dataset.od14RoleSource='adapter'})}
  function assignRole(node,role,source='heuristic'){if(!node?.dataset||!role)return false;const currentSource=node.dataset.od14RoleSource||'';if(node.dataset.od14Component&&priority(currentSource)>priority(source))return false;if(node.dataset.od14Component===role&&currentSource===source)return false;node.dataset.od14Component=role;node.dataset.od14RoleSource=source;return true}
  function setRole(root,selector,role){roots(root,selector).forEach((node)=>assignRole(node,role,'explicit'))}
  function classNameOf(node){return String(node?.className&&typeof node.className==='string'?node.className:'').toLowerCase()}
  function contains(node,selector){try{return Boolean(node?.querySelector?.(selector))}catch{return false}}
  function closest(node,selector){try{return node?.closest?.(selector)||null}catch{return null}}
  function semanticRoleFor(node){
    if(!node)return null;
    const tag=String(node.tagName||'').toLowerCase();const ariaRole=String(node.getAttribute?.('role')||'').toLowerCase();const classes=classNameOf(node).replace(/\s+/g,' ');
    if(tag==='table')return'table';if(tag==='form')return'form';if(tag==='fieldset')return'field-group';if(tag==='progress')return'progress';
    if(ariaRole==='tablist')return'tabs';if(ariaRole==='tab')return'tab';if(ariaRole==='status')return'status';if(ariaRole==='alert')return'alert';if(ariaRole==='button')return'button';
    if((tag==='ul'||tag==='ol')&&/(timeline|milestone|step)/.test(classes))return'timeline';
    if(tag==='li'&&node.parentElement?.dataset?.od14Component==='timeline')return'timeline-item';
    if(tag==='label'&&contains(node,'input,select,textarea'))return'field-group';
    if(/(?:^|[-_ ])grid(?:$|[-_ ])/.test(classes)&&contains(node,'.kpi,[class*="kpi"],[class*="metric"],[class*="stat-card"]'))return'metrics';
    if(/(?:^|[-_ ])grid(?:$|[-_ ])/.test(classes)&&contains(node,'.card,.entity,[class*="card"]'))return'layout';
    if(/(?:^|[-_ ])stack(?:$|[-_ ])/.test(classes))return'list';
    if(/(?:^|[-_ ])row(?:$|[-_ ])/.test(classes)&&contains(node,'button,.button,[role="button"]'))return'button-group';
    if(/(?:^|[-_ ])layout(?:$|[-_ ])/.test(classes)&&contains(node,'table')&&contains(node,'[class*="inspector"],[class*="details-panel"],[class*="detail-panel"],[data-od14-component="inspector"]'))return'master-detail';
    if(contains(node,'table')&&/(registry|table|matrix|data-grid)/.test(classes))return'table-wrap';
    for(const rule of ROLE_RULES)if(rule.pattern.test(classes))return rule.role;
    return null;
  }
  function componentCandidates(root=document){return roots(root,'.workspace-content [class],.topbar [class],.sidebar [class],dialog [class],[role="dialog"] [class],.workspace-content table,.workspace-content form,.workspace-content fieldset,.workspace-content progress,dialog table,[role="dialog"] table')}
  function classifyLegacyComponents(root=document){
    let classified=0;
    componentCandidates(root).forEach((node)=>{if(node.dataset.od14Component)return;const role=semanticRoleFor(node);if(role&&assignRole(node,role,'heuristic'))classified+=1});
    roots(root,'[data-od14-component="definition-grid"]>*').forEach((node)=>{if(!node.dataset.od14Component)assignRole(node,'definition-item','structure')});
    roots(root,'[data-od14-component="list"]>*').forEach((node)=>{if(!node.dataset.od14Component)assignRole(node,'list-item','structure')});
    roots(root,'[data-od14-component="timeline"]>*').forEach((node)=>{if(!node.dataset.od14Component)assignRole(node,'timeline-item','structure')});
    roots(root,'[data-od14-component="metrics"]>*').forEach((node)=>{if(!node.dataset.od14Component)assignRole(node,'metric','structure')});
    roots(root,'form label').forEach((node)=>{if(contains(node,'input,select,textarea')&&!node.dataset.od14Component)assignRole(node,'field-group','structure')});
    roots(root,'table').forEach((table)=>{assignRole(table,'table','native');const parent=table.parentElement;if(parent&&!parent.dataset?.od14Component&&parent.children?.length===1)assignRole(parent,'table-wrap','structure')});
    return classified;
  }
  function isIconButton(button){const className=classNameOf(button);const text=(button.textContent||'').trim();return /icon|menu|view-button|row-menu|pagination/.test(className)||(!text&&button.querySelector?.('svg'))||['×','‹','›','•••'].includes(text)}
  function controlRole(button){const classes=classNameOf(button);if(classes.includes('nav-item')||closest(button,'.nav'))return'navigation-item';if(classes.includes('sidebar-action'))return'navigation-action';if(closest(button,'.language-switcher,.segmented-control'))return'segmented-option';return isIconButton(button)?'icon-button':'button'}
  function buttonVariant(button){const value=`${classNameOf(button)} ${(button.textContent||'').toLowerCase()}`;if(/danger|destructive|delete|remove|cancel|critical|удал|отмен/.test(value))return'danger';if(/primary|submit|create|save|publish|confirm|созда|сохран|опубликов|подтверд/.test(value)||button.type==='submit')return'primary';return'secondary'}
  function toneFor(node){const value=`${classNameOf(node)} ${(node?.textContent||'').toLowerCase()}`;if(/danger|error|critical|rejected|cancelled|canceled|blocked|overdue|failed|high|ошиб|отклон|заблок|просроч|отмен/.test(value))return'danger';if(/warning|risk|pending|awaiting|medium|attention|draft|риск|ожида|чернов/.test(value))return'warning';if(/success|approved|confirmed|ready|active|complete|completed|acknowledged|ok|low|готов|одобр|актив|заверш|подтверж/.test(value))return'success';if(/info|issued|sent|in-progress|in progress|running|отправ|в работе/.test(value))return'info';return'neutral'}
  function decorateRoles(root=document){roots(root,'[data-od14-component="tab"]').forEach((node)=>{node.dataset.od14Active=String(node.classList?.contains('active')||node.getAttribute?.('aria-pressed')==='true'||node.getAttribute?.('aria-selected')==='true')});roots(root,'[data-od14-component="status"],[data-od14-component="alert"],[data-od14-component="progress"]').forEach((node)=>{node.dataset.od14Tone=toneFor(node)})}
  function assignControls(root=document){
    roots(root,'.workspace-content button,.topbar button,.sidebar button,.login-wrap button,dialog button,[role="dialog"] button,.workspace-content a.button,.workspace-content [role="button"],.login-wrap a.button,.login-wrap [role="button"],dialog [role="button"],[role="dialog"] [role="button"]').forEach((button)=>{const role=controlRole(button);assignRole(button,role,'native');button.dataset.od14Variant=buttonVariant(button)});
    roots(root,'.workspace-content input:not([type="checkbox"]):not([type="radio"]),.workspace-content select,.workspace-content textarea,.topbar input:not([type="checkbox"]):not([type="radio"]),.login-wrap input:not([type="checkbox"]):not([type="radio"]),.login-wrap select,.login-wrap textarea,dialog input:not([type="checkbox"]):not([type="radio"]),dialog select,dialog textarea,[role="dialog"] input:not([type="checkbox"]):not([type="radio"]),[role="dialog"] select,[role="dialog"] textarea').forEach((field)=>assignRole(field,'field','native'));
    roots(root,'.workspace-content input[type="checkbox"],.workspace-content input[type="radio"],.login-wrap input[type="checkbox"],.login-wrap input[type="radio"],dialog input[type="checkbox"],dialog input[type="radio"],[role="dialog"] input[type="checkbox"],[role="dialog"] input[type="radio"]').forEach((field)=>assignRole(field,'choice','native'));
  }
  function assignComponents(root=document){
    markExistingRoles(root);
    setRole(root,COMPONENTS.card,'card');setRole(root,COMPONENTS.surface,'surface');setRole(root,COMPONENTS.sectionHead,'section-head');setRole(root,COMPONENTS.toolbar,'toolbar');setRole(root,COMPONENTS.filterbar,'filterbar');setRole(root,COMPONENTS.tabs,'tabs');setRole(root,COMPONENTS.tab,'tab');setRole(root,COMPONENTS.metrics,'metrics');setRole(root,COMPONENTS.metric,'metric');setRole(root,COMPONENTS.layout,'layout');setRole(root,COMPONENTS.masterDetail,'master-detail');setRole(root,COMPONENTS.tableWrap,'table-wrap');setRole(root,COMPONENTS.table,'table');setRole(root,COMPONENTS.inspector,'inspector');setRole(root,COMPONENTS.definitionGrid,'definition-grid');setRole(root,COMPONENTS.definitionItem,'definition-item');setRole(root,COMPONENTS.entity,'entity');setRole(root,COMPONENTS.list,'list');setRole(root,COMPONENTS.listItem,'list-item');setRole(root,COMPONENTS.empty,'empty');setRole(root,COMPONENTS.status,'status');setRole(root,COMPONENTS.alert,'alert');setRole(root,COMPONENTS.timeline,'timeline');setRole(root,COMPONENTS.timelineItem,'timeline-item');setRole(root,COMPONENTS.timelinePart,'timeline-part');setRole(root,COMPONENTS.progress,'progress');setRole(root,COMPONENTS.progressTrack,'progress-track');setRole(root,COMPONENTS.progressFill,'progress-fill');setRole(root,COMPONENTS.form,'form');setRole(root,COMPONENTS.buttonGroup,'button-group');setRole(root,COMPONENTS.pagination,'pagination');setRole(root,COMPONENTS.breadcrumb,'breadcrumb');setRole(root,COMPONENTS.toast,'toast');setRole(root,COMPONENTS.globalSearch,'global-search');setRole(root,COMPONENTS.segmented,'segmented');
    classifyLegacyComponents(root);assignControls(root);decorateRoles(root);
  }
  function auditComponents(root=document){const candidates=componentCandidates(root).filter((node)=>COMPONENT_LIKE.test(classNameOf(node))||['table','form','fieldset','progress'].includes(String(node.tagName||'').toLowerCase()));const unclassified=candidates.filter((node)=>!node.dataset.od14Component);candidates.forEach((node)=>node.toggleAttribute?.('data-od14-unclassified',!node.dataset.od14Component));if(document.body?.dataset){document.body.dataset.od14ComponentAudit=`${candidates.length-unclassified.length}/${candidates.length}`;document.body.dataset.od14UnclassifiedComponents=String(unclassified.length)}return Object.freeze({total:candidates.length,classified:candidates.length-unclassified.length,unclassified:unclassified.length})}
  function preserveWhitespace(original,replacement){const leading=original.match(/^\s*/)?.[0]||'';const trailing=original.match(/\s*$/)?.[0]||'';return`${leading}${replacement}${trailing}`}
  function translateValue(value){const original=String(value||'');const translated=global.SynthaI18n?.translate?global.SynthaI18n.translate(original):original;if(locale()==='en')return EN_EXACT[translated]||EN_EXACT[original]||translated;return RU_ALIASES[translated]||RU_ALIASES[original]||RU_EXACT[translated]||RU_EXACT[original]||translated}
  function uiScopes(root=document){return roots(root,UI_ROOT_SELECTOR)}
  function isBusinessNode(node){return Boolean(node?.parentElement?.closest?.(BUSINESS_SELECTOR))}
  function translateText(root=document){
    uiScopes(root).forEach((container)=>{const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT,{acceptNode(node){const parent=node.parentElement;if(!parent||!node.nodeValue?.trim())return NodeFilter.FILTER_REJECT;if(parent.closest('script,style,textarea,input,[contenteditable="true"]')||isBusinessNode(node))return NodeFilter.FILTER_REJECT;return NodeFilter.FILTER_ACCEPT}});const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);nodes.forEach((node)=>{const original=node.nodeValue||'';const value=original.trim();const translated=translateValue(value);if(translated&&translated!==value)node.nodeValue=preserveWhitespace(original,translated)})});
    uiScopes(root).forEach((scope)=>{roots(scope,'[placeholder],[aria-label],[title]').forEach((node)=>{if(node.closest?.(BUSINESS_SELECTOR))return;['placeholder','aria-label'].forEach((attribute)=>{const value=node.getAttribute(attribute)?.trim();if(!value)return;const translated=translateValue(value);if(translated&&translated!==value)node.setAttribute(attribute,translated)})})});
  }
  function decorateAbbreviations(root=document){const active=locale()==='en'?1:0;uiScopes(root).forEach((scope)=>{roots(scope,'*').forEach((node)=>{if(node.children?.length>0||node.closest?.(BUSINESS_SELECTOR))return;const value=node.textContent?.trim()||'';const codes=Object.keys(ABBREVIATIONS).filter((code)=>new RegExp(`(^|[^A-Za-z])${code}(?=$|[^A-Za-z])`).test(value));if(!codes.length)return;const explanation=codes.map((code)=>`${code}: ${ABBREVIATIONS[code][active]}`).join('\n');node.dataset.od14Tooltip=explanation;node.title=explanation})})}
  function auditLanguage(root=document){let unresolved=0;const marked=new Map();if(locale()==='ru'){uiScopes(root).forEach((scope)=>{roots(scope,'*').forEach((node)=>{if(node.children?.length>0||node.closest?.(BUSINESS_SELECTOR))return;const words=(node.textContent||'').match(/[A-Za-z][A-Za-z-]*/g)||[];const leaks=words.filter((word)=>!ALLOWED_LATIN.has(word)&&!ALLOWED_LATIN.has(word.toUpperCase()));if(leaks.length)marked.set(node,leaks.length)})});roots(root,'[data-od14-untranslated="true"]').forEach((node)=>node.removeAttribute('data-od14-untranslated'));marked.forEach((count,node)=>{node.setAttribute('data-od14-untranslated','true');unresolved+=count})}else roots(root,'[data-od14-untranslated="true"]').forEach((node)=>node.removeAttribute('data-od14-untranslated'));if(document.body?.dataset)document.body.dataset.od14LanguageAudit=String(unresolved);return unresolved}
  function apply(root=document){document.body?.classList?.add('omnidata-v14');if(document.body?.dataset)document.body.dataset.synthaComponentSystem=BUILD;assignComponents(root);translateText(root);decorateAbbreviations(root);auditLanguage(root);auditComponents(root)}
  function scheduleApply(){if(scheduled)return;scheduled=true;global.queueMicrotask(()=>{scheduled=false;apply(document)})}
  function installObserver(){if(observer||!global.MutationObserver)return;observer=new global.MutationObserver((mutations)=>{if(mutations.some((mutation)=>mutation.addedNodes?.length||mutation.type==='attributes'))scheduleApply()});observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-selected','aria-pressed']})}

  if(typeof renderApp==='function'){const previousRenderApp=renderApp;renderApp=(...args)=>{const result=previousRenderApp(...args);apply(document);return result}}
  global.addEventListener('syntha:locale-changed',scheduleApply);
  installObserver();scheduleApply();
  global.SynthaOmnidataV14Components=Object.freeze({build:BUILD,apply,assignComponents,assignControls,semanticRoleFor,classifyLegacyComponents,auditComponents,translateText,auditLanguage,roleRules:ROLE_RULES,rolePriority:ROLE_PRIORITY});
})(window);
