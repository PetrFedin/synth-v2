(function installOmnidataV12(global){
  'use strict';
  const BUILD='visual-20260804-12';
  const ROOTS=['.sidebar','.topbar','.breadcrumb','.global-search','.od-tabs','.od-commandbar','.od-table','.od-inspector','.ls9-tabs','.ls9-table','.ls9-inspector','.planning-page','.styles-page','.materials-page','.bom-page','.measurement-page','.sample-page','.card','.section','dialog','.form-shell'];
  function locale(){return I18N.getLocale()==='en'?'en':'ru'}
  function translate(root){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    for(let node=walker.nextNode();node;node=walker.nextNode()){
      const value=node.nodeValue;
      if(value&&value.trim()){const next=I18N.translate(value);if(next!==value)node.nodeValue=next}
    }
    root.querySelectorAll('[title],[aria-label],input[placeholder],textarea[placeholder],option').forEach((element)=>{
      ['title','aria-label','placeholder'].forEach((attribute)=>{const value=element.getAttribute?.(attribute);if(value){const next=I18N.translate(value);if(next!==value)element.setAttribute(attribute,next)}});
      if(element.tagName==='OPTION'){const value=element.textContent;const next=I18N.translate(value);if(next!==value)element.textContent=next}
    });
  }
  function annotateNavigation(){
    document.querySelectorAll('.nav-item').forEach((item)=>{
      const label=item.querySelector('.nav-label')?.textContent?.trim()||item.getAttribute('aria-label')||item.getAttribute('title');
      if(label){item.dataset.v12Label=I18N.translate(label);item.setAttribute('aria-label',I18N.translate(label));item.setAttribute('title',I18N.translate(label))}
    });
  }
  function applyShell(){
    const active=locale();
    document.documentElement.lang=active;
    document.body.dataset.locale=active;
    document.body.dataset.synthaVisual=BUILD;
    document.body.classList.add('omnidata-v12');
    const search=document.querySelector('.global-search input');
    if(search&&state.view!=='linesheets'){
      const text=active==='en'?'Search current section':'Поиск в текущем разделе';
      search.placeholder=text;search.setAttribute('aria-label',text)
    }
    document.title=active==='en'?'Syntha — Fashion Operating System':'Syntha — операционная система моды';
    const footer=document.querySelector('.od-v7-system-footer');
    const end=footer?.querySelector('span:last-child');if(end)end.textContent=BUILD;
    annotateNavigation();
  }
  function apply(){applyShell();document.querySelectorAll(ROOTS.join(',')).forEach(translate)}
  const previousRenderApp=renderApp;
  renderApp=(...args)=>{const result=previousRenderApp(...args);apply();return result};
  global.SynthaOmnidataV12=Object.freeze({build:BUILD,apply});
})(window);
