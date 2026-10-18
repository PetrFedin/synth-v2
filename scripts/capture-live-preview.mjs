#!/usr/bin/env node
// Screenshot and film only genuinely served public Syntha UI, never mock frames.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, stat, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const origin = process.env.SYNTHA_CAPTURE_URL || 'https://syntha-v2-preview-petr.netlify.app';
if(new URL(origin).protocol!=='https:' || !new URL(origin).hostname.endsWith('.netlify.app'))
  throw new Error('Only the public Netlify deployment may be filmed');
const stamp=new Date().toISOString(),output=join(resolve('artifacts/live-media'),stamp.replace(/[-:.]/g,''));
const raw=join(output,'raw');
await mkdir(raw,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=[],pages=[],errors=[];
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
async function open(page,address,expectedLanguage){
  const response=await page.goto(address,{waitUntil:'domcontentloaded',timeout:20000});
  if(!response||response.status()>399||response.status()<200)
    throw new Error('Not a successful real response: '+address);
  await page.evaluate(async()=>{await document.fonts.ready;});
  const info=await page.evaluate(()=>({
    url:location.href,title:document.title,language:document.documentElement.lang,
    text:document.body.innerText.trim(),
    width:document.documentElement.scrollWidth,viewport:innerWidth,
  }));
  if(info.text.length<100)throw new Error('Blank or unexpected deployed page: '+address);
  pages.push({
    url:info.url,expectedLanguage,title:info.title,language:info.language,
    textLength:info.text.length,textHash:sha(info.text),
    overflowPx:Math.max(0,info.width-info.viewport),httpStatus:response.status(),
  });
}
async function image(page,name){
  await page.screenshot({path:join(output,name),animations:'disabled'});
  if((await stat(join(output,name))).size<5000)throw new Error('Empty screenshot: '+name);
  files.push(name);
}
async function move(page,ratio,delay){
  await page.evaluate(r=>{
    const range=Math.max(0,document.documentElement.scrollHeight-innerHeight);
    window.scrollTo({top:Math.floor(range*r),behavior:'instant'});
  },ratio);
  await page.waitForTimeout(delay);
}
try{
  const desktop=await browser.newContext({
    viewport:{width:1280,height:720},deviceScaleFactor:1,locale:'ru-RU',
    recordVideo:{dir:raw,size:{width:1280,height:720}},
  });
  const page=await desktop.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  const start=Date.now(),english=new URL('/en/',origin).toString();
  await open(page,origin,'ru');
  await image(page,'01-ru-desktop.png');
  await move(page,0.4,2400); await image(page,'02-ru-content.png');
  await move(page,0.9,2200); await move(page,0,1800);
  await open(page,english,'en');
  await image(page,'03-en-desktop.png');
  await move(page,0.5,2600); await image(page,'04-en-content.png');
  await move(page,0.95,2200); await move(page,0,1600);
  await open(page,origin,'ru');
  await move(page,0.5,2200); await move(page,0,1700);
  const duration=Date.now()-start;
  if(duration<26000)await page.waitForTimeout(26000-duration);
  await desktop.close();
  await rename(await page.video().path(),join(output,'syntha-live.webm'));
  files.push('syntha-live.webm');
  const mobile=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU'});
  const mp=await mobile.newPage();
  mp.on('pageerror',e=>errors.push(e.message));
  await open(mp,origin,'ru'); await image(mp,'05-ru-mobile.png');
  await open(mp,english,'en'); await image(mp,'06-en-mobile.png');
  await mobile.close();
}finally{await browser.close();}
execFileSync('ffmpeg',[
  '-hide_banner','-loglevel','error','-y','-i',join(output,'syntha-live.webm'),
  '-an','-c:v','libx264','-pix_fmt','yuv420p','-crf','23',
  '-movflags','+faststart',join(output,'syntha-live-26sec.mp4'),
],{timeout:180000});
const seconds=Number(execFileSync('ffprobe',[
  '-v','error','-show_entries','format=duration',
  '-of','default=noprint_wrappers=1:nokey=1',join(output,'syntha-live-26sec.mp4'),
],{encoding:'utf8'}).trim());
if(seconds<20||seconds>32)throw new Error('Video duration out of range: '+seconds);
files.push('syntha-live-26sec.mp4');
const hashes=[];
for(const name of files){
  const content=await readFile(join(output,name));
  hashes.push({name,bytes:content.byteLength,sha256:sha(content)});
}
const manifest={
  status:'live-public-preview-captured',capturedAt:stamp,url:origin,
  siteType:'Netlify static preview, not authenticated product UI',
  netlifyDeployCommit:'not verifiable (deploy metadata commit_ref is null)',
  currentCodeSha:process.env.GITHUB_SHA||null,
  sourceMatchesCurrentCode:false,videoDurationSeconds:seconds,
  pages,errors,files:hashes,
};
await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({success:true,output,videoSeconds:seconds,images:files.filter(f=>f.endsWith('.png')).length},null,2));
