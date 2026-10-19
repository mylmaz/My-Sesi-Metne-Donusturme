// Real Electron/preload/FFmpeg/Whisper tests; network tests remain opt-in.
const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const { spawnSync } = require("child_process");
const { inflateRawSync } = require("zlib");
const { app, BrowserWindow, dialog, net } = require("electron");
const { timestampChecks } = require("./ui-regression.cjs");
process.env.ELECTRON_SMOKE = "1";
delete process.env.VITE_DEV_SERVER_URL;
const root = path.resolve(__dirname, "..");
const appRoot = process.env.ELECTRON_APP_ROOT || root;
const resources = process.env.ELECTRON_APP_RESOURCES || root;
if (process.env.ELECTRON_APP_RESOURCES) process.chdir(resources);
const runDir = path.join(root, "build", "electron-smoke", `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`);
const userData = path.join(runDir, "userData");
const documents = path.join(runDir, "documents");
fs.mkdirSync(path.join(userData, "data"), { recursive: true });
fs.mkdirSync(documents, { recursive: true });
// Set these BEFORE importing main: no real user settings/history/exports touched.
app.setPath("userData", userData);
app.setPath("sessionData", path.join(userData, "session"));
app.setPath("documents", documents);
const evidence = { startedAt: new Date().toISOString(), appRoot, resources, runDir, tests: [], transcripts: [], skipped: [] };
const evidencePath = path.join(runDir, "evidence.json");
const settings = { defaultQuality: "Hızlı", defaultLanguage: "Otomatik", timestamps: true, autoCorrect: true, soundEffects: false, animations: false, transparentTheme: true };
const inputDir = path.join(root, "build", "real-media-tests", "input");
const mediaPath = process.env.ELECTRON_TEST_MEDIA || path.join(inputDir, "en_us.wav");
const mp3Path = path.join(runDir, "Türkçe karakterli sürükle bırak.mp3");
let window;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function record(name, detail = {}) {
  evidence.tests.push({ name, status: "passed", ...detail });
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(`ELECTRON_SMOKE_PASS|${name}`);
}
function skip(name, reason) { evidence.skipped.push({ name, status: "skipped", reason }); console.log(`ELECTRON_SMOKE_SKIP|${name}|${reason}`); }
async function until(callback, message, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { const result = await callback(); if (result) return result; } catch (error) { lastError = error; }
    await wait(100);
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ""}`);
}
const js = (source) => window.webContents.executeJavaScript(source, true);
const api = (name, ...args) => js(`window.desktopApi[${JSON.stringify(name)}](...${JSON.stringify(args)})`);
async function click(selector, text) {
  assert(await js(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => ${text === undefined ? "true" : `e.textContent.trim() === ${JSON.stringify(text)}`}); if (!e) return false; e.click(); return true; })()`), `UI öğesi bulunamadı: ${selector} ${text || ""}`);
  await wait(120);
}
async function reload() {
  window.webContents.reload();
  await until(() => js("!!document.querySelector('.languages button.selected') && !!window.desktopApi"), "Arayüz yüklenemedi");
  await wait(250);
}
function createJob(id, sourcePath, language = "Otomatik") {
  return { id, sourcePath, sourceType: "file", name: path.basename(sourcePath), format: path.extname(sourcePath).slice(1).toUpperCase(), sizeText: `${fs.statSync(sourcePath).size} B`, duration: "--:--", durationSeconds: 0, quality: "Hızlı", language, status: "Bekliyor", stage: "Bekliyor", progress: 0, remaining: "Bekliyor", transcript: "", outputFiles: {}, createdAt: new Date().toISOString() };
}
function unzipEntry(buffer, target) {
  for (let at = 0; at + 46 < buffer.length; at++) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) continue;
    const nameLength = buffer.readUInt16LE(at + 28);
    if (buffer.subarray(at + 46, at + 46 + nameLength).toString() !== target) continue;
    const method = buffer.readUInt16LE(at + 10), length = buffer.readUInt32LE(at + 20), local = buffer.readUInt32LE(at + 42);
    const offset = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const compressed = buffer.subarray(offset, offset + length);
    return (method === 8 ? inflateRawSync(compressed) : compressed).toString("utf8");
  }
  throw new Error(`DOCX ZIP girdisi bulunamadı: ${target}`);
}
async function nativeDrop(files, highlight = false) {
  const position = await js("(() => { const r = document.querySelector('.drop-zone').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()");
  const data = { items: [], files, dragOperationsMask: 1 };
  await window.webContents.debugger.sendCommand("Input.dispatchDragEvent", { type: "dragEnter", ...position, data });
  await wait(120);
  if (highlight) assert(await js("document.querySelector('.drop-zone').classList.contains('dragging')"), "Sürükleme vurgusu oluşmadı");
  await window.webContents.debugger.sendCommand("Input.dispatchDragEvent", { type: "dragOver", ...position, data });
  await window.webContents.debugger.sendCommand("Input.dispatchDragEvent", { type: "drop", ...position, data });
}
async function inputValue(selector, value) {
  await js(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await wait(100);
}
async function playerTest(name) {
  await click(".audio-player .round-play");
  await until(() => js("(() => { const a=document.querySelector('.audio-player audio'); return a && !a.paused && a.currentTime>0 && !a.error; })()"), `${name}: Gerçek ses oynatımı başlamadı`, 120000);
  await click(".audio-player .round-play");
  assert(await js("document.querySelector('.audio-player audio').paused"), "Duraklatma çalışmadı");
  const total = await js("document.querySelector('.audio-player audio').duration");
  assert(total>0, "Ses süresi alınamadı");
  await inputValue(".seek-range", 2);
  await until(() => js("Math.abs(document.querySelector('.audio-player audio').currentTime-2)<0.4"), "İlerleme çubuğu çalışmadı");
  await click('[aria-label="10 saniye ileri"]');
  const forward = await js("document.querySelector('.audio-player audio').currentTime");
  assert(Math.abs(forward-Math.min(total,12))<0.5, "10 saniye ileri çalışmadı");
  await click('[aria-label="10 saniye geri"]');
  assert(Math.abs(await js("document.querySelector('.audio-player audio').currentTime")-Math.max(0,forward-10))<0.5, "10 saniye geri çalışmadı");
  await inputValue(".volume-range", 0.35);
  assert(Math.abs(await js("document.querySelector('.audio-player audio').volume")-0.35)<0.01, "Ses seviyesi çalışmadı");
  const url = await js("document.querySelector('.audio-player audio').src");
  assert.match(url,/^app-media:\/\/audio\/[a-f0-9]{48}$/);
  const range = await net.fetch(url,{headers:{Range:"bytes=0-15"}});
  assert.equal(range.status,206); assert.equal((await range.arrayBuffer()).byteLength,16); assert.match(range.headers.get("content-range"),/^bytes 0-15\/\d+$/);
  assert.equal((await net.fetch("app-media://audio/"+"0".repeat(48))).status,404);
  assert.equal((await net.fetch(url,{method:"POST"})).status,405);
  assert.equal((await net.fetch(url,{headers:{Range:"bytes=999999999999-"}})).status,416);
  record(name,{duration:total,controls:["play","pause","seek","back10","forward10","volume"],rangedStreaming:206,rejectedUnknownToken:404});
  return url;
}
async function transcribe(job, code, keywords) {
  const completed=await api("transcribe",job,settings);
  assert.equal(completed.status,"Tamamlandı"); assert(completed.transcript.trim().length>5); assert(fs.existsSync(completed.outputFiles.txt));
  if(code&&job.language==="Otomatik") assert.equal(completed.detectedLanguage,code,`Algılanan dil: ${completed.detectedLanguage}`);
  if(keywords) assert(keywords.test(completed.transcript),`Beklenen konuşma bulunamadı: ${completed.transcript}`);
  evidence.transcripts.push({id:job.id,language:job.language,detectedLanguage:completed.detectedLanguage,transcript:completed.transcript});
  record(`transcription-${job.id}`,{chars:completed.transcript.length,detectedLanguage:completed.detectedLanguage}); return completed;
}
async function run() {
  assert(fs.existsSync(mediaPath),`Test medyası bulunamadı: ${mediaPath}`);
  const converted=spawnSync(path.join(resources,"Tools","ffmpeg","ffmpeg.exe"),["-y","-hide_banner","-loglevel","error","-i",mediaPath,"-c:a","libmp3lame","-b:a","192k",mp3Path],{windowsHide:true,encoding:"utf8"});
  assert.equal(converted.status,0,`MP3 fixture oluşturulamadı: ${converted.stderr||converted.error}`);
  const sentinel={...createJob("history-preservation-sentinel",mediaPath),name:"Korunan geçmiş — Türkçe çğıİöşü",status:"Tamamlandı",stage:"Tamamlandı",progress:100,transcript:"Geçmiş içerik korunmalı: ç ğ ı İ ö ş ü"};
  fs.writeFileSync(path.join(userData,"data","settings.json"),JSON.stringify({...settings,defaultLanguage:"Kürtçe"}));
  fs.writeFileSync(path.join(userData,"data","history.json"),JSON.stringify([sentinel]));
  // Only the OS chooser is replaced. Parsing, native File drops, IPC, codecs,
  // model execution, streaming and document creation remain actual production code.
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[mp3Path]});
  require(path.join(appRoot,"dist-electron","main","main.js")); await app.whenReady();
  window=await until(()=>{const w=BrowserWindow.getAllWindows()[0];return w&&!w.webContents.isLoading()?w:null;},"Electron penceresi yüklenemedi");
  window.webContents.setBackgroundThrottling(false);
  await until(()=>js("!!document.querySelector('.languages button.selected')"),"React yüklenemedi"); await wait(250);
  window.webContents.debugger.attach("1.3");
  // Block Electron HTTP throughout local tests; CLI calls only read local files.
  window.webContents.session.webRequest.onBeforeRequest({urls:["http://*/*","https://*/*"]},(_details,callback)=>callback({cancel:true}));
  assert.equal((await api("getSettings")).defaultLanguage,"Otomatik");
  assert.equal(JSON.parse(fs.readFileSync(path.join(userData,"data","settings.json"))).defaultLanguage,"Otomatik");
  assert.equal((await api("getHistory"))[0].transcript,sentinel.transcript);
  record("legacy-settings-migration-history-preserved",{isolatedUserData:userData,documents});
  const historyFile=path.join(userData,"data","history.json"),originalHistory=fs.readFileSync(historyFile,"utf8");
  try{
    for(const damaged of["{broken json",'{"unexpected":"object"}']){
      fs.writeFileSync(historyFile,damaged);let rejected=false;
      try{await api("getHistory");}catch{rejected=true;}
      assert(rejected,"Bozuk geçmiş sessizce boş listeye dönüştürüldü");assert.equal(fs.readFileSync(historyFile,"utf8"),damaged,"Bozuk geçmiş dosyasının üzerine yazıldı");
    }
  }finally{fs.writeFileSync(historyFile,originalHistory);}
  record("invalid-history-rejected-without-overwrite");
  const expected=["Otomatik","Türkçe","İngilizce","Almanca"];
  assert.deepEqual(await js("[...document.querySelectorAll('.languages button')].map(e=>e.textContent.trim())"),expected);
  assert.equal(await js("!!document.querySelector('.badge.free') || document.querySelector('.topbar').textContent.includes('Ücretsiz')"),false);
  await click(".languages button","Almanca"); await click(".nav-item","Ayarlar");
  assert.deepEqual(await js("[...document.querySelectorAll('.languages button')].map(e=>e.textContent.trim())"),expected);
  assert.equal(await js("document.querySelector('.languages .selected').textContent.trim()"),"Almanca");
  await click(".languages button","İngilizce"); await click(".nav-item","Anasayfa");
  assert.equal(await js("document.querySelector('.languages .selected').textContent.trim()"),"İngilizce");
  await click(".languages button","Otomatik");
  await until(async()=>(await api("getSettings")).defaultLanguage==="Otomatik","Dil ayarı kaydedilmedi");
  record("language-order-home-settings-sync-and-badge-removal",{languages:expected});
  fs.writeFileSync(path.join(runDir,"home.png"),(await window.webContents.capturePage()).toPNG());
  const inspected=await api("inspectMediaFiles",[mp3Path]); assert.equal(inspected.errors.length,0);assert.equal(inspected.files.length,1);
  assert.deepEqual(await api("chooseMediaFiles"),inspected.files);
  await nativeDrop([mp3Path],true);
  await until(async()=>(await api("getHistory")).filter(j=>j.sourcePath===mp3Path).length===1,"Native File sürükle-bırak kuyruğa eklenmedi");
  const dropped=(await api("getHistory")).find(j=>j.sourcePath===mp3Path);
  for(const key of["sourcePath","name","format","sizeText","duration","durationSeconds"]) assert.equal(dropped[key],inspected.files[0][key==="sourcePath"?"path":key]);
  await click(".drop-zone .primary-btn");
  await until(async()=>(await api("getHistory")).filter(j=>j.sourcePath===mp3Path).length===2,"Dosya Seç UI kuyruğa eklemedi");
  await nativeDrop([mp3Path,mediaPath]);
  await until(async()=>(await api("getHistory")).length===5,"Çoklu sürükle-bırak tamamlanmadı");
  const unsupported=path.join(runDir,"desteklenmeyen.txt"); fs.writeFileSync(unsupported,"Medya değil.");
  const initialUrl=window.webContents.getURL(); await nativeDrop([unsupported]);
  await until(()=>js("document.querySelector('.badge.ready').textContent.includes('desteklenmiyor')"),"Desteklenmeyen dosya uyarısı gösterilmedi");
  assert.equal(window.webContents.getURL(),initialUrl);assert.equal((await api("getHistory")).length,5);
  const outsideData={items:[],files:[mp3Path],dragOperationsMask:1};
  for(const type of["dragEnter","dragOver","drop"]) await window.webContents.debugger.sendCommand("Input.dispatchDragEvent",{type,x:20,y:20,data:outsideData});
  await wait(150);assert.equal(window.webContents.getURL(),initialUrl);assert.equal((await api("getHistory")).length,5);
  await click(".languages button","Almanca");
  await until(async()=>(await api("getHistory")).filter(j=>j.status==="Bekliyor").every(j=>j.language==="Almanca"),"Dil kartı değişikliği bekleyen dosyalara uygulanmadı");
  assert.equal((await api("getHistory")).find(j=>j.id===sentinel.id).language,"Otomatik","Tamamlanan kaydın dili değiştirildi");
  await click(".languages button","Otomatik");
  await click(".choice-row button b","Dengeli");
  await until(async()=>(await api("getHistory")).filter(j=>j.status==="Bekliyor").every(j=>j.quality==="Dengeli"),"Kalite kartı değişikliği bekleyen dosyalara uygulanmadı");
  assert.equal((await api("getHistory")).find(j=>j.id===sentinel.id).quality,"Hızlı","Tamamlanan kaydın kalitesi değiştirildi");
  await click(".choice-row button b","Hızlı");
  record("native-drag-drop-single-multiple-chooser-equivalence-invalid-warning",{mechanism:"Chromium CDP dispatchDragEvent with native disk-backed Files; physical Explorer gestures not automated",inspected:inspected.files[0]});
  await playerTest("local-audio-player-real-playback-controls-and-security");
  const primary=createJob("smoke-english-auto",mediaPath);await api("saveHistory",[primary,sentinel]);await reload();
  await js("window.__smokeProgress=[]; window.desktopApi.onProgress(e=>window.__smokeProgress.push(e)); true");
  await click(".nav-item","Geçmiş");await click(".job-row .row-actions button");
  await until(async()=>{const j=(await api("getHistory")).find(j=>j.id===primary.id);return j?.status==="Tamamlandı"||j?.status==="Hata";},"Gerçek UI transkripsiyonu tamamlanmadı",20*60_000);
  const completed=(await api("getHistory")).find(j=>j.id===primary.id);
  assert.equal(completed.status,"Tamamlandı",completed.error);assert(completed.transcript.trim().length>5);
  assert.match(completed.transcript,/\[\d{2}:\d{2}:\d{2}\]/,"Zaman damgası biçimi korunmadı");
  if(!process.env.ELECTRON_TEST_MEDIA) assert.equal(completed.detectedLanguage,"en");
  assert.equal(await js("document.querySelector('.transcript-card pre')?.textContent"),completed.transcript);assert(fs.existsSync(completed.outputFiles.txt));
  const stages=await js("window.__smokeProgress.map(p=>p.stage)");
  for(const stage of["Dosya hazırlanıyor","Ses hazırlanıyor","Metne dönüştürülüyor","Çıktı oluşturuluyor","Tamamlandı"]) assert(stages.includes(stage),`Aşama eksik: ${stage}`);
  assert.equal((await api("getHistory")).find(j=>j.id===sentinel.id).transcript,sentinel.transcript);
  evidence.transcripts.push({id:completed.id,transcript:completed.transcript,detectedLanguage:completed.detectedLanguage});
  record("offline-local-transcription-ui-result-progress-history",{chars:completed.transcript.length,detectedLanguage:completed.detectedLanguage,stages:[...new Set(stages)]});
  await wait(300);fs.writeFileSync(path.join(runDir,"result.png"),(await window.webContents.capturePage()).toPNG());
  const exportJob={...completed,transcript:`${completed.transcript}\nTürkçe karakterler: ç ğ ı İ ö ş ü`};
  await api("saveHistory",(await api("getHistory")).map(job=>job.id===completed.id?exportJob:job));
  await reload();await click(".nav-item","Geçmiş");await click(`[data-job-id="${completed.id}"] .view-result-btn`);
  // This development integration test stubs only the native save-window reply.
  // Real Save As windows are exercised by installed-exe-smoke.cjs separately.
  const saveRequests=[];
  dialog.showSaveDialog=async(_owner,options)=>{saveRequests.push(options);return {canceled:false,filePath:path.join(documents,`smoke-export.${options.filters[0].extensions[0]}`)};};
  for(const type of["txt","docx","pdf"]){
    const destination=path.join(documents,`smoke-export.${type}`);
    await click(".download-buttons button",{txt:"TXT İndir",docx:"Word İndir",pdf:"PDF İndir"}[type]);
    await until(async()=>(await api("getHistory")).find(job=>job.id===completed.id)?.outputFiles[type]===destination,`UI ${type} dışa aktarmayı tamamlamadı`,120000);
    const bytes=fs.readFileSync(destination);assert(bytes.length>20);
    if(type==="txt") assert(bytes.toString("utf8").includes("ç ğ ı İ ö ş ü"));
    if(type==="docx"){assert.equal(bytes.readUInt32LE(0),0x04034b50);assert(unzipEntry(bytes,"word/document.xml").includes("ç ğ ı İ ö ş ü"));}
    if(type==="pdf"){assert.equal(bytes.subarray(0,5).toString(),"%PDF-");assert(bytes.toString("latin1").includes("/FontFile2"));assert(bytes.toString("latin1").includes("%%EOF"));}
    record(`offline-ui-export-${type}`,{bytes:bytes.length,path:destination,mode:"Actual result button and export IPC; native chooser response stubbed only in this source test",unicodeVerification:type==="pdf"?"Embedded TrueType font; full Unicode/multipage extraction tested in actual installed EXE suite":"Turkish Unicode preserved"});
  }
  assert.equal(saveRequests.length,3);
  const beforeCancel=JSON.stringify((await api("getHistory")).find(job=>job.id===completed.id).outputFiles),beforeFiles=fs.readdirSync(documents);
  dialog.showSaveDialog=async()=>({canceled:true});await click(".download-buttons button","PDF İndir");await wait(250);
  assert.equal(JSON.stringify((await api("getHistory")).find(job=>job.id===completed.id).outputFiles),beforeCancel);assert.deepEqual(fs.readdirSync(documents),beforeFiles);
  assert(!/kaydedilemedi|hata/i.test(await js("document.querySelector('.badge.ready').textContent")));record("ui-save-dialog-cancel-preserves-outputs");
  // Re-register after the deliberate result/history reload above. The previous
  // renderer's subscriptions and arrays no longer exist in the new document.
  await js("window.__smokeProgress=[];window.desktopApi.onProgress(e=>window.__smokeProgress.push(e));true");
  const cancel=createJob("smoke-cancel-real-process",mediaPath);
  await js(`window.__cancelSmoke=window.desktopApi.transcribe(${JSON.stringify(cancel)},${JSON.stringify(settings)});true`);
  await until(()=>js("window.__smokeProgress.some(p=>p.id==='smoke-cancel-real-process'&&p.stage==='Metne dönüştürülüyor')"),"İptal testi Whisper aşamasına ulaşmadı",120000);
  await wait(500);await api("cancelTranscription",cancel.id);assert.equal((await js("window.__cancelSmoke")).status,"İptal Edildi");
  const work=path.join(userData,"data","work");await until(()=>!fs.existsSync(work)||fs.readdirSync(work).length===0,"İş klasörü temizlenmedi");record("cancel-real-whisper-process-and-work-cleanup");
  if(process.env.ELECTRON_TEST_MULTILINGUAL==="1"){
    for(const[file,language,code,keywords]of[["tr_tr.wav","Türkçe","tr",/yolcu|uça|meşhed|duvar|ölüm/i],["de_de.wav","Almanca","de",/hongkong|aussichten|insel|kowloon/i]]){
      const sample=path.join(inputDir,file);assert(fs.existsSync(sample),`Dil test medyası eksik: ${sample}`);
      await transcribe(createJob(`smoke-${code}-forced`,sample,language),code,keywords);await transcribe(createJob(`smoke-${code}-auto`,sample),code,keywords);
    }
    await transcribe(createJob("smoke-en-forced",mediaPath,"İngilizce"),"en");
  }else skip("multilingual-forced-auto","ELECTRON_TEST_MULTILINGUAL=1 ve Türkçe/Almanca gerçek konuşma fixture gerekli.");
  if(process.env.ELECTRON_TEST_YOUTUBE){
    window.webContents.session.webRequest.onBeforeRequest(null);
    const info=await api("getYouTubeInfo",process.env.ELECTRON_TEST_YOUTUBE);assert(info.title&&info.url&&info.durationSeconds>0);
    await click(".nav-item","Anasayfa");await inputValue(".youtube-left input",process.env.ELECTRON_TEST_YOUTUBE);await click(".youtube-left button","Bilgi Getir");
    await until(()=>js(`document.querySelector('.youtube-card h3')?.textContent===${JSON.stringify(info.title)}`),"YouTube bilgisi UI'da görünmedi",120000);
    await playerTest("youtube-audio-player-real-download-and-controls");
    const cacheDir=path.join(userData,"data","audio-cache");const cached=fs.readdirSync(cacheDir).filter(n=>n.endsWith(".source")).map(name=>({name,birth:fs.statSync(path.join(cacheDir,name)).birthtimeMs}));
    assert.equal(cached.length,1,"Önizleme gerçek YouTube sesini indirmedi");
    const previousIds=(await api("getHistory")).map(j=>j.id);
    await click(".youtube-left .primary-btn","Dönüştür");
    const created=await until(async()=>(await api("getHistory")).find(j=>j.sourceType==="youtube"&&!previousIds.includes(j.id)),"YouTube Dönüştür düğmesi yeni işi oluşturmadı",120000);
    assert.equal(created.sourcePath,info.url);assert.equal(created.name,info.title);
    await until(async()=>{const j=(await api("getHistory")).find(j=>j.id===created.id);return j?.status==="Tamamlandı"||j?.status==="Hata";},"YouTube Dönüştür UI işlemi tamamlanmadı",20*60_000);
    const youtube=(await api("getHistory")).find(j=>j.id===created.id);
    assert.equal(youtube.status,"Tamamlandı",youtube.error);assert(youtube.transcript.trim().length>5);assert(fs.existsSync(youtube.outputFiles.txt));
    assert.equal(await js("document.querySelector('.transcript-card pre')?.textContent"),youtube.transcript);
    const timestampCount=await js("document.querySelectorAll('.transcript-timestamp').length");
    await timestampChecks({evaluate:js,clickControl:async(_selector,_text,index)=>{assert(await js(`(()=>{const e=document.querySelectorAll('.transcript-timestamp')[${index}];if(!e)return false;e.click();return true})()`));},record:(name,details)=>record(`youtube-${name}`,details),requiredPositions:timestampCount>=3?3:1});
    const youtubeStages=await js(`window.__smokeProgress.filter(p=>p.id===${JSON.stringify(created.id)}).map(p=>p.stage)`);
    for(const stage of["Dosya hazırlanıyor","Ses hazırlanıyor","Metne dönüştürülüyor","Çıktı oluşturuluyor","Tamamlandı"])assert(youtubeStages.includes(stage),`YouTube aşaması eksik: ${stage}`);
    evidence.transcripts.push({id:created.id,sourceType:"youtube",transcript:youtube.transcript,detectedLanguage:youtube.detectedLanguage});
    for(const file of cached)assert.equal(fs.statSync(path.join(cacheDir,file.name)).birthtimeMs,file.birth,"YouTube sesi yeniden indirilmiş");
    record("youtube-info-preview-transcription-button-ui-result-cache-reuse",{title:info.title,url:info.url,cacheFiles:cached.length,stages:[...new Set(youtubeStages)]});
    await wait(300);fs.writeFileSync(path.join(runDir,"youtube-result.png"),(await window.webContents.capturePage()).toPNG());
    await click(".nav-item","Anasayfa");
    await inputValue(".youtube-left input","https://www.youtube.com/watch?v=invalid");
    assert.equal(await js("document.querySelector('.youtube-card h3').textContent"),"Video bilgisi bekleniyor");
    assert.equal(await js("document.querySelector('.audio-player audio').getAttribute('src')"),null,"URL değişince eski YouTube sesi kaldı");
    let invalidRejected=false;try{await api("getYouTubeInfo","https://www.youtube.com/watch?v=invalid");}catch(error){invalidRejected=/Geçerli bir YouTube/.test(error.message);}
    assert(invalidRejected,"Hatalı YouTube URL reddedilmedi");
    record("youtube-url-change-clears-old-info-and-invalid-url-rejected");
  }else skip("youtube-info-preview-transcription","Ağ testi için erişim hakkı bulunan URL ile ELECTRON_TEST_YOUTUBE ayarlayın; ağ sonucu taklit edilmedi.");
  assert.equal(fs.readdirSync(work).length,0);
  const installedModel=path.join(resources,"Tools","models","ggml-large-v2-q5_0.bin");
  assert.equal(fs.statSync(installedModel).size,1080732091,"Model dosyası iş/junction temizliğinden sonra korunmadı");
  record("model-preserved-after-private-junction-cleanup",{bytes:fs.statSync(installedModel).size});
  evidence.finishedAt=new Date().toISOString();evidence.status="passed";fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
  console.log(`ELECTRON_SMOKE_OK|passed=${evidence.tests.length}|skipped=${evidence.skipped.length}|evidence=${evidencePath}`);
}
run().then(()=>app.exit(0)).catch(error=>{evidence.status="failed";evidence.finishedAt=new Date().toISOString();evidence.error=error.stack||error.message;fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));console.error(`ELECTRON_SMOKE_ERROR|${evidence.error}|evidence=${evidencePath}`);app.exit(1);});
