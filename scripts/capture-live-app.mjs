#!/usr/bin/env node
// Film an actual running Syntha V2 application, backed by an isolated seeded
// PostgreSQL CI database. Authentication occurs over HTTP BEFORE recording.
// Never record credentials, tokens, real customer data or simulated DOM frames.
import { validateLiveAppEvidence } from './live-app-evidence-policy.mjs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir,readFile,rename,stat,writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
const { chromium }=createRequire(import.meta.url)('playwright');
const url='http://127.0.0.1:4100';
const email='owner@syntha.local',password=process.env.SYNTHA_DEMO_OWNER_PASSWORD;
if(!password||password.length<12)throw new Error('CI demo credential not configured');
const date=new Date().toISOString(),folder=join(resolve('artifacts/app-ui-media'),date.replace(/[-:.]/g,''));
await mkdir(join(folder,'raw'),{recursive:true});
const sha=data=>createHash('sha256').update(data).digest('hex');
const auth=await fetch(url+'/v2/auth/login',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({email,password}),
});
if(!auth.ok)throw new Error('Isolated demo login failed HTTP '+auth.status);
const token=(await auth.json())?.data?.accessToken;
if(!token)throw new Error('Authenticated demo session not established');
// Independently prove the real application API sees the seeded manufacturing
// document before filming its browser rendering. No SQL/UI fixture injection.
const response = await fetch(url+'/v2/tech-packs?limit=200',{
  headers:{authorization:'Bearer '+token,accept:'application/json'},
});
if(!response.ok)throw new Error('Authenticated Tech Pack list failed: HTTP '+response.status);
const packPage = (await response.json())?.data;
if(!Array.isArray(packPage?.items))throw new Error('Tech Pack list payload is invalid');
const authenticPacks = packPage.items
  .filter(pack=>pack.status==='acknowledged' && pack.dependencySnapshot);
if(!authenticPacks.length)throw new Error(
  'SEED_TECH_PACK_UNAVAILABLE_TO_OWNER: application API returned no acknowledged pack with frozen source references; total '+packPage.items.length
);
const verifiedPackCodes=authenticPacks.map(pack=>pack.techPackCode);
const fileNames=[],evidence=[],pageErrors=[],layoutChecks=[];
let documentAdmission='not-checked';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
async function pageReady(page){
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
  if(response?.status()!==200)throw new Error('App HTTP not ready '+response?.status());
  await page.locator('.shell .sidebar nav button.nav-item').first().waitFor({timeout:35000});
  const text=(await page.locator('main.main').innerText()).trim();
  if(text.length<60)throw new Error('Authenticated workspace is empty');
  if(await page.locator('.login').count())throw new Error('Never capture login/credentials');
}
async function recordShot(page,name,label){
  if(!await page.locator('.shell').count())throw new Error('Expected working application shell');
  await page.screenshot({path:join(folder,name),animations:'disabled'});
  const bytes=await stat(join(folder,name));
  if(bytes.size<6000)throw new Error('Blank working app screen '+label);
  const facts=await page.evaluate(()=>({
    title:document.title,language:document.documentElement.lang,
    width:document.documentElement.scrollWidth,viewport:innerWidth,
    section:document.querySelector('.breadcrumb')?.textContent,
    nav:document.querySelectorAll('.nav-item').length,
    visibleText:(document.querySelector('main.main')?.textContent ?? '').trim(),
  }));
  evidence.push({name,label,title:facts.title,language:facts.language,
    activeSection:facts.section,navCount:facts.nav,
    visibleTextLength:facts.visibleText.length,
    textDigest:sha(facts.visibleText),
    overflowPixels:Math.max(0,facts.width-facts.viewport)});
  fileNames.push(name);
}
async function checkOverviewLayout(page,viewportKind){
  const layout=await page.evaluate(() => {
    const intersects=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1
      && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
    const metrics=Array.from(document.querySelectorAll('.syntha-hub-metric')).map(node=>{
      const label=node.querySelector('.syntha-hub-metric-label');
      const value=node.querySelector('.syntha-hub-metric-value');
      const labelRect=label?.getBoundingClientRect();
      const valueRect=value?.getBoundingClientRect();
      return {
        labelText:label?.textContent?.trim()||'',
        valueText:value?.textContent?.trim()||'',
        textOverlaps:Boolean(labelRect&&valueRect&&intersects(labelRect,valueRect)),
      };
    });
    const actions=document.querySelector('.topbar-actions');
    const container=actions?.getBoundingClientRect();
    const clipped=actions&&container?Array.from(actions.children).filter(child=>{
      const rect=child.getBoundingClientRect();
      return getComputedStyle(child).display!=='none' && rect.width>0
        && (rect.left<container.left-2 || rect.right>container.right+2);
    }).length:0;
    return {metricCount:metrics.length,metrics,
      clippedTopbarActionCount:clipped,topbarWidth:container?.width??null};
  });
  layoutChecks.push({viewportKind,...layout});
  if(layout.metricCount!==3||layout.metrics.some(m=>!m.labelText||!m.valueText||m.textOverlaps))
    throw new Error('Visible KPI label/value collision or empty overview summary: '+JSON.stringify(layout));
  if(viewportKind==='mobile'&&layout.clippedTopbarActionCount>0)
    throw new Error('Mobile topbar still clips visible actions: '+JSON.stringify(layout));
}
async function go(page,label,pause=1550){
  const nav=page.locator('aside.sidebar nav button.nav-item');
  const labels=(await nav.allTextContents()).map(value=>value.trim());
  const index=labels.findIndex(value=>value===label);
  if(index<0)throw new Error('Exact menu item not found: '+label+
    '; visible navigation labels: '+labels.join(' | '));
  await nav.nth(index).click();
  await page.waitForTimeout(pause);
  const active=(await page.locator('aside.sidebar nav button.nav-item.active').textContent())?.trim();
  if(active!==label)throw new Error('Navigation mismatch: expected '+label+' got '+active);
}
try{
  const context=await browser.newContext({
    viewport:{width:1280,height:720},deviceScaleFactor:1,locale:'ru-RU',
    recordVideo:{dir:join(folder,'raw'),size:{width:1280,height:720}},
  });
  await context.addInitScript(value=>sessionStorage.setItem('syntha-v2-session',value),token);
  const page=await context.newPage();
  page.on('pageerror',error=>pageErrors.push(error.message));
  const start=Date.now();
  await pageReady(page);
  await checkOverviewLayout(page,'desktop');
  await recordShot(page,'01-app-overview-ru.png','Authenticated overview');
  await go(page,'Планирование');
  await recordShot(page,'02-app-planning-ru.png','Real Planning module');
  await go(page,'Коллекции');
  await recordShot(page,'03-app-collections-ru.png','Real Collections module');
  await go(page,'Спецификации и себестоимость');
  await recordShot(page,'04-app-bom-ru.png','Real BOM and costing module');
  await go(page,'Таблицы измерений');
  await recordShot(page,'05-app-measurements-ru.png','Real Measurement Chart module');
  await go(page,'Технические пакеты',850);
  await page.waitForFunction(() => {
    const ui=Reflect.get(window,'SynthaTechPacksWorkspace');
    return Boolean(ui?.loaded || ui?.error);
  },undefined,{timeout:15000});
  const techPackProof=await page.evaluate(()=>({
    loaded:Boolean(Reflect.get(window,'SynthaTechPacksWorkspace')?.loaded),
    error:String(Reflect.get(window,'SynthaTechPacksWorkspace')?.error||''),
    fetchedCount:Reflect.get(window,'SynthaTechPacksWorkspace')?.items?.length??0,
    itemCodes:Reflect.get(window,'SynthaTechPacksWorkspace')?.items?.map(item=>item.techPackCode)??[],
    renderedRows:[...document.querySelectorAll('.tech-pack-table tbody tr')]
      .map(row=>row.textContent||''),
    // Diagnostic only: do not put session, tokens or private tenant payload in media.
    packs:(Reflect.get(window,'SynthaTechPacksWorkspace')?.items||[]).map(value=>({
      brandId:value.brandId,
      status:value.status,
    })),
    uiSelectedCode:Reflect.get(window,'SynthaTechPacksWorkspace')?.selectedCode??null,
    context:(() => {
      const context=eval('state');
      const first=Reflect.get(window,'SynthaTechPacksWorkspace')?.items?.[0];
      const matching=(context.workspace?.memberships||[])
        .filter(m=>m.organisationId===first?.brandId)
        .map(m=>({role:m.role,status:m.status,userId:m.userId,organisationId:m.organisationId}));
      const caps=Reflect.get(window,'SynthaUiCapabilities');
      return {userKeys:Object.keys(context.user||{}),
        actorId:context.user?.id??context.user?.userId??context.user?.email??null,
        matching,capability:caps.hasForOrganisation(context.workspace,first?.brandId,caps.CAPABILITIES.TECH_PACK_READ),
        filters:{status:Reflect.get(window,'SynthaTechPacksWorkspace')?.status,
          readiness:Reflect.get(window,'SynthaTechPacksWorkspace')?.readiness,
          search:Reflect.get(window,'SynthaTechPacksWorkspace')?.search}};
    })(),
  }));
  if(!techPackProof.loaded||techPackProof.error ||
     !techPackProof.renderedRows.some(row=>verifiedPackCodes.some(code=>row.includes(code))))
    throw new Error('TECH_PACK_UI_API_DIVERGENCE '+JSON.stringify(techPackProof));
  await recordShot(page,'06-app-tech-packs-ru.png','Tech Pack list backed by real seeded API');
  const selectedDocCode=authenticPacks[0].techPackCode;
  const documentGet=await fetch(url+'/v2/tech-packs/'+encodeURIComponent(selectedDocCode)+'/document',{
    headers:{authorization:'Bearer '+token,accept:'application/json'},
  });
  const responseBody=await documentGet.json().catch(()=>({}));
  documentAdmission='admitted';
  if(documentGet.status===422 && responseBody.error?.code==='TECH_PACK_CANONICAL_PRINT_NOT_ADMITTED'){
    // Blocked canonical printing is a valid, security-enforcing product state.
    // Never stage a fake "issued document" screenshot or bypass admission.
    documentAdmission='blocked: TECH_PACK_CANONICAL_PRINT_NOT_ADMITTED';
    await recordShot(page,'06b-app-tech-pack-print-admission-blocked-ru.png',
      'Confirmed Tech Pack registry; canonical printing not yet admitted');
  } else if(!documentGet.ok){
    throw new Error('TECH_PACK_ISSUED_DOCUMENT_HTTP_FAILURE status='+documentGet.status+
      ' code='+String(responseBody.error?.code||'unavailable'));
  } else {
    await page.locator('.tech-pack-inspector button').filter({hasText:'Документ'}).first().click();
    try { await page.locator('.tp-doc').waitFor({timeout:12000}); }
    catch(error){
      const screen=await page.locator('.tech-pack-page').innerText().catch(()=>'?');
      throw new Error('TECH_PACK_DOCUMENT_NOT_DISPLAYED view='+screen.slice(0,1500));
    }
    const issuedDocText=(await page.locator('.tp-doc').innerText()).trim();
    if(!issuedDocText.includes(authenticPacks[0].techPackCode) ||
       !issuedDocText.includes('Таблица мер'))
      throw new Error('Frozen issued document is missing expected technical sections');
    await recordShot(page,'06b-app-tech-pack-issued-document-ru.png',
      'Actually admitted supplier technical document');
    await page.locator('.tp-doc-toolbar button').filter({hasText:'Закрыть'}).click();
  }
  await go(page,'Рабочий стол',1050);
  const lang=page.locator('.language-switcher button.language-option').filter({hasText:'EN'});
  if(await lang.count()!==1)throw new Error('English language button missing from actual UI');
  await lang.click();
  await page.waitForTimeout(1200);
  if(await page.locator('html').getAttribute('lang')!=='en')
    throw new Error('RU/EN language switch did not update the actual application');
  await recordShot(page,'07-app-overview-en.png','Real English workspace after language toggle');
  const elapsed=Date.now()-start;
  if(elapsed<26000)await page.waitForTimeout(26000-elapsed);
  await context.close();
  await rename(await page.video().path(),join(folder,'app-raw.webm'));
  // The raw recording begins in an authenticated session; no password ever
  // appears in frames. Keep a matching original as technical audit evidence.
  fileNames.push('app-raw.webm');

  const mobile=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU'});
  await mobile.addInitScript(value=>sessionStorage.setItem('syntha-v2-session',value),token);
  const mp=await mobile.newPage();
  mp.on('pageerror',error=>pageErrors.push(error.message));
  await pageReady(mp);
  await checkOverviewLayout(mp,'mobile');
  await recordShot(mp,'08-app-overview-mobile.png','Real mobile overview');
  await go(mp,'Технические пакеты',900);
  await recordShot(mp,'09-app-tech-packs-mobile.png','Real mobile Tech Packs');
  const mobileEnglish=mp.locator('.language-switcher button.language-option').filter({hasText:'EN'});
  if(await mobileEnglish.count()!==1)throw new Error('Mobile English language button missing');
  await mobileEnglish.click();
  await mp.waitForTimeout(450);
  if(await mp.locator('html').getAttribute('lang')!=='en')
    throw new Error('Mobile English switching failed');
  await recordShot(mp,'10-app-tech-packs-mobile-en.png','Real mobile Tech Packs in English');
  await mobile.close();
}finally{await browser.close();}
execFileSync('ffmpeg',[
  '-hide_banner','-loglevel','error','-y','-i',join(folder,'app-raw.webm'),
  '-an','-c:v','libx264','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',
  join(folder,'syntha-plm-live-26sec.mp4'),
],{timeout:150000});
const duration=Number(execFileSync('ffprobe',[
  '-v','error','-show_entries','format=duration',
  '-of','default=noprint_wrappers=1:nokey=1',join(folder,'syntha-plm-live-26sec.mp4')
],{encoding:'utf8'}).trim());
if(!Number.isFinite(duration)||duration<20||duration>30)
  throw new Error('Authentic app clip duration exceeds acceptance window '+duration);
fileNames.push('syntha-plm-live-26sec.mp4');
const hashes=[];
for(const name of fileNames){
  const data=await readFile(join(folder,name));
  hashes.push({name,bytes:data.length,sha256:sha(data)});
}
const commitSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const acceptance=validateLiveAppEvidence({durationSeconds:duration,screens:evidence,
  consoleErrors:pageErrors,canonicalDocumentAdmission:documentAdmission});
const manifest={
  acceptance,
  status:'isolated-live-plm-application-capture',capturedAt:date,
  source:'real Node.js server + ephemeral PostgreSQL 17 + seed-demo service-issued fixtures',
  url,sourceGitSha:commitSha,dbEnvironment:'ephemeral GitHub Actions CI database',
  actualProduction:false,testOnly:true,
  demoActorsOnly:true,credentialsCaptured:false,
  durationSeconds:duration,screens:evidence,layoutChecks,
  verifiedManufacturingTechPackCodes:verifiedPackCodes,
  canonicalDocumentAdmission:documentAdmission,
  consoleErrors:pageErrors,files:hashes,
};
await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({status:'CAPTURED',folder,duration,
  screenshotCount:hashes.filter(f=>f.name.endsWith('.png')).length,
  sourceGitSha:commitSha,pageErrors:pageErrors.length},null,2));
