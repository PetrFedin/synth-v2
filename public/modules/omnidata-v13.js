(function installOmnidataV13(global){
  'use strict';
  const BUILD='visual-20260804-13';
  const LABELS={
    ru:{search:'Поиск в текущем разделе',system:'Syntha — операционная система моды',server:'Время сервера: UTC+3'},
    en:{search:'Search current section',system:'Syntha — Fashion Operating System',server:'Server time: UTC+3'}
  };
  function locale(){return I18N.getLocale()==='en'?'en':'ru'}
  function apply(){
    const active=locale();
    const copy=LABELS[active];
    document.documentElement.lang=active;
    document.body.dataset.locale=active;
    document.body.dataset.synthaVisual=BUILD;
    document.body.classList.add('omnidata-v13');
    document.querySelector('.shell')?.classList.remove('sidebar-collapsed');
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
    if(spans?.[0])spans[0].textContent=copy.server;
    const title=footer?.querySelector('strong');
    if(title)title.textContent=copy.system;
    if(spans?.length)spans[spans.length-1].textContent=BUILD;
    document.title=copy.system;
  }
  const previousRenderApp=renderApp;
  renderApp=(...args)=>{const result=previousRenderApp(...args);apply();return result};
  global.SynthaOmnidataV13=Object.freeze({build:BUILD,apply});
})(window);
