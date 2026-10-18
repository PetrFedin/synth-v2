#!/usr/bin/env node
// Film an actual running Syntha V2 application, backed by an isolated seeded
// PostgreSQL CI database. Authentication occurs over HTTP BEFORE recording.
// Never record credentials, tokens, real customer data or simulated DOM frames.
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
const fileNames=[],evidence=[],pageErrors=[];
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
    visibleText:document.querySelector('main.main')?.innerText?.trim()??'',
  }));
  evidence.push({name,label,title:facts.title,language:facts.language,
    activeSection:facts.section,navCount:facts.nav,
    visibleTextLength:facts.visibleText.length,
    textDigest:sha(facts.visibleText),
    overflowPixels:Math.max(0,facts.width-facts.viewport)});
  fileNames.push(name);
}
async function go(page,index,pause=2500){
  const nav=page.locator('aside.sidebar nav .nav-item');
  if((await nav.count())<=index)throw new Error('Navigation entry absent: '+index);
  await nav.nth(index).click();
  await page.waitForTimeout(pause);
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
  await recordShot(page,'01-app-overview-ru.png','Authenticated overview');
  await page.waitForTimeout(1700);
  await go(page,1,2500);
  await recordShot(page,'02-app-catalog-ru.png','Real catalog module');
  await go(page,2,2300);
  await recordShot(page,'03-app-showrooms-ru.png','Real showrooms module');
  await go(page,3,2300);
  await recordShot(page,'04-app-partners-ru.png','Real partners module');
  await go(page,0,2300);
  await recordShot(page,'05-app-overview-return.png','Back to workspace');
  // Click the real language control, if it exists; no programmatic translation.
  const lang=page.getByRole('button',{name:/^EN$/}).first();
  if(await lang.count()){await lang.click();await page.waitForTimeout(1800);
    await recordShot(page,'06-app-overview-en.png','Real EN language switch');}
  await go(page,1,2200);
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
  await recordShot(mp,'07-app-overview-mobile.png','Real mobile overview');
  await go(mp,1,650);
  await recordShot(mp,'08-app-catalog-mobile.png','Real mobile catalog');
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
if(!Number.isFinite(duration)||duration<20||duration>34)
  throw new Error('Authentic app clip duration exceeds acceptance window '+duration);
fileNames.push('syntha-plm-live-26sec.mp4');
const hashes=[];
for(const name of fileNames){
  const data=await readFile(join(folder,name));
  hashes.push({name,bytes:data.length,sha256:sha(data)});
}
const commitSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const manifest={
  status:'isolated-live-plm-application-capture',capturedAt:date,
  source:'real Node.js server + ephemeral PostgreSQL 17 + seed-demo service-issued fixtures',
  url,sourceGitSha:commitSha,dbEnvironment:'ephemeral GitHub Actions CI database',
  actualProduction:false,testOnly:true,
  demoActorsOnly:true,credentialsCaptured:false,
  durationSeconds:duration,screens:evidence,consoleErrors:pageErrors,files:hashes,
};
await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({status:'CAPTURED',folder,duration,
  screenshotCount:hashes.filter(f=>f.name.endsWith('.png')).length,
  sourceGitSha:commitSha,pageErrors:pageErrors.length},null,2));
