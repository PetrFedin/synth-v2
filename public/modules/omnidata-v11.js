(function installOmnidataV11(global){
  'use strict';
  const BUILD='visual-20260804-11';
  const ROOTS=['.sidebar','.topbar','.breadcrumb','.global-search','.od-tabs','.od-metrics','.od-commandbar','.od-table','.od-inspector','.ls9-tabs','.ls9-metrics','.ls9-commandbar','.ls9-table','.ls9-inspector','.planning-page','.styles-page','.materials-page','.bom-page','.measurement-page','.sample-page','.card','.section','.notice','dialog','.form-shell'];
  function locale(){return I18N.getLocale()==='en'?'en':'ru'}
  function translateRoot(root){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node=walker.nextNode();
    while(node){
      const value=node.nodeValue;
      if(value&&value.trim()){
        const translated=I18N.translate(value);
        if(translated!==value)node.nodeValue=translated;
      }
      node=walker.nextNode();
    }
    root.querySelectorAll('[title],[aria-label],input[placeholder],textarea[placeholder],option').forEach((element)=>{
      ['title','aria-label','placeholder'].forEach((attribute)=>{
        const value=element.getAttribute?.(attribute);
        if(!value)return;
        const translated=I18N.translate(value);
        if(translated!==value)element.setAttribute(attribute,translated);
      });
      if(element.tagName==='OPTION'){
        const value=element.textContent;
        const translated=I18N.translate(value);
        if(translated!==value)element.textContent=translated;
      }
    });
  }
  function applyShell(){
    const activeLocale=locale();
    document.documentElement.lang=activeLocale;
    document.body.dataset.locale=activeLocale;
    document.body.dataset.synthaVisual=BUILD;
    document.body.classList.add('omnidata-v11');
    const search=document.querySelector('.global-search input');
    if(search&&state.view!=='linesheets'){
      const placeholder=activeLocale==='en'?'Search current section':'Поиск в текущем разделе';
      search.placeholder=placeholder;
      search.setAttribute('aria-label',placeholder);
    }
    const footer=document.querySelector('.od-v7-system-footer');
    const spans=footer?.querySelectorAll('span');
    if(spans?.[0])spans[0].textContent=activeLocale==='en'?'Server time: UTC+3':'Время сервера: UTC+3';
    const title=footer?.querySelector('strong');
    if(title)title.textContent=activeLocale==='en'?'Syntha Fashion Operating System':'Syntha — операционная система моды';
    if(spans?.length)spans[spans.length-1].textContent=BUILD;
    document.title=activeLocale==='en'?'Syntha — Fashion Operating System':'Syntha — операционная система моды';
  }
  function apply(){
    applyShell();
    document.querySelectorAll(ROOTS.join(',')).forEach(translateRoot);
  }
  const previousRenderApp=renderApp;
  renderApp=(...args)=>{const result=previousRenderApp(...args);apply();return result};
  global.SynthaOmnidataV11=Object.freeze({build:BUILD,apply});
})(window);
