(function installOmnidataV13(global){
  'use strict';

  const BUILD='visual-20260804-13';
  const SIDEBAR_KEY='syntha-v2-sidebar-collapsed';
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
    '.badge','.od-status','.ls9-status','button','label','legend','th','option','[role="tab"]'
  ].join(',');

  let observer=null;
  let observerScheduled=false;

  function locale(){return I18N.getLocale()==='en'?'en':'ru'}

  function preserveWhitespace(original,replacement){
    const leading=original.match(/^\s*/)?.[0]||'';
    const trailing=original.match(/\s*$/)?.[0]||'';
    return `${leading}${replacement}${trailing}`;
  }

  function translateTextNodes(root){
    if(!root||typeof I18N.translate!=='function')return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{
      acceptNode(node){
        const parent=node.parentElement;
        const value=node.nodeValue?.trim();
        if(!parent||!value)return NodeFilter.FILTER_REJECT;
        if(parent.closest('script,style,textarea,[contenteditable="true"]'))return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach((node)=>{
      const original=node.nodeValue||'';
      const value=original.trim();
      const translated=I18N.translate(value);
      if(translated&&translated!==value)node.nodeValue=preserveWhitespace(original,translated);
    });
  }

  function translateAttributes(root){
    if(!root||typeof I18N.translate!=='function')return;
    const nodes=[];
    if(root.nodeType===Node.ELEMENT_NODE)nodes.push(root);
    root.querySelectorAll?.('[placeholder],[title],[aria-label]').forEach((node)=>nodes.push(node));
    nodes.forEach((node)=>{
      ['placeholder','title','aria-label'].forEach((attribute)=>{
        const value=node.getAttribute?.(attribute)?.trim();
        if(!value)return;
        const translated=I18N.translate(value);
        if(translated&&translated!==value)node.setAttribute(attribute,translated);
      });
    });
  }

  function applyLocaleAudit(root=document){
    root.querySelectorAll?.(TRANSLATABLE_SELECTOR).forEach(translateTextNodes);
    translateAttributes(root);
  }

  function enforceExpandedSidebar(){
    const shell=document.querySelector('.shell');
    shell?.classList.remove('sidebar-collapsed');
    if(typeof state!=='undefined'&&state){state.sidebarCollapsed=false}
    try{global.localStorage?.setItem(SIDEBAR_KEY,'false')}catch{}
    const collapse=document.querySelector('.sidebar-footer>.sidebar-action:last-child');
    if(collapse){collapse.hidden=true;collapse.setAttribute('aria-hidden','true');collapse.tabIndex=-1}
  }

  function apply(){
    const active=locale();
    const copy=LABELS[active];
    document.documentElement.lang=active;
    document.body.dataset.locale=active;
    document.body.dataset.synthaVisual=BUILD;
    document.body.classList.add('omnidata-v13');
    enforceExpandedSidebar();

    document.querySelectorAll('.nav-item').forEach((item)=>{
      const label=item.querySelector('.nav-label')?.textContent?.trim();
      if(label){item.title=label;item.setAttribute('aria-label',label)}
    });

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
    applyLocaleAudit(document);
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

  const previousRenderApp=renderApp;
  renderApp=(...args)=>{const result=previousRenderApp(...args);apply();return result};
  global.addEventListener('syntha:locale-changed',scheduleApply);
  installObserver();
  global.SynthaOmnidataV13=Object.freeze({build:BUILD,apply,applyLocaleAudit});
})(window);
