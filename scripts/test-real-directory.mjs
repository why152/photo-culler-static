import { chromium, expect } from '@playwright/test';
import { readdir, stat, readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, extname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/test-real-directory.mjs SOURCE_DIRECTORY [OUTPUT_JSON]');
const output = resolve(process.argv[3] ?? 'output/real-acceptance.json');
const baseURL = 'http://127.0.0.1:4173';
const names = (await readdir(source)).filter(name => ['.jpg', '.jpeg', '.rw2', '.xmp', '.png', '.webp'].includes(extname(name).toLowerCase())).sort();
const manifest = async () => Promise.all(names.map(async name => { const value = await stat(join(source, name)); return [name, value.size, value.mtimeMs]; }));
const before = await manifest();
const firstJPEG=names.find(name=>/\.jpe?g$/i.test(name));
const firstRAW=names.find(name=>/\.rw2$/i.test(name));
assert.ok(firstJPEG && firstRAW && firstJPEG.slice(0,firstJPEG.lastIndexOf('.'))===firstRAW.slice(0,firstRAW.lastIndexOf('.')), 'Acceptance requires the first copied JPEG and RAW to form a photo group');
const sampleNames = [names.find(name => /\.jpe?g$/i.test(name)), names.filter(name => /\.jpe?g$/i.test(name)).at(-1), names.find(name => /\.rw2$/i.test(name))].filter(Boolean);
const digests = await Promise.all(sampleNames.map(async name => createHash('sha256').update(await readFile(join(source, name))).digest('hex')));
let browser, server, profile;
const report = { measuredAt: new Date().toISOString(), fixture: 'Original-byte copies of user-authorized camera files in isolated Chrome OPFS; native external-directory picker and native-file moves are not exercised.', sourceFiles: names.length, sourceBytes: before.reduce((sum, [,size])=>sum+size,0), sourceExtensions: Object.fromEntries([...new Set(names.map(name=>extname(name).toLowerCase()))].map(ext=>[ext,names.filter(name=>extname(name).toLowerCase()===ext).length])), pageErrors: [], nonlocalRequests: [] };
try {
  if (!await fetch(baseURL).then(r=>r.ok).catch(()=>false)) {
    server = spawn(process.execPath, ['scripts/static-test-server.mjs'], { stdio:'ignore' });
    for(let i=0;i<100;i++){ if(await fetch(baseURL).then(r=>r.ok).catch(()=>false))break; await new Promise(r=>setTimeout(r,100)); }
  }
  profile = await mkdtemp(join(tmpdir(), 'photo-real-test-'));
  browser = await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true});
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  page.setDefaultTimeout(30_000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => { if(message.text().startsWith('REALTEST ')) console.log(message.text()); });
  await page.route('**/*', route => {
    const url=route.request().url();
    if(/^https?:/.test(url)&&!url.startsWith(baseURL+'/')){report.nonlocalRequests.push({method:route.request().method(), origin:new URL(url).origin});return route.abort();}
    return route.continue();
  });
  await page.goto(baseURL);
  report.userAgent=await page.evaluate(()=>navigator.userAgent);
  await page.evaluate(()=>{const input=document.createElement('input'); input.type='file';input.multiple=true;input.id='real-fixture-files';input.hidden=true;document.body.append(input);});
  await page.locator('#real-fixture-files').setInputFiles(names.map(name=>join(source,name)));
  console.log('REALTEST copying original bytes into isolated OPFS');
  report.copy=await page.evaluate(async ({sampleNames,digests})=>{
    const root=await navigator.storage.getDirectory();
    const quota=await navigator.storage.estimate();
    const allFiles=[...document.querySelector('#real-fixture-files').files];
    const firstRaw=allFiles.find(file=>/\.rw2$/i.test(file.name));
    const files=allFiles.filter(file=>!(/\.rw2$/i.test(file.name))||file===firstRaw);
    const size=files.reduce((sum,file)=>sum+file.size,0);
    console.log('REALTEST storage '+JSON.stringify({quota,size}));
    if(quota.quota-quota.usage<size*1.1)throw new Error('Insufficient isolated storage quota');
    const directory=await root.getDirectoryHandle('real-camera-acceptance',{create:true});
    const t=performance.now();let bytes=0;
    for(let i=0;i<files.length;i++){
      const file=files[i];const handle=await directory.getFileHandle(file.name,{create:true});
      const writer=await handle.createWritable();await writer.write(file);await writer.close();
      if((await handle.getFile()).size!==file.size)throw new Error('Copy size mismatch');
      bytes+=file.size;
      if((i+1)%64===0)console.log(`REALTEST copy ${i+1}/${files.length} ${Math.round(bytes/1e6)} MB`);
    }
    for(let i=0;i<sampleNames.length;i++){
      const file=await (await directory.getFileHandle(sampleNames[i])).getFile();
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
      if(hash!==digests[i])throw new Error('Sample copy hash mismatch');
    }
    window.__realSource=directory;
    window.showDirectoryPicker=async()=>directory;
    document.querySelector('#real-fixture-files').remove();
    return {files:files.length,bytes,milliseconds:performance.now()-t,sampleHashesMatched:sampleNames.length, omittedRawCopies:allFiles.length-files.length, coverage:'All analysis sources copied byte-for-byte; one real RAW companion copied for paired move/restore; remaining RAW files only source metadata checked.'};
  },{sampleNames,digests});
  const instrument=async()=>page.evaluate(async()=>{
    const {BrowserPhotoAnalyzer}=await import('/modules/photo-analysis.js');
    const original=BrowserPhotoAnalyzer.prototype.reportDiagnostics;
    window.__realRecords=[];
    BrowserPhotoAnalyzer.prototype.reportDiagnostics=function(record){window.__realRecords.push(record); if(window.__realRecords.length%100===0)console.log(`REALTEST analyzed ${window.__realRecords.length}`); return original.call(this,record);};
  });
  const completed=()=>page.getByRole('status',{name:'操作进度',exact:true});
  await instrument();
  let t=performance.now();
  await page.locator('#empty-choose-folder').click();
  await expect(page.locator('.photo-card').first()).toBeVisible();
  report.cold={firstGridMs:performance.now()-t};
  await expect(page.locator('.photo-card-preview').first()).toHaveJSProperty('tagName','IMG',{timeout:120_000});
  report.cold.firstPreviewMs=performance.now()-t;
  console.log('REALTEST cold grid and first preview ready');
  await expect(completed()).toContainText('照片分析完成',{timeout:600_000});
  report.cold.completeMs=performance.now()-t;
  const inspect=async()=>page.evaluate(async()=>{
    const {BrowserReviewStore}=await import('/modules/browser-store.js');
    const store=new BrowserReviewStore();const db=await store.database;
    const records=await new Promise((resolve,reject)=>{const r=db.transaction('analysis').objectStore('analysis').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const diagnosticRecords=window.__realRecords??[];
    const statuses={};let unreadable=0;
    for(const {analysis} of records){statuses[analysis.status]=(statuses[analysis.status]??0)+1;if(!analysis.thumbnail)unreadable++;}
    const directory=await store.loadLastDirectory();let files=0;for await(const entry of directory.values())if(entry.kind==='file')files++;
    await store.close();
    return {cached:records.length,unreadable,statuses,files,records:diagnosticRecords.length,hits:diagnosticRecords.filter(r=>r.cacheHit).length,misses:diagnosticRecords.filter(r=>!r.cacheHit).length,cacheErrors:diagnosticRecords.flatMap(r=>r.cacheErrors)};
  });
  report.cold.result=await inspect();
  assert.equal(report.cold.result.unreadable,0);assert.equal(report.cold.result.files,report.copy.files);assert.equal(report.cold.result.cached,names.filter(name=>/\.(jpg|jpeg|png|webp)$/i.test(name)).length);
  console.log('REALTEST cold complete '+Math.round(report.cold.completeMs)+' ms');
  // Reopen production workspace through persisted OPFS handle, preserving cache.
  await page.reload();await instrument();t=performance.now();
  await page.locator('#resume-folder').click();
  await expect(completed()).toContainText('照片分析完成',{timeout:120_000});
  report.warm={completeMs:performance.now()-t,result:await inspect()};
  assert.equal(report.warm.result.hits,report.cold.result.cached);assert.equal(report.warm.result.misses,0);
  console.log('REALTEST warm complete '+Math.round(report.warm.completeMs)+' ms');
  const firstName=names.find(name=>/\.jpe?g$/i.test(name));
  const firstStem=firstName.slice(0,firstName.lastIndexOf('.'));
  await page.locator(`[id="photo-card:photo-group:${firstStem}"]`).click();
  await expect(page.locator('#viewer-image-frame')).toHaveAttribute('aria-busy','false',{timeout:60_000});
  await expect(page.locator('#viewer-image')).toHaveJSProperty('naturalWidth',await page.locator('#viewer-image').evaluate(e=>e.naturalWidth));
  assert.ok(await page.locator('#viewer-image').evaluate(e=>e.naturalWidth>0));
  for(let i=0;i<12;i++)await page.keyboard.press('ArrowRight');
  await expect(page.locator('#viewer-position')).toHaveText(`13 / ${report.cold.result.cached}`);
  await page.keyboard.press('2');await page.keyboard.press('u');
  await expect(page.locator('#review-count')).toContainText(`已筛 0 / ${report.cold.result.cached}`);
  await expect(page.locator('#viewer-image-frame')).toHaveAttribute('aria-busy','false',{timeout:60_000});
  const savedName=await page.locator('#viewer-name').textContent();
  await expect(page.locator('#review-save-status')).toBeHidden();
  await page.reload();await page.locator('#resume-folder').click();
  await expect(page.locator('#photo-viewer')).toBeVisible();
  await expect(page.locator('#viewer-name')).toHaveText(savedName);
  await expect(completed()).toContainText('照片分析完成',{timeout:120_000});
  await page.locator('#viewer-close').click();
  // Check the tail of the virtualized queue and full-resolution rendering.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  const lastName=names.filter(name=>/\.jpe?g$/i.test(name)).at(-1);const lastStem=lastName.slice(0,lastName.lastIndexOf('.'));
  await page.locator(`[id="photo-card:photo-group:${lastStem}"]`).click();
  await expect(page.locator('#viewer-position')).toHaveText(`${report.cold.result.cached} / ${report.cold.result.cached}`);
  await expect(page.locator('#viewer-image-frame')).toHaveAttribute('aria-busy','false',{timeout:60_000});
  assert.ok(await page.locator('#viewer-image').evaluate(e=>e.naturalWidth>0));
  await page.locator('#viewer-close').click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.getByRole('button',{name:`选择 ${firstName}`,exact:true}).click();
  let pairedConfirm=false;
  page.once('dialog',dialog=>{pairedConfirm=/确认移动 1 个照片组、共 2 个文件/.test(dialog.message());return dialog.accept();});
  await page.locator('#move-button').click();
  assert.ok(pairedConfirm,'Expected exact two-member photo group move');
  await expect(completed()).toContainText('已移动到可恢复批次',{timeout:60_000});
  await page.locator('#moved-groups-button').click();
  await page.getByRole('button',{name:'恢复整批',exact:true}).click();
  await expect(completed()).toContainText('已恢复 可恢复批次',{timeout:120_000});
  report.interactions={navigation:true,reviewAndUndo:true,viewerResume:true,tailVirtualization:true,pairedGroupMoveRestore:true};
  const restored=await inspect();assert.equal(restored.files,report.copy.files);report.restoredFiles=restored.files;
  report.restoredSampleHashesMatched=await page.evaluate(async({sampleNames,digests})=>{const {BrowserReviewStore}=await import('/modules/browser-store.js');const store=new BrowserReviewStore();const directory=await store.loadLastDirectory();for(let i=0;i<sampleNames.length;i++){const file=await(await directory.getFileHandle(sampleNames[i])).getFile();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');if(hash!==digests[i])throw new Error('Restored sample hash mismatch');}await store.close();return sampleNames.length;},{sampleNames,digests});
  await page.evaluate(async()=>{const root=await navigator.storage.getDirectory();await root.removeEntry('real-camera-acceptance',{recursive:true});});
  report.isolatedCopiesRemoved=true;
  assert.deepEqual(await manifest(),before);
  const afterDigests=await Promise.all(sampleNames.map(async name=>createHash('sha256').update(await readFile(join(source,name))).digest('hex')));
  assert.deepEqual(afterDigests,digests);
  report.sourceIntegrity={metadataUnchanged:true,sampleHashesMatched:digests.length};
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.nonlocalRequests,[]);
  report.passed=true;
} catch(error){report.passed=false;report.failure=error.stack;process.exitCode=1;}
finally {
  try { assert.deepEqual(await manifest(),before);const actual=await Promise.all(sampleNames.map(async name=>createHash('sha256').update(await readFile(join(source,name))).digest('hex')));assert.deepEqual(actual,digests);report.sourceIntegrity={metadataUnchanged:true,sampleHashesMatched:digests.length}; } catch(error) { report.sourceIntegrity={metadataUnchanged:false};report.passed=false;report.failure=error.stack;process.exitCode=1; }
  await browser?.close();if(profile)await rm(profile,{recursive:true,force:true});server?.kill();await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log('REALTEST report '+output);}
