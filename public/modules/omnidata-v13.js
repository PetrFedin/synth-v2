(function installOmnidataV13(global){
  'use strict';

  const BUILD='visual-20260804-13';
  const SIDEBAR_KEY='syntha-v2-sidebar-collapsed';
  const STYLE_ID='omnidata-v13-runtime-corrections';
  const TOOLTIP_ID='omnidata-v13-tooltip';
  const LABELS={
    ru:{search:'Поиск в текущем разделе',system:'Syntha — операционная система моды',server:'Время сервера: UTC+3'},
    en:{search:'Search current section',system:'Syntha — Fashion Operating System',server:'Server time: UTC+3'}
  };
  const TRANSLATABLE_SELECTOR=[
    '.nav-label','.nav-group-label','.button-label','.breadcrumb','.eyebrow',
    '.view-toolbar-copy','.section-heading','.od-tab','.ls9-tab','.planning-tab',
    '.styles-tab','.materials-tab','.bom-tab','.measurement-tab','.sample-tab',
    '.od-filter-label','.od-metric-label','.od-metric-detail','.od-section-head',
    '.od-inspector-kicker','.od-inspector-tabs','.od-definition-item dt',
    '.bom-header h1','.bom-header .muted','.bom-header-actions','.bom-kpi',
    '.measurement-header h1','.measurement-header .muted','.measurement-header-actions','.measurement-kpi',
    '.bom-inspector h2','.bom-inspector h3','.bom-summary dt','.bom-risk',
    '.measurement-inspector h2','.measurement-inspector h3','.measurement-summary dt','.measurement-risk',
    '.sourcing-header h1','.sourcing-header .muted','.sourcing-header-actions','.sourcing-kpi',
    '.sourcing-toolbar','.sourcing-tabs','.sourcing-panel','.sourcing-error',
    '.material-state','.workspace-content .muted','.badge','.od-status','.ls9-status',
    'button','label','legend','th','option','[role="tab"]'
  ].join(',');
  const TEXT_REPLACEMENTS={
    ru:[
      ['Материалы / Trims','Материалы / фурнитура'],
      ['Materials / Trims','Материалы / фурнитура'],
      ['Materials and trims','Материалы и фурнитура'],
      ['PLM / COSTING','PLM / СЕБЕСТОИМОСТЬ'],
      ['BOM и производственная себестоимость','Спецификация (BOM) и производственная себестоимость'],
      ['BOM and production costing','Спецификация (BOM) и производственная себестоимость'],
      ['Версионируемые спецификации материалов, snapshot цен, FX и полная воспроизводимая себестоимость изделия.','Версионируемые спецификации материалов, снимки цен, валютные курсы и полная воспроизводимая себестоимость изделия.'],
      ['PLM / FIT & GRADING','PLM / ПОСАДКА И ГРАДАЦИЯ'],
      ['PLM / SOURCING / PRODUCTION ALLOCATION','PLM / ЗАКУПКИ / РАЗМЕЩЕНИЕ ПРОИЗВОДСТВА'],
      ['Размерные таблицы и grading','Размерные таблицы и градация размеров'],
      ['Measurement charts and grading','Размерные таблицы и градация размеров'],
      ['Некорректные grading deltas','Некорректные межразмерные приращения'],
      ['Invalid grading deltas','Некорректные межразмерные приращения'],
      ['SKU version','Версия SKU'],
      ['Lead time','Срок выполнения'],
      ['cost snapshot','снимок себестоимости'],
      ['Cost structure','Структура затрат'],
      ['Snapshot','Снимок'],
      ['Trims','Фурнитура'],
      ['Costing','Себестоимость'],
      ['Fit & Grading','Посадка и градация'],
      ['Grading','Градация размеров']
    ],
    en:[
      ['Материалы / фурнитура','Materials / Trims'],
      ['Материалы и фурнитура','Materials and Trims'],
      ['PLM / СЕБЕСТОИМОСТЬ','PLM / COSTING'],
      ['Спецификация (BOM) и производственная себестоимость','Bill of Materials (BOM) and Production Costing'],
      ['Версионируемые спецификации материалов, снимки цен, валютные курсы и полная воспроизводимая себестоимость изделия.','Versioned material specifications, price snapshots, FX and reproducible product cost.'],
      ['PLM / ПОСАДКА И ГРАДАЦИЯ','PLM / FIT & GRADING'],
      ['PLM / ЗАКУПКИ / РАЗМЕЩЕНИЕ ПРОИЗВОДСТВА','PLM / SOURCING / PRODUCTION ALLOCATION'],
      ['Размерные таблицы и градация размеров','Measurement Charts and Grading'],
      ['Некорректные межразмерные приращения','Invalid grading increments'],
      ['Версия SKU','SKU version'],
      ['Срок выполнения','Lead time']
    ]
  };
  const ABBREVIATIONS={
    PLM:{ru:'Product Lifecycle Management — управление жизненным циклом продукта',en:'Product Lifecycle Management'},
    BOM:{ru:'Bill of Materials — спецификация материалов и компонентов',en:'Bill of Materials'},
    SKU:{ru:'Stock Keeping Unit — единица складского учёта',en:'Stock Keeping Unit'},
    POM:{ru:'Point of Measure — точка измерения',en:'Point of Measure'},
    MOQ:{ru:'Minimum Order Quantity — минимальная партия заказа',en:'Minimum Order Quantity'},
    ATS:{ru:'Available to Sell — доступно к продаже',en:'Available to Sell'},
    FX:{ru:'Foreign Exchange — валютный курс',en:'Foreign Exchange'},
    QC:{ru:'Quality Control — контроль качества',en:'Quality Control'},
    RFQ:{ru:'Request for Quotation — запрос коммерческого предложения',en:'Request for Quotation'},
    PO:{ru:'Purchase Order — заказ на закупку',en:'Purchase Order'},
    ERP:{ru:'Enterprise Resource Planning — система управления ресурсами предприятия',en:'Enterprise Resource Planning'},
    WMS:{ru:'Warehouse Management System — система управления складом',en:'Warehouse Management System'},
    EAN:{ru:'European Article Number — международный товарный код',en:'European Article Number'},
    GTIN:{ru:'Global Trade Item Number — глобальный номер товарной позиции',en:'Global Trade Item Number'}
  };
  const ABBREVIATION_PATTERN=new RegExp(`\\b(${Object.keys(ABBREVIATIONS).join('|')})\\b`,'g');
  const RUNTIME_CSS=`
body.omnidata-v13 .shell.sidebar-collapsed{grid-template-columns:58px minmax(0,1fr)!important}
body.omnidata-v13 .shell.sidebar-collapsed .sidebar{width:58px!important;min-width:58px!important;padding-right:6px!important;padding-left:6px!important;overflow:visible!important}
body.omnidata-v13 .shell.sidebar-collapsed .sidebar .brand{justify-content:center!important;padding:0!important}
body.omnidata-v13 .shell.sidebar-collapsed .brand-copy,
body.omnidata-v13 .shell.sidebar-collapsed .nav-group-label,
body.omnidata-v13 .shell.sidebar-collapsed .nav-label,
body.omnidata-v13 .shell.sidebar-collapsed .button-label{display:none!important}
body.omnidata-v13 .shell.sidebar-collapsed .nav-item,
body.omnidata-v13 .shell.sidebar-collapsed .sidebar-action{justify-content:center!important;gap:0!important;padding:0!important}
body.omnidata-v13 .shell.sidebar-collapsed .sidebar-footer .language-switcher{justify-content:center!important}
body.omnidata-v13 .sidebar-footer>.sidebar-action:last-child{display:flex!important}
body.omnidata-v13.sidebar-is-collapsed .od-v7-system-footer{left:58px!important}
body.omnidata-v13 .od13-tooltip{position:fixed;z-index:10000;display:none;max-width:280px;padding:7px 9px;border:1px solid rgba(255,255,255,.12);border-radius:3px;background:#252832;color:#fff;font-size:10px;line-height:1.3;box-shadow:0 6px 18px rgba(26,28,34,.22);pointer-events:none;white-space:normal}
body.omnidata-v13 .od13-tooltip.visible{display:block}
body.omnidata-v13 .od13-abbr{border-bottom:1px dotted currentColor;cursor:help;text-decoration:none}
body.omnidata-v13 .bom-page,
body.omnidata-v13 .measurement-page,
body.omnidata-v13 .sourcing-workspace,
body.omnidata-v13 .od-view{width:100%!important;min-width:0!important;max-width:100%!important}
body.omnidata-v13 .bom-header,
body.omnidata-v13 .measurement-header,
body.omnidata-v13 .sourcing-header{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:start!important;gap:8px 14px!important;margin:0!important;padding:10px 0 8px!important;border:0!important;background:transparent!important;box-shadow:none!important}
body.omnidata-v13 .bom-header>div:first-child,
body.omnidata-v13 .measurement-title,
body.omnidata-v13 .sourcing-header>div:first-child{min-width:0!important;max-width:760px!important}
body.omnidata-v13 .bom-header h1,
body.omnidata-v13 .measurement-header h1,
body.omnidata-v13 .sourcing-header h1{margin:0!important;color:#30333a!important;font-size:16px!important;font-weight:600!important;line-height:1.22!important;letter-spacing:0!important}
body.omnidata-v13 .bom-header .muted,
body.omnidata-v13 .measurement-header .muted,
body.omnidata-v13 .sourcing-header .muted{max-width:760px!important;margin:4px 0 0!important;color:var(--od13-muted)!important;font-size:10px!important;line-height:1.35!important}
body.omnidata-v13 .bom-header-actions,
body.omnidata-v13 .measurement-header-actions,
body.omnidata-v13 .sourcing-header-actions{display:flex!important;min-width:0!important;align-items:center!important;justify-content:flex-end!important;flex-wrap:wrap!important;gap:6px!important}
body.omnidata-v13 .workspace-content button.primary,
body.omnidata-v13 .workspace-content button.secondary{display:inline-flex!important;min-height:var(--od13-control-height)!important;align-items:center!important;justify-content:center!important;padding:0 10px!important;border:1px solid var(--od13-line-strong)!important;border-radius:var(--od13-radius)!important;background:#fff!important;color:#4d5056!important;font-size:9.5px!important;font-weight:400!important;line-height:1!important;box-shadow:none!important;white-space:nowrap!important}
body.omnidata-v13 .workspace-content button.primary{border-color:var(--od13-accent)!important;background:var(--od13-accent)!important;color:#fff!important}
body.omnidata-v13 .workspace-content button.primary:hover{border-color:var(--od13-accent-hover)!important;background:var(--od13-accent-hover)!important}
body.omnidata-v13 .workspace-content button.secondary:hover{border-color:#f3a184!important;background:#fffaf7!important;color:var(--od13-accent)!important}
body.omnidata-v13 .bom-kpis,
body.omnidata-v13 .measurement-kpis,
body.omnidata-v13 .sourcing-kpis{grid-column:1/-1!important;display:grid!important;grid-template-columns:repeat(auto-fit,minmax(132px,1fr))!important;gap:6px!important;width:100%!important;min-width:0!important;padding:2px 0 0!important}
body.omnidata-v13 .bom-kpi,
body.omnidata-v13 .measurement-kpi,
body.omnidata-v13 .sourcing-kpi{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;grid-template-areas:'label value' 'detail detail'!important;align-items:center!important;gap:1px 8px!important;min-width:0!important;min-height:44px!important;padding:7px 9px!important;border:1px solid var(--od13-line)!important;border-radius:var(--od13-radius)!important;background:#fff!important;box-shadow:none!important;overflow:hidden!important}
body.omnidata-v13 .bom-kpi span,
body.omnidata-v13 .measurement-kpi span,
body.omnidata-v13 .sourcing-kpi span{grid-area:label!important;min-width:0!important;color:var(--od13-text-soft)!important;font-size:8.5px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
body.omnidata-v13 .bom-kpi strong,
body.omnidata-v13 .measurement-kpi strong,
body.omnidata-v13 .sourcing-kpi strong{grid-area:value!important;color:#30333a!important;font-size:13px!important;font-weight:600!important;white-space:nowrap!important}
body.omnidata-v13 .measurement-kpi small,
body.omnidata-v13 .sourcing-kpi small{grid-area:detail!important;color:var(--od13-muted)!important;font-size:8px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
body.omnidata-v13 .bom-tabs,
body.omnidata-v13 .measurement-tabs{margin-top:2px!important;margin-bottom:0!important}
body.omnidata-v13 .sourcing-tabs{display:flex!important;min-width:0!important;min-height:38px!important;align-items:stretch!important;gap:22px!important;margin:2px -12px 0!important;padding:0 12px!important;border-bottom:1px solid var(--od13-line)!important;background:#fff!important;overflow-x:auto!important}
body.omnidata-v13 .sourcing-tabs button{position:relative!important;flex:0 0 auto!important;min-height:38px!important;padding:0!important;border:0!important;background:transparent!important;color:#4d5057!important;font-size:9.5px!important;font-weight:400!important;white-space:nowrap!important}
body.omnidata-v13 .sourcing-tabs button.active{color:var(--od13-accent)!important;font-weight:500!important}
body.omnidata-v13 .sourcing-tabs button.active::after{position:absolute!important;right:0!important;bottom:0!important;left:0!important;height:1px!important;background:var(--od13-accent)!important;content:''!important}
body.omnidata-v13 .sourcing-panel{min-width:0!important;max-width:100%!important;border:1px solid var(--od13-line)!important;border-radius:var(--od13-radius)!important;background:#fff!important;box-shadow:var(--od13-shadow)!important;overflow:hidden!important}
body.omnidata-v13 .sourcing-toolbar{display:flex!important;min-height:44px!important;align-items:center!important;justify-content:space-between!important;flex-wrap:wrap!important;gap:6px!important;padding:7px 8px!important;border-bottom:1px solid var(--od13-line)!important;background:#fff!important}
body.omnidata-v13 .sourcing-toolbar h2{margin:0!important;font-size:11px!important;font-weight:600!important}
body.omnidata-v13 .bom-layout,
body.omnidata-v13 .measurement-layout,
body.omnidata-v13 .sourcing-grid{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(300px,340px)!important;gap:10px!important;align-items:start!important;width:100%!important;min-width:0!important;max-width:100%!important;padding-top:8px!important}
body.omnidata-v13 .bom-layout>main,
body.omnidata-v13 .measurement-layout>main,
body.omnidata-v13 .sourcing-grid>*{min-width:0!important;max-width:100%!important}
body.omnidata-v13 .bom-table-wrap,
body.omnidata-v13 .measurement-table-wrap,
body.omnidata-v13 .sourcing-table-wrap{border:1px solid var(--od13-line)!important;border-radius:var(--od13-radius)!important;background:#fff!important;box-shadow:var(--od13-shadow)!important;overflow-x:auto!important}
body.omnidata-v13 .bom-table,
body.omnidata-v13 .measurement-table,
body.omnidata-v13 .measurement-matrix,
body.omnidata-v13 .sourcing-table{min-width:760px!important;table-layout:fixed!important}
body.omnidata-v13 .bom-table th,
body.omnidata-v13 .measurement-table th,
body.omnidata-v13 .measurement-matrix th,
body.omnidata-v13 .sourcing-table th{height:34px!important;padding:0 8px!important;border-bottom:1px solid var(--od13-line)!important;background:var(--od13-panel-soft)!important;color:#666a71!important;font-size:8px!important;font-weight:400!important;text-align:left!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
body.omnidata-v13 .bom-table td,
body.omnidata-v13 .measurement-table td,
body.omnidata-v13 .measurement-matrix td,
body.omnidata-v13 .sourcing-table td{height:var(--od13-row-height)!important;padding:6px 8px!important;border-bottom:1px solid #ededee!important;color:#3f4249!important;font-size:9px!important;vertical-align:middle!important;overflow:hidden!important;text-overflow:ellipsis!important}
body.omnidata-v13 .bom-inspector,
body.omnidata-v13 .measurement-inspector{position:sticky!important;top:calc(var(--od13-topbar) + 10px)!important;width:100%!important;min-width:0!important;max-width:340px!important;max-height:calc(100vh - var(--od13-topbar) - 48px)!important;padding:0!important;border:1px solid var(--od13-line)!important;border-radius:var(--od13-radius)!important;background:#fff!important;box-shadow:var(--od13-shadow)!important;overflow:auto!important}
body.omnidata-v13 .bom-inspector-head,
body.omnidata-v13 .measurement-inspector-head{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important;align-items:start!important;padding:10px 11px 8px!important;border-bottom:1px solid var(--od13-line)!important}
body.omnidata-v13 .bom-inspector h2,
body.omnidata-v13 .measurement-inspector h2{margin:2px 0 0!important;font-size:13px!important;font-weight:600!important;line-height:1.2!important}
body.omnidata-v13 .bom-inspector h3,
body.omnidata-v13 .measurement-inspector h3{margin:0!important;padding:10px 11px 6px!important;font-size:10px!important;font-weight:600!important}
body.omnidata-v13 .bom-summary,
body.omnidata-v13 .measurement-summary{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:0!important;margin:0!important;padding:4px 11px 8px!important}
body.omnidata-v13 .bom-summary>div,
body.omnidata-v13 .measurement-summary>div{min-width:0!important;padding:7px 6px!important;border-bottom:1px solid #efeff0!important}
body.omnidata-v13 .bom-summary dt,
body.omnidata-v13 .measurement-summary dt{color:var(--od13-muted)!important;font-size:7.5px!important}
body.omnidata-v13 .bom-summary dd,
body.omnidata-v13 .measurement-summary dd{margin:2px 0 0!important;color:#34373f!important;font-size:9px!important;overflow-wrap:anywhere!important}
body.omnidata-v13 .bom-inspector-actions,
body.omnidata-v13 .measurement-inspector-actions{display:flex!important;align-items:center!important;justify-content:flex-end!important;flex-wrap:wrap!important;gap:5px!important}
@media(max-width:1180px){
  body.omnidata-v13 .bom-layout,
  body.omnidata-v13 .measurement-layout,
  body.omnidata-v13 .sourcing-grid{grid-template-columns:1fr!important}
  body.omnidata-v13 .bom-inspector,
  body.omnidata-v13 .measurement-inspector{position:relative!important;top:auto!important;max-width:none!important;max-height:none!important}
}
@media(max-width:820px){
  body.omnidata-v13 .shell,
  body.omnidata-v13 .shell.sidebar-collapsed{grid-template-columns:58px minmax(0,1fr)!important}
  body.omnidata-v13 .sidebar,
  body.omnidata-v13 .shell.sidebar-collapsed .sidebar{width:58px!important;min-width:58px!important}
  body.omnidata-v13 .brand-copy,
  body.omnidata-v13 .nav-group-label,
  body.omnidata-v13 .nav-label,
  body.omnidata-v13 .button-label{display:none!important}
  body.omnidata-v13 .bom-header,
  body.omnidata-v13 .measurement-header,
  body.omnidata-v13 .sourcing-header{grid-template-columns:1fr!important}
  body.omnidata-v13 .bom-header-actions,
  body.omnidata-v13 .measurement-header-actions,
  body.omnidata-v13 .sourcing-header-actions{justify-content:flex-start!important}
  body.omnidata-v13 .bom-summary,
  body.omnidata-v13 .measurement-summary{grid-template-columns:1fr!important}
}
`;

  let observer=null;
  let observerScheduled=false;
  let tooltipTarget=null;

  function locale(){return I18N.getLocale()==='en'?'en':'ru'}

  function ensureRuntimeStyles(){
    let style=document.getElementById(STYLE_ID);
    if(style)return style;
    style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=RUNTIME_CSS;
    document.head.append(style);
    return style;
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

  function preserveWhitespace(original,replacement){
    const leading=original.match(/^\s*/)?.[0]||'';
    const trailing=original.match(/\s*$/)?.[0]||'';
    return `${leading}${replacement}${trailing}`;
  }

  function normalizeText(value,active){
    let next=String(value||'');
    for(const [source,replacement] of TEXT_REPLACEMENTS[active]||[]){
      if(next===source)next=replacement;
      else if(next.includes(source))next=next.split(source).join(replacement);
    }
    return next;
  }

  function translateTextNodes(root){
    if(!root||typeof I18N.translate!=='function')return;
    const active=locale();
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{
      acceptNode(node){
        const parent=node.parentElement;
        const value=node.nodeValue?.trim();
        if(!parent||!value)return NodeFilter.FILTER_REJECT;
        if(parent.closest('script,style,textarea,input,select,option,[contenteditable="true"],.od13-abbr'))return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach((node)=>{
      const original=node.nodeValue||'';
      const value=original.trim();
      const translated=normalizeText(I18N.translate(value),active);
      if(translated&&translated!==value)node.nodeValue=preserveWhitespace(original,translated);
    });
  }

  function translateAttributes(root){
    if(!root||typeof I18N.translate!=='function')return;
    const active=locale();
    const nodes=[];
    if(root.nodeType===Node.ELEMENT_NODE)nodes.push(root);
    root.querySelectorAll?.('[placeholder],[title],[aria-label]').forEach((node)=>nodes.push(node));
    nodes.forEach((node)=>{
      ['placeholder','title','aria-label'].forEach((attribute)=>{
        const value=node.getAttribute?.(attribute)?.trim();
        if(!value)return;
        const translated=normalizeText(I18N.translate(value),active);
        if(translated&&translated!==value)node.setAttribute(attribute,translated);
      });
    });
  }

  function abbreviationTooltip(abbreviation){
    return ABBREVIATIONS[abbreviation]?.[locale()]||abbreviation;
  }

  function decorateAbbreviations(root=document){
    root.querySelectorAll?.('.od13-abbr[data-abbreviation]').forEach((node)=>{
      node.dataset.od13Tooltip=abbreviationTooltip(node.dataset.abbreviation);
      node.setAttribute('aria-label',`${node.dataset.abbreviation}: ${node.dataset.od13Tooltip}`);
    });
    const roots=[];
    if(root.nodeType===Node.ELEMENT_NODE)roots.push(root);
    root.querySelectorAll?.('.sidebar,.workspace-content,.topbar').forEach((node)=>roots.push(node));
    roots.forEach((scope)=>{
      const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT,{
        acceptNode(node){
          const parent=node.parentElement;
          const value=node.nodeValue||'';
          if(!parent||!ABBREVIATION_PATTERN.test(value)){ABBREVIATION_PATTERN.lastIndex=0;return NodeFilter.FILTER_REJECT}
          ABBREVIATION_PATTERN.lastIndex=0;
          if(parent.closest('script,style,textarea,input,select,option,[contenteditable="true"],.od13-abbr'))return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
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
          const span=document.createElement('span');
          span.className='od13-abbr';
          span.dataset.abbreviation=abbreviation;
          span.dataset.od13Tooltip=abbreviationTooltip(abbreviation);
          span.setAttribute('aria-label',`${abbreviation}: ${span.dataset.od13Tooltip}`);
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
    root.querySelectorAll?.(TRANSLATABLE_SELECTOR).forEach(translateTextNodes);
    translateAttributes(root);
    decorateAbbreviations(root);
  }

  function syncSidebar(){
    const shell=document.querySelector('.shell');
    if(!shell)return;
    const collapsed=shell.classList.contains('sidebar-collapsed');
    document.body.classList.toggle('sidebar-is-collapsed',collapsed);
    const collapse=document.querySelector('.sidebar-footer>.sidebar-action:last-child');
    if(collapse){
      collapse.hidden=false;
      collapse.removeAttribute('aria-hidden');
      collapse.tabIndex=0;
    }
    document.querySelectorAll('.nav-item,.sidebar-action').forEach((item)=>{
      const label=item.querySelector('.nav-label,.button-label')?.textContent?.trim()||item.getAttribute('aria-label')||item.getAttribute('title')||'';
      if(label){
        item.setAttribute('aria-label',label);
        item.dataset.od13Tooltip=label;
      }
      item.removeAttribute('title');
    });
    if(!collapsed)hideTooltip();
  }

  function shouldShowTooltip(target){
    if(target.classList.contains('od13-abbr'))return true;
    if(target.matches('.nav-item,.sidebar-action'))return Boolean(document.querySelector('.shell.sidebar-collapsed'));
    return false;
  }

  function positionTooltip(target){
    const tooltip=ensureTooltip();
    const text=target.dataset.od13Tooltip?.trim();
    if(!text||!shouldShowTooltip(target)){hideTooltip();return}
    tooltip.textContent=text;
    tooltip.classList.add('visible');
    const rect=target.getBoundingClientRect();
    const width=tooltip.offsetWidth;
    const height=tooltip.offsetHeight;
    const left=Math.min(global.innerWidth-width-10,Math.max(10,rect.right+10));
    const top=Math.min(global.innerHeight-height-10,Math.max(10,rect.top+(rect.height-height)/2));
    tooltip.style.left=`${left}px`;
    tooltip.style.top=`${top}px`;
    tooltipTarget=target;
  }

  function hideTooltip(){
    const tooltip=document.getElementById(TOOLTIP_ID);
    tooltip?.classList.remove('visible');
    tooltipTarget=null;
  }

  function installTooltipDelegation(){
    if(document.documentElement.dataset.od13TooltipDelegation==='1')return;
    document.documentElement.dataset.od13TooltipDelegation='1';
    document.addEventListener('pointerover',(event)=>{
      const target=event.target.closest?.('[data-od13-tooltip]');
      if(target)positionTooltip(target);
    });
    document.addEventListener('pointerout',(event)=>{
      if(!tooltipTarget)return;
      const related=event.relatedTarget;
      if(related&&tooltipTarget.contains(related))return;
      hideTooltip();
    });
    document.addEventListener('focusin',(event)=>{
      const target=event.target.closest?.('[data-od13-tooltip]');
      if(target)positionTooltip(target);
    });
    document.addEventListener('focusout',hideTooltip);
    global.addEventListener('scroll',hideTooltip,true);
    global.addEventListener('resize',hideTooltip);
  }

  function apply(){
    ensureRuntimeStyles();
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
    if(search&&state.view!=='linesheets'){
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
    if(observerScheduled)return;
    observerScheduled=true;
    global.queueMicrotask(()=>{observerScheduled=false;apply()});
  }

  function installObserver(){
    if(observer||!global.MutationObserver||!document.body)return;
    observer=new global.MutationObserver((mutations)=>{
      if(mutations.some((mutation)=>mutation.addedNodes.length))scheduleApply();
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  try{
    if(global.localStorage?.getItem(SIDEBAR_KEY)===null&&typeof state!=='undefined')state.sidebarCollapsed=false;
  }catch{}
  const previousRenderApp=renderApp;
  renderApp=(...args)=>{const result=previousRenderApp(...args);apply();return result};
  global.addEventListener('syntha:locale-changed',scheduleApply);
  installObserver();
  global.SynthaOmnidataV13=Object.freeze({build:BUILD,apply,applyLocaleAudit,syncSidebar});
})(window);
