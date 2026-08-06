(function installOmnidataV14RoleSystem(global){
  'use strict';

  const BUILD='visual-20260806-14-role-system-1';
  const CORE_ROLES=Object.freeze(['table','filterbar','card','status','inspector','button','field']);
  const SOURCE_PRIORITY=Object.freeze({heuristic:10,structure:20,component:30,explicit:40,native:50});
  const COMPONENT_TO_ROLE=Object.freeze({
    table:'table','table-wrap':'table',
    filterbar:'filterbar',toolbar:'filterbar',tabs:'filterbar',pagination:'filterbar',breadcrumb:'filterbar','global-search':'filterbar',segmented:'filterbar','button-group':'filterbar','section-head':'filterbar',
    card:'card',surface:'card',metrics:'card',metric:'card',layout:'card','master-detail':'card',list:'card','list-item':'card',entity:'card',empty:'card',timeline:'card','timeline-item':'card','timeline-part':'card',progress:'card','progress-track':'card','progress-fill':'card','definition-grid':'card','definition-item':'card',form:'card',
    status:'status',alert:'status',toast:'status',
    inspector:'inspector',
    button:'button','icon-button':'button',tab:'button','segmented-option':'button','navigation-item':'button','navigation-action':'button',
    field:'field','field-group':'field',choice:'field'
  });
  const EXPLICIT_SELECTORS=Object.freeze({
    table:'table,.od-table,.ls9-table,.bom-table,.measurement-table,.measurement-matrix,.sample-table,.sourcing-table,.tech-pack-table,.production-orders-table,.production-execution-table,.data-table,.table-wrap,.table-wrapper,.table-container,.registry,.registry-container,.data-grid-wrapper,.od-table-wrap,.ls9-table-wrap,.bom-table-wrap,.measurement-table-wrap,.sample-table-wrap,.sourcing-table-wrap,.tech-pack-table-wrap,.production-orders-registry,.production-execution-registry',
    filterbar:'.filters,.filter-row,.filter-panel,.toolbar-filters,.search-panel,.commandbar,.command-bar,.od-commandbar,.ls9-commandbar,.table-toolbar,.toolbar,.action-bar,.actions-bar,.command-actions,[role="tablist"],.pagination,.pager,.breadcrumbs,.breadcrumb,.global-search,.language-switcher,.segmented-control',
    card:'.card,.panel,.tile,.widget,.box,.section,.od-section,.workspace-panel,.summary-card,.info-card,.kpi-grid,.stats-grid,.summary-cards,.record-list,.entity-list,.card-list,.activity-list,.timeline,.milestone-list,.steps,.facts,.info-grid,.details-grid,.metadata-grid,form',
    status:'.badge,.status,.status-badge,.status-chip,.state-pill,.pill,.chip,.alert,.notice,.callout,.message-banner,.toast,.toast-message,[role="alert"]',
    inspector:'.inspector,.od-inspector,.ls9-inspector,.bom-inspector,.measurement-inspector,.sample-inspector,.sourcing-inspector,.tech-pack-inspector,.production-orders-inspector,.production-execution-inspector,.details-panel,.detail-panel,.detail-drawer,.property-panel,.properties-panel,.drawer,.side-panel',
    button:'button,[role="button"],[role="tab"],.button,.btn,.icon-button,.topbar-icon-button,.nav-item,.sidebar-action,.language-option',
    field:'input,select,textarea,fieldset,label.form-field,.field-group,.form-field,.input-group,.control-group'
  });
  const CLASS_RULES=Object.freeze([
    Object.freeze({role:'table',pattern:/(^|[-_ ])(?:table|matrix|registry|data-grid)(?:$|[-_ ])/}),
    Object.freeze({role:'filterbar',pattern:/(^|[-_ ])(?:filter|filters|filterbar|filter-panel|commandbar|command-bar|searchbar|search-bar|search-panel|toolbar|action-bar|actions-bar|tabs|tablist|pagination|pager|breadcrumb|global-search|segmented)(?:$|[-_ ])/}),
    Object.freeze({role:'status',pattern:/(^|[-_ ])(?:status|badge|pill|chip|state|alert|notice|callout|toast|snackbar)(?:$|[-_ ])/}),
    Object.freeze({role:'inspector',pattern:/(^|[-_ ])(?:inspector|details-panel|detail-panel|detail-drawer|properties|property-panel|drawer|side-panel)(?:$|[-_ ])/}),
    Object.freeze({role:'button',pattern:/(^|[-_ ])(?:button|btn|action|tab|nav-item|sidebar-action)(?:$|[-_ ])/}),
    Object.freeze({role:'field',pattern:/(^|[-_ ])(?:field|input|select|textarea|control-group|form-field)(?:$|[-_ ])/}),
    Object.freeze({role:'card',pattern:/(^|[-_ ])(?:card|panel|tile|widget|box|section|surface|metric|kpi|summary|facts|list|timeline|progress|layout|grid)(?:$|[-_ ])/})
  ]);
  const COMPONENT_LIKE=/(table|matrix|registry|grid|filter|search|command|card|panel|tile|widget|box|badge|status|pill|chip|alert|notice|inspector|detail|drawer|toolbar|action|button|btn|field|input|select|textarea|tabs?|timeline|milestone|progress|list|pager|pagination|breadcrumb|toast|form)/i;
  const BUSINESS_DATA_SELECTOR='.entity-title,.entity-code,td,dd,option,[data-od14-business-data="true"],[data-business-data="true"],[data-od14-no-translate="true"]';

  function classText(node){return String(node?.className?.baseVal||node?.className||'').replace(/\s+/g,' ').trim()}
  function sourcePriority(value){return SOURCE_PRIORITY[value]||0}
  function currentSource(node){return String(node?.dataset?.od14UnifiedRoleSource||'heuristic')}
  function setRole(node,role,source='heuristic'){
    if(!node?.dataset||!CORE_ROLES.includes(role))return false;
    if(node.dataset.od14UnifiedRole&&sourcePriority(currentSource(node))>sourcePriority(source))return false;
    if(node.dataset.od14UnifiedRole===role&&currentSource(node)===source)return false;
    node.dataset.od14UnifiedRole=role;
    node.dataset.od14UnifiedRoleSource=source;
    return true;
  }
  function setPart(node,part){if(node?.dataset&&part)node.dataset.od14UnifiedPart=part}

  function roleFor(node){
    if(!node||node.nodeType!==1)return'';
    const tag=String(node.tagName||'').toLowerCase();
    const aria=String(node.getAttribute?.('role')||'').toLowerCase();
    if(tag==='table')return'table';
    if(tag==='button'||aria==='button'||aria==='tab')return'button';
    if(['input','select','textarea','fieldset'].includes(tag))return'field';
    if(aria==='alert')return'status';
    const component=String(node.dataset?.od14Component||'');
    if(COMPONENT_TO_ROLE[component])return COMPONENT_TO_ROLE[component];
    const classes=classText(node).toLowerCase();
    for(const rule of CLASS_RULES)if(rule.pattern.test(classes))return rule.role;
    if(node.querySelector?.('table'))return'table';
    if(node.querySelector?.('input,select,textarea')&&/(filter|search|command|toolbar)/i.test(classes))return'filterbar';
    return'';
  }

  function partFor(node,role){
    const component=String(node?.dataset?.od14Component||'');
    if(component)return component;
    const tag=String(node?.tagName||'').toLowerCase();
    if(role==='table')return tag==='table'?'table':'table-wrap';
    if(role==='button')return /icon/i.test(classText(node))?'icon-button':'button';
    if(role==='field')return ['input','select','textarea'].includes(tag)?tag:(tag==='fieldset'?'fieldset':'field-group');
    if(role==='status')return node?.getAttribute?.('role')==='alert'?'alert':'status';
    return role;
  }

  function applyExplicit(root=document){
    for(const [role,selector] of Object.entries(EXPLICIT_SELECTORS))for(const node of root.querySelectorAll?.(selector)||[]){setRole(node,role,'explicit');setPart(node,partFor(node,role))}
  }
  function applyComponents(root=document){
    for(const node of root.querySelectorAll?.('[data-od14-component]')||[]){const role=COMPONENT_TO_ROLE[node.dataset.od14Component];if(role){setRole(node,role,'component');setPart(node,node.dataset.od14Component)}}
  }
  function applyNative(root=document){
    for(const node of root.querySelectorAll?.('table,button,[role="button"],[role="tab"],input,select,textarea,fieldset,[role="alert"]')||[]){const role=roleFor(node);if(role){setRole(node,role,'native');setPart(node,partFor(node,role))}}
  }
  function applyHeuristics(root=document){
    const scope=root.querySelectorAll?.('.workspace-content *,dialog *, .topbar *, .sidebar *')||[];
    for(const node of scope){if(!node.dataset?.od14UnifiedRole&&(node.dataset?.od14Component||COMPONENT_LIKE.test(classText(node)))){const role=roleFor(node);if(role){setRole(node,role,'heuristic');setPart(node,partFor(node,role))}}}
  }
  function applyStructure(root=document){
    for(const table of root.querySelectorAll?.('table,[data-od14-component="table"]')||[]){const parent=table.parentElement;if(parent&&!parent.dataset?.od14UnifiedRole){setRole(parent,'table','structure');setPart(parent,'table-wrap')}}
    for(const label of root.querySelectorAll?.('label')||[]){if(label.querySelector?.('input,select,textarea')){setRole(label,'field','structure');setPart(label,'field-group')}}
    for(const node of root.querySelectorAll?.('[data-od14-unified-role="filterbar"]')||[])for(const child of node.children||[]){if(child.matches?.('button,[role="button"],[role="tab"]')){setRole(child,'button','structure');setPart(child,partFor(child,'button'))}else if(child.matches?.('input,select,textarea,label')){setRole(child,'field','structure');setPart(child,partFor(child,'field'))}}
  }

  function buttonVariant(node){
    const value=`${classText(node)} ${node?.textContent||''}`.toLowerCase();
    if(/(primary|create|save|publish|confirm|submit|создать|сохранить|опубликовать|подтвердить)/.test(value))return'primary';
    if(/(danger|delete|remove|cancel|reject|удалить|отменить|отклонить)/.test(value))return'danger';
    if(/(ghost|link|tertiary)/.test(value))return'ghost';
    return'secondary';
  }
  function statusTone(node){
    const value=`${classText(node)} ${node?.textContent||''}`.toLowerCase();
    if(/(danger|error|failed|blocked|overdue|rejected|cancelled|ошиб|заблок|просроч|отклон|отмен)/.test(value))return'danger';
    if(/(warning|risk|pending|draft|attention|ожида|чернов|риск|вниман)/.test(value))return'warning';
    if(/(success|ready|approved|active|published|confirmed|complete|успеш|готов|одобрен|актив|опублик|подтверж|заверш)/.test(value))return'success';
    if(/(info|sent|viewed|processing|инфо|отправ|просмотр|обработ)/.test(value))return'info';
    return'neutral';
  }
  function applyVariants(root=document){
    for(const node of root.querySelectorAll?.('[data-od14-unified-role="button"]')||[])node.dataset.od14UnifiedVariant=buttonVariant(node);
    for(const node of root.querySelectorAll?.('[data-od14-unified-role="status"]')||[])node.dataset.od14UnifiedTone=statusTone(node);
  }

  function enforceLanguage(root=document){
    const system=global.SynthaOmnidataV14Components;
    system?.translateInterface?.(root);
    system?.decorateAbbreviations?.(root);
    system?.auditLanguage?.(root);
    if(document.documentElement)document.documentElement.lang=global.SynthaI18n?.getLocale?.()==='en'?'en':'ru';
  }

  function audit(root=document){
    let total=0,classified=0;
    const nodes=root.querySelectorAll?.('.workspace-content *,dialog *, .topbar *, .sidebar *')||[];
    for(const node of nodes){
      if(!node.dataset?.od14Component&&!COMPONENT_LIKE.test(classText(node)))continue;
      total+=1;
      if(node.dataset?.od14UnifiedRole){classified+=1;delete node.dataset.od14UnifiedUnclassified}else node.dataset.od14UnifiedUnclassified='true';
    }
    if(document.body){document.body.dataset.od14UnifiedRoleAudit=`${classified}/${total}`;document.body.dataset.od14UnifiedRoleUnclassified=String(total-classified);document.body.dataset.od14UnifiedRoleBuild=BUILD}
    return Object.freeze({total,classified,unclassified:total-classified});
  }

  function normalize(root=document){
    document.body?.classList?.add('omnidata-v14','omnidata-role-system');
    applyExplicit(root);applyComponents(root);applyNative(root);applyHeuristics(root);applyStructure(root);applyVariants(root);enforceLanguage(root);
    return audit(root);
  }

  let scheduled=false;
  let retries=0;
  function schedule(root=document){
    if(scheduled)return;
    scheduled=true;
    (global.queueMicrotask||((fn)=>Promise.resolve().then(fn)))(()=>{scheduled=false;const result=normalize(root);if(result.total===0&&retries<8){retries+=1;global.setTimeout?.(()=>schedule(document),40*retries)}else retries=0});
  }
  const observer=typeof MutationObserver==='function'?new MutationObserver(()=>schedule(document)):null;
  function boot(){normalize(document);observer?.observe?.(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','role','aria-selected','aria-pressed','hidden']})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  global.addEventListener?.('syntha:locale-changed',()=>schedule(document));
  global.addEventListener?.('popstate',()=>schedule(document));

  global.SynthaOmnidataV14RoleSystem=Object.freeze({BUILD,build:BUILD,coreRoles:CORE_ROLES,componentToRole:COMPONENT_TO_ROLE,explicitSelectors:EXPLICIT_SELECTORS,roleFor,partFor,setRole,buttonVariant,statusTone,normalize,audit,schedule,BUSINESS_DATA_SELECTOR});
})(window);
