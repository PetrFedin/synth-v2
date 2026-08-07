(function installOmnidataV13(global){
  'use strict';

  const BUILD='visual-20260804-13';
  const SIDEBAR_KEY='syntha-v2-sidebar-collapsed';
  const TOOLTIP_ID='omnidata-v13-tooltip';
  const LABELS={
    ru:{search:'Поиск в текущем разделе',system:'Syntha — операционная система моды',server:'Время сервера: UTC+3'},
    en:{search:'Search current section',system:'Syntha — Fashion Operating System',server:'Server time: UTC+3'}
  };
  const RU_EXACT=Object.freeze({
    'PLM / Planning':'PLM / ПЛАНИРОВАНИЕ',
    'PLM / Sourcing':'PLM / ЗАКУПКИ',
    'PLM / COSTING':'PLM / СЕБЕСТОИМОСТЬ',
    'PLM / FIT & GRADING':'PLM / ПОСАДКА И ГРАДАЦИЯ',
    'PLM / SAMPLE MANAGEMENT':'PLM / УПРАВЛЕНИЕ ОБРАЗЦАМИ',
    'PLM / SOURCING / PRODUCTION ALLOCATION':'PLM / ЗАКУПКИ / РАЗМЕЩЕНИЕ ПРОИЗВОДСТВА',
    'Materials / Trims':'Материалы и фурнитура',
    'Materials and trims':'Материалы и фурнитура',
    'Materials and Trims':'Материалы и фурнитура',
    'Материалы / Trims':'Материалы и фурнитура',
    'BOM и себестоимость':'Спецификация (BOM) и себестоимость',
    'BOM и производственная себестоимость':'Спецификация (BOM) и производственная себестоимость',
    'BOM and production costing':'Спецификация (BOM) и производственная себестоимость',
    'BOM and Costing':'Спецификация (BOM) и себестоимость',
    'Размерные таблицы и grading':'Размерные таблицы и градация размеров',
    'Measurement charts and grading':'Размерные таблицы и градация размеров',
    'Measurement Charts and Grading':'Размерные таблицы и градация размеров',
    'Некорректные grading deltas':'Некорректные межразмерные приращения',
    'Invalid grading deltas':'Некорректные межразмерные приращения',
    'SKU version':'Версия SKU',
    'Lead time':'Срок выполнения',
    'Cost structure':'Структура затрат',
    'Snapshot':'Снимок',
    'Email':'Электронная почта',
    'Linesheets':'Линейные листы',
    'Linesheet':'Линейный лист',
    'No linesheet':'Нет линейного листа',
    'Linesheet is not open':'Линейный лист не открыт',
    'Sourcing sections':'Разделы закупки',
    'PO and production allocation':'PO и размещение производства',
    'Create PO and allocate':'Создать PO и разместить',
    'Product lifecycle management':'Управление жизненным циклом продукта',
    'draft':'Черновик','published':'Опубликовано','approved':'Одобрено','rejected':'Отклонено','cancelled':'Отменено',
    'created':'Создано','open':'Открыто','closed':'Закрыто','pending':'Ожидает','ready':'Готово','active':'Активно',
    'qualified':'Квалифицирован','suspended':'Приостановлен','archived':'Архив','issued':'Отправлен','quoted':'Есть котировки',
    'awarded':'Победитель выбран','allocated':'Размещено в производство','requested':'Запрошен','in-production':'В производстве',
    'received':'Получен','critical':'Критический','high':'Высокий','medium':'Средний','low':'Низкий'
  });
  const EN_EXACT=Object.freeze({
    'PLM / ПЛАНИРОВАНИЕ':'PLM / PLANNING',
    'PLM / ЗАКУПКИ':'PLM / SOURCING',
    'PLM / СЕБЕСТОИМОСТЬ':'PLM / COSTING',
    'PLM / ПОСАДКА И ГРАДАЦИЯ':'PLM / FIT & GRADING',
    'PLM / УПРАВЛЕНИЕ ОБРАЗЦАМИ':'PLM / SAMPLE MANAGEMENT',
    'PLM / ЗАКУПКИ / РАЗМЕЩЕНИЕ ПРОИЗВОДСТВА':'PLM / SOURCING / PRODUCTION ALLOCATION',
    'Материалы и фурнитура':'Materials and Trims',
    'Спецификация (BOM) и себестоимость':'BOM and Costing',
    'Спецификация (BOM) и производственная себестоимость':'Bill of Materials (BOM) and Production Costing',
    'Размерные таблицы и градация размеров':'Measurement Charts and Grading',
    'Некорректные межразмерные приращения':'Invalid grading increments',
    'Версия SKU':'SKU version',
    'Срок выполнения':'Lead time',
    'Структура затрат':'Cost structure',
    'Снимок':'Snapshot',
    'Электронная почта':'Email',
    'Линейные листы':'Linesheets',
    'Линейный лист':'Linesheet',
    'Нет линейного листа':'No linesheet',
    'Линейный лист не открыт':'Linesheet is not open',
    'Разделы закупки':'Sourcing sections',
    'PO и размещение производства':'PO and production allocation',
    'Создать PO и разместить':'Create PO and allocate',
    'Черновик':'Draft','Опубликовано':'Published','Одобрено':'Approved','Отклонено':'Rejected','Отменено':'Cancelled',
    'Создано':'Created','Открыто':'Open','Закрыто':'Closed','Ожидает':'Pending','Готово':'Ready','Активно':'Active',
    'Квалифицирован':'Qualified','Приостановлен':'Suspended','Архив':'Archived','Отправлен':'Issued','Есть котировки':'Quoted',
    'Победитель выбран':'Awarded','Размещено в производство':'Allocated','Запрошен':'Requested','В производстве':'In production',
    'Получен':'Received','Критический':'Critical','Высокий':'High','Средний':'Medium','Низкий':'Low'
  });
  const RU_PHRASES=Object.freeze([
    [/Версионируемые спецификации материалов, snapshot цен, FX и полная воспроизводимая себестоимость изделия\./g,'Версионируемые спецификации материалов, снимки цен, валютные курсы и полная воспроизводимая себестоимость изделия.'],
    [/\bMeasurement Charts\b/g,'Размерные таблицы'],
    [/\bMeasurement Chart\b/g,'Размерная таблица'],
    [/\bFit & Grading\b/g,'Посадка и градация'],
    [/\bgrading deltas\b/gi,'межразмерные приращения'],
    [/\bgrading\b/gi,'градация размеров'],
    [/\bLead time\b/g,'Срок выполнения'],
    [/\bCost structure\b/g,'Структура затрат'],
    [/\bcost snapshot\b/gi,'снимок себестоимости'],
    [/\bsnapshot\b/gi,'снимок'],
    [/\bSample Management\b/g,'Управление образцами'],
    [/\bProduction Allocation\b/gi,'Размещение производства'],
    [/\bSourcing\b/g,'Закупки'],
    [/\bCosting\b/g,'Себестоимость'],
    [/\bTrims\b/g,'фурнитура'],
    [/\bLinesheets\b/g,'Линейные листы'],
    [/\bLinesheet\b/g,'Линейный лист'],
    [/\bEmail\b/g,'Электронная почта'],
    [/\bUnit cost\b/g,'Цена за единицу'],
    [/\bSupplier reference\b/g,'Артикул поставщика'],
    [/\bAvailable quantity\b/g,'Доступное количество']
  ]);
  const ABBREVIATIONS=Object.freeze({
    PLM:{ru:'Управление жизненным циклом продукта',en:'Product Lifecycle Management'},
    BOM:{ru:'Спецификация материалов и компонентов',en:'Bill of Materials'},
    SKU:{ru:'Единица складского учёта',en:'Stock Keeping Unit'},
    POM:{ru:'Точка измерения',en:'Point of Measure'},
    MOQ:{ru:'Минимальная партия заказа',en:'Minimum Order Quantity'},
    ATS:{ru:'Доступно к продаже',en:'Available to Sell'},
    FX:{ru:'Валютный курс',en:'Foreign Exchange'},
    QC:{ru:'Контроль качества',en:'Quality Control'},
    QMS:{ru:'Система управления качеством',en:'Quality Management System'},
    RFQ:{ru:'Запрос коммерческого предложения',en:'Request for Quotation'},
    PO:{ru:'Заказ на закупку',en:'Purchase Order'},
    ERP:{ru:'Система управления ресурсами предприятия',en:'Enterprise Resource Planning'},
    WMS:{ru:'Система управления складом',en:'Warehouse Management System'},
    PIM:{ru:'Система управления информацией о товарах',en:'Product Information Management'},
    OMS:{ru:'Система управления заказами',en:'Order Management System'},
    RFID:{ru:'Радиочастотная идентификация',en:'Radio Frequency Identification'},
    EAN:{ru:'Международный товарный код',en:'European Article Number'},
    GTIN:{ru:'Глобальный номер товарной позиции',en:'Global Trade Item Number'},
    API:{ru:'Программный интерфейс приложения',en:'Application Programming Interface'},
    PDF:{ru:'Формат электронного документа',en:'Portable Document Format'},
    ZIP:{ru:'Формат архивного файла',en:'ZIP archive format'},
    PPS:{ru:'Предсерийный образец',en:'Pre-Production Sample'},
    ISO:{ru:'Международная организация по стандартизации',en:'International Organization for Standardization'},
    HEX:{ru:'Шестнадцатеричное представление цвета',en:'Hexadecimal color value'},
    RGB:{ru:'Цветовая модель красный, зелёный, синий',en:'Red Green Blue color model'},
    INCOTERMS:{ru:'Международные правила толкования торговых терминов',en:'International Commercial Terms'},
    SaaS:{ru:'Программное обеспечение как услуга',en:'Software as a Service'},
    SMB:{ru:'Малый и средний бизнес',en:'Small and Medium Business'}
  });
  const ABBREVIATION_PATTERN=new RegExp(`\\b(${Object.keys(ABBREVIATIONS).join('|')})\\b`,'g');
  const TRANSLATABLE_SELECTOR=[
    '.nav-label','.nav-group-label','.button-label','.breadcrumb','.eyebrow','.view-toolbar-copy','.section-heading',
    '.od-tabs','.od-metrics','.od-commandbar','.od-section-head','.od-inspector-kicker','.od-inspector-tabs','.od-definition-item dt',
    '.bom-header','.bom-tabs','.bom-kpis','.bom-inspector h2','.bom-inspector h3','.bom-summary dt','.bom-risk',
    '.measurement-header','.measurement-tabs','.measurement-kpis','.measurement-inspector h2','.measurement-inspector h3','.measurement-summary dt','.measurement-risk',
    '.sample-header','.sample-tabs','.sample-kpis','.sample-inspector h2','.sample-inspector h3','.sample-summary dt','.sample-risk',
    '.sourcing-header','.sourcing-tabs','.sourcing-kpis','.sourcing-toolbar','.sourcing-inspector h2','.sourcing-inspector h3','.sourcing-details dt',
    '.dialog h2','.dialog h3','.modal h2','.modal h3','.notice','.material-state','.badge','.od-status','.ls9-status',
    '.bom-badge','.measurement-badge','.sample-badge','.sourcing-badge','.workspace-content button','.workspace-content label',
    '.workspace-content legend','.workspace-content th','.workspace-content option','.workspace-content [role="tab"]','.sidebar-footer','.topbar'
  ].join(',');
  const VIEW_TITLES=Object.freeze({
    planning:['Планирование','Planning'],styles:['Модели','Styles'],materials:['Материалы и фурнитура','Materials and Trims'],
    boms:['Спецификация и себестоимость','BOM and Costing'],measurements:['Размерные таблицы','Measurement Charts'],samples:['Образцы','Samples'],
    suppliers:['Поставщики','Suppliers'],rfqs:['Запросы цен (RFQ)','Requests for Quotation (RFQ)'],quotations:['Котировки','Quotations'],production:['Производство','Production']
  });
  const VIEW_SECTIONS=Object.freeze({
    planning:['PLM / Планирование','PLM / Planning'],styles:['PLM / Проектирование','PLM / Product Design'],materials:['PLM / Материалы и фурнитура','PLM / Materials and Trims'],
    boms:['PLM / Спецификация и себестоимость','PLM / BOM and Costing'],measurements:['PLM / Размеры и градация','PLM / Fit and Grading'],samples:['PLM / Образцы','PLM / Sample Management'],
    suppliers:['PLM / Закупки и производство','PLM / Sourcing and Production'],rfqs:['PLM / Закупки и производство','PLM / Sourcing and Production'],
    quotations:['PLM / Закупки и производство','PLM / Sourcing and Production'],production:['PLM / Закупки и производство','PLM / Sourcing and Production']
  });

  let observer=null;
  let scheduled=false;
  let tooltipTarget=null;

  function locale(){return global.I18N?.getLocale?.()==='en'?'en':'ru'}
  function localPair(pair){return pair?.[locale()==='en'?1:0]||''}
  function preserveWhitespace(original,replacement){
    const leading=original.match(/^\s*/)?.[0]||'';
    const trailing=original.match(/\s*$/)?.[0]||'';
    return `${leading}${replacement}${trailing}`;
  }
  function localizeValue(value){
    const active=locale();
    let next=String(value||'');
    if(global.I18N?.translate)next=global.I18N.translate(next);
    const exact=active==='ru'?RU_EXACT:EN_EXACT;
    next=exact[next]||exact[String(value||'')]||next;
    if(active==='ru')for(const [pattern,replacement] of RU_PHRASES)next=next.replace(pattern,replacement);
    return next;
  }
  function translateTextNodes(root){
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{
      acceptNode(node){
        const parent=node.parentElement;
        if(!parent||!node.nodeValue?.trim())return NodeFilter.FILTER_REJECT;
        if(parent.closest('script,style,textarea,input,select,[contenteditable="true"],.od13-abbr'))return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach((node)=>{
      const original=node.nodeValue||'';
      const value=original.trim();
      const translated=localizeValue(value);
      if(translated&&translated!==value)node.nodeValue=preserveWhitespace(original,translated);
    });
  }
  function translateAttributes(root){
    const nodes=[];
    if(root?.nodeType===Node.ELEMENT_NODE)nodes.push(root);
    root?.querySelectorAll?.('[placeholder],[aria-label]').forEach((node)=>nodes.push(node));
    nodes.forEach((node)=>{
      ['placeholder','aria-label'].forEach((attribute)=>{
        const value=node.getAttribute?.(attribute)?.trim();
        if(!value)return;
        const translated=localizeValue(value);
        if(translated&&translated!==value)node.setAttribute(attribute,translated);
      });
    });
  }
  function abbreviationTooltip(abbreviation){return ABBREVIATIONS[abbreviation]?.[locale()]||abbreviation}
  function decorateAbbreviations(root=document){
    root.querySelectorAll?.('.od13-abbr[data-abbreviation]').forEach((node)=>{
      const abbreviation=node.dataset.abbreviation;
      const explanation=abbreviationTooltip(abbreviation);
      node.dataset.od13Tooltip=explanation;
      node.title=explanation;
      node.setAttribute('aria-label',`${abbreviation}: ${explanation}`);
    });
    const scopes=[];
    if(root.nodeType===Node.ELEMENT_NODE&&root.matches?.(TRANSLATABLE_SELECTOR))scopes.push(root);
    root.querySelectorAll?.(TRANSLATABLE_SELECTOR).forEach((node)=>scopes.push(node));
    scopes.forEach((scope)=>{
      const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT,{
        acceptNode(node){
          const parent=node.parentElement;
          const value=node.nodeValue||'';
          if(!parent||parent.closest('script,style,textarea,input,select,option,[contenteditable="true"],.od13-abbr'))return NodeFilter.FILTER_REJECT;
          ABBREVIATION_PATTERN.lastIndex=0;
          const accepted=ABBREVIATION_PATTERN.test(value);
          ABBREVIATION_PATTERN.lastIndex=0;
          return accepted?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;
        }
      });
      const nodes=[];
      while(walker.nextNode())nodes.push(walker.currentNode);
      nodes.forEach((node)=>{
        const value=node.nodeValue||'';
        ABBREVIATION_PATTERN.lastIndex=0;
        let match;
        let last=0;
        const fragment=document.createDocumentFragment();
        while((match=ABBREVIATION_PATTERN.exec(value))){
          if(match.index>last)fragment.append(document.createTextNode(value.slice(last,match.index)));
          const abbreviation=match[1];
          const explanation=abbreviationTooltip(abbreviation);
          const span=document.createElement('span');
          span.className='od13-abbr';
          span.dataset.abbreviation=abbreviation;
          span.dataset.od13Tooltip=explanation;
          span.title=explanation;
          span.setAttribute('aria-label',`${abbreviation}: ${explanation}`);
          span.textContent=abbreviation;
          fragment.append(span);
          last=match.index+abbreviation.length;
        }
        if(last<value.length)fragment.append(document.createTextNode(value.slice(last)));
        node.replaceWith(fragment);
      });
    });
  }
  function applyLocaleAudit(root=document){
    const roots=[];
    if(root.nodeType===Node.ELEMENT_NODE&&root.matches?.(TRANSLATABLE_SELECTOR))roots.push(root);
    root.querySelectorAll?.(TRANSLATABLE_SELECTOR).forEach((node)=>roots.push(node));
    roots.forEach(translateTextNodes);
    translateAttributes(root);
    decorateAbbreviations(root);
  }
  function patchNavigationModels(){
    const groups=[];
    try{if(typeof OD_V5_GROUPS!=='undefined')groups.push(OD_V5_GROUPS)}catch{}
    try{if(typeof OD_V6_GROUPS!=='undefined')groups.push(OD_V6_GROUPS)}catch{}
    const labels={
      planning:['Планирование','Planning'],styles:['Модели','Styles'],materials:['Материалы и фурнитура','Materials and Trims'],
      boms:['Спецификация и себестоимость','BOM and Costing'],measurements:['Размерные таблицы','Measurement Charts'],samples:['Образцы','Samples']
    };
    groups.flatMap((groupSet)=>Array.isArray(groupSet)?groupSet:[]).forEach((group)=>{
      (group.items||[]).forEach((item)=>{
        const pair=labels[item.view];
        if(pair){item.ru=pair[0];item.en=pair[1]}
      });
    });
  }
  function patchViewResolvers(){
    if(global.SynthaOmnidataV13ResolversPatched)return;
    global.SynthaOmnidataV13ResolversPatched=true;
    if(typeof viewTitle==='function'){
      const previous=viewTitle;
      viewTitle=function omnidataV13Title(view){return VIEW_TITLES[view]?localPair(VIEW_TITLES[view]):previous(view)};
    }
    if(typeof viewSectionName==='function'){
      const previous=viewSectionName;
      viewSectionName=function omnidataV13Section(view){return VIEW_SECTIONS[view]?localPair(VIEW_SECTIONS[view]):previous(view)};
    }
  }
  function ensureTooltip(){
    let tooltip=document.getElementById(TOOLTIP_ID);
    if(tooltip)return tooltip;
    tooltip=document.createElement('div');
    tooltip.id=TOOLTIP_ID;
    tooltip.className='od13-tooltip';
    tooltip.setAttribute('role','tooltip');
    document.body.append(tooltip);
    return tooltip;
  }
  function shouldShowTooltip(target){
    if(target.classList.contains('od13-abbr'))return true;
    if(target.matches('.nav-item,.sidebar-action'))return Boolean(document.querySelector('.shell.sidebar-collapsed'));
    return false;
  }
  function hideTooltip(){
    document.getElementById(TOOLTIP_ID)?.classList.remove('visible');
    tooltipTarget=null;
  }
  function positionTooltip(target){
    const text=target.dataset.od13Tooltip?.trim();
    if(!text||!shouldShowTooltip(target)){hideTooltip();return}
    target.title=text;
    target.setAttribute('aria-label',target.getAttribute('aria-label')||text);
    hideTooltip();
    tooltipTarget=target;
  }
  function installTooltipDelegation(){
    if(document.documentElement.dataset.od13TooltipDelegation==='1')return;
    document.documentElement.dataset.od13TooltipDelegation='1';
    document.addEventListener('pointerover',(event)=>{const target=event.target.closest?.('[data-od13-tooltip]');if(target)positionTooltip(target)});
    document.addEventListener('pointerout',(event)=>{if(!tooltipTarget)return;const related=event.relatedTarget;if(related&&tooltipTarget.contains(related))return;hideTooltip()});
    document.addEventListener('focusin',(event)=>{const target=event.target.closest?.('[data-od13-tooltip]');if(target)positionTooltip(target)});
    document.addEventListener('focusout',hideTooltip);
    global.addEventListener('scroll',hideTooltip,true);
    global.addEventListener('resize',hideTooltip);
  }
  function syncSidebar(){
    const shell=document.querySelector('.shell');
    if(!shell)return;
    const collapsed=shell.classList.contains('sidebar-collapsed');
    document.body.classList.toggle('sidebar-is-collapsed',collapsed);
    const collapse=document.querySelector('.sidebar-footer>.sidebar-action:last-child');
    if(collapse){collapse.hidden=false;collapse.removeAttribute('aria-hidden');collapse.tabIndex=0}
    document.querySelectorAll('.nav-item,.sidebar-action').forEach((item)=>{
      const label=item.querySelector('.nav-label,.button-label')?.textContent?.trim()||item.getAttribute('aria-label')||'';
      if(!label)return;
      item.setAttribute('aria-label',label);
      item.dataset.od13Tooltip=label;
      if(collapsed)item.title=label;else item.removeAttribute('title');
    });
    if(!collapsed)hideTooltip();
  }
  function apply(){
    patchNavigationModels();
    patchViewResolvers();
    installTooltipDelegation();
    const active=locale();
    const copy=LABELS[active];
    document.documentElement.lang=active;
    document.body.dataset.locale=active;
    document.body.dataset.synthaVisual=BUILD;
    document.body.classList.add('omnidata-v13');
    applyLocaleAudit(document);
    syncSidebar();
    const search=document.querySelector('.global-search input');
    if(search&&typeof state!=='undefined'&&state.view!=='linesheets'){
      search.placeholder=copy.search;
      search.setAttribute('aria-label',copy.search);
    }
    const footer=document.querySelector('.od-v7-system-footer');
    const spans=footer?.querySelectorAll('span');
    if(spans?.[0]&&spans[0].textContent!==copy.server)spans[0].textContent=copy.server;
    const title=footer?.querySelector('strong');
    if(title&&title.textContent!==copy.system)title.textContent=copy.system;
    if(spans?.length&&spans[spans.length-1].textContent!==BUILD)spans[spans.length-1].textContent=BUILD;
    if(document.title!==copy.system)document.title=copy.system;
  }
  function scheduleApply(){
    if(scheduled)return;
    scheduled=true;
    global.queueMicrotask(()=>{scheduled=false;apply()});
  }
  function installObserver(){
    if(observer||!global.MutationObserver||!document.body)return;
    observer=new global.MutationObserver((mutations)=>{
      if(mutations.some((mutation)=>mutation.addedNodes.length))scheduleApply();
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  try{if(global.localStorage?.getItem(SIDEBAR_KEY)===null&&typeof state!=='undefined')state.sidebarCollapsed=false}catch{}
  const previousRenderApp=renderApp;
  renderApp=(...args)=>{const result=previousRenderApp(...args);apply();return result};
  global.addEventListener('syntha:locale-changed',scheduleApply);
  installObserver();
  global.SynthaOmnidataV13=Object.freeze({build:BUILD,apply,applyLocaleAudit,syncSidebar});
})(window);