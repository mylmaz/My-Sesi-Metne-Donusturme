// Actual installed EXE UI tests, including real Windows Save As dialogs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const {inflateRawSync}=require('node:zlib');
const {pathToFileURL}=require('node:url');
const {until,click,seed,runLayoutChecks,runActualWindowChecks,timestampChecks}=require('./ui-regression.cjs');
const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const runDir=path.dirname(config.evidence),manualDir=path.join(runDir,'manual-exports'),fixtureDir=path.join(runDir,'fixtures');
const evidence={startedAt:new Date().toISOString(),executable:config.executable,sample:config.sample,method:'Actual visible installed EXE; real UI buttons through loopback CDP; native Save As via exact-PID Windows dialog automation',testLaunchArguments:config.launchArguments,windowPolicy:'Only the owned test window is restored/shown. Test-only background/occlusion flags keep its compositor active; Windows display settings and application security settings are unchanged.',status:'running',tests:[],removedFiles:[],nativeDialogs:[]};
const generatedFiles=new Set();let socket,send,evaluate,currentPid=Number(config.processId),restartProcess,renamedMedia;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const save=()=>fs.writeFileSync(config.evidence,JSON.stringify(evidence,null,2));
function record(name,details={}){evidence.tests.push({name,status:'passed',...details});save();console.log(`INSTALLED_UI_PASS|${name}`);}
function checkedOutput(file){
  assert.equal(typeof file,'string');const absolute=path.resolve(file),parent=path.dirname(absolute);
  assert([config.outputDirectory,manualDir].some(d=>path.resolve(d).toLowerCase()===parent.toLowerCase()),'Unexpected export directory');
  assert(path.basename(absolute).startsWith(`${config.jobId}_`),'Filename is not owned by this exact test run');
  assert(['.txt','.pdf','.docx'].includes(path.extname(absolute)));assert(fs.lstatSync(absolute).isFile()&&!fs.lstatSync(absolute).isSymbolicLink());
  assert.equal(fs.realpathSync(parent).toLowerCase(),parent.toLowerCase(),'Output parent changed');return absolute;
}
function docxXml(buffer){for(let p=0;p+46<buffer.length;p++){if(buffer.readUInt32LE(p)!==0x02014b50)continue;const n=buffer.readUInt16LE(p+28);if(buffer.subarray(p+46,p+46+n).toString()!=='word/document.xml')continue;const size=buffer.readUInt32LE(p+20),offset=buffer.readUInt32LE(p+42),start=offset+30+buffer.readUInt16LE(offset+26)+buffer.readUInt16LE(offset+28),bytes=buffer.subarray(start,start+size);return(buffer.readUInt16LE(p+10)===8?inflateRawSync(bytes):bytes).toString('utf8');}throw Error('DOCX document.xml missing');}
async function connect(){
  let page;await until(async()=>{try{page=(await(await fetch(`http://127.0.0.1:${config.port}/json/list`)).json()).find(p=>p.type==='page'&&p.url.includes('index.html'));return page;}catch{return false;}},'Installed renderer debugging page unavailable',30000);
  socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});let id=0;const pending=new Map();
  socket.onmessage=event=>{const r=JSON.parse(event.data),p=pending.get(r.id);if(!p)return;pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result);};
  socket.onclose=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Installed renderer closed'));}pending.clear();};
  send=(method,params={},timeout=20000)=>new Promise((resolve,reject)=>{const request=++id,timer=setTimeout(()=>{pending.delete(request);reject(Error(`CDP timeout: ${method}`));},timeout);pending.set(request,{resolve,reject,timer});socket.send(JSON.stringify({id:request,method,params}));});
  evaluate=async(expression,timeout)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},timeout);assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
  evaluate.reload=()=>send('Page.reload',{ignoreCache:true});
  await send('Network.enable');await send('Network.setBlockedURLs',{urls:['http://*','https://*']});
  await until(()=>evaluate('!!document.querySelector(".nav-item") && !!window.desktopApi'),'Installed UI did not load');
  const shown=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'native-window-bounds.ps1'),'-ProcessId',String(currentPid),'-OwnerExecutable',config.executable,'-Action','show'],{windowsHide:true,encoding:'utf8',timeout:15000});
  assert.equal(shown.status,0,shown.stderr||shown.stdout||'Exact-owned test window could not be shown');const nativeShow=JSON.parse(shown.stdout.trim());
  await until(()=>evaluate('document.visibilityState === "visible"'),'Installed UI must be launched visibly (ELECTRON_SMOKE=0) for real window/compositor tests');
  evidence.visibleProcesses??=[];evidence.visibleProcesses.push({processId:currentPid,visibilityState:await evaluate('document.visibilityState'),nativeShow});save();
}
async function screenshot(name){
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))',10000);
  const data=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},30000),bytes=Buffer.from(data.data,'base64');
  assert(bytes.length>1000&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Screenshot did not contain a painted PNG');
  fs.writeFileSync(path.join(runDir,name),bytes);
}
async function uiClick(selector,text,index){
  const point=await evaluate(`(()=>{const e=${index===undefined?`[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text===undefined?'true':`e.textContent.trim()===${JSON.stringify(text)}`})`:`document.querySelectorAll('.transcript-timestamp')[${index}]`};if(!e||e.disabled)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  assert(point,`UI control missing/disabled: ${selector} ${text||''}`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});await sleep(150);
}
async function nativeDialog(action,destination,trigger){
  assert(Number.isInteger(currentPid)&&currentPid>0,'Native dialog PID not supplied');
  const args=['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'native-save-dialog.ps1'),'-ProcessId',String(currentPid),'-OwnerExecutable',config.executable,'-Action',action,'-AllowedDirectory',manualDir];if(destination)args.push('-Destination',destination);
  const helper=spawn('powershell.exe',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';helper.stdout.on('data',b=>stdout+=b.toString('utf8'));helper.stderr.on('data',b=>stderr+=b.toString('utf8'));
  const result=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{helper.kill();reject(Error('Native Save As automation timed out'));},45000);helper.on('error',reject);helper.on('exit',code=>{clearTimeout(timer);code===0?resolve(stdout):reject(Error(`Native dialog failed: ${stderr||stdout}`));});});
  await trigger();const output=await result;const detail=JSON.parse(output.trim());evidence.nativeDialogs.push(detail);save();return detail;
}
async function exportUi(type,phase,unicode,endMarker,expectedText){
  const destination=path.join(manualDir,`${config.jobId}_${phase}_${type}.${type}`);assert(!fs.existsSync(destination));
  const text={pdf:'PDF İndir',docx:'Word İndir',txt:'TXT İndir'}[type];
  await nativeDialog('save',destination,()=>uiClick('.download-buttons button',text));
  await until(()=>fs.existsSync(destination)&&fs.statSync(destination).size>20,`UI ${type} export did not write selected destination`,120000);
  generatedFiles.add(checkedOutput(destination));const bytes=fs.readFileSync(destination);let details={path:destination,bytes:bytes.length};
  const normalized=text=>text.normalize('NFC').replace(/\s+/g,' ').trim();
  if(type==='txt'){const content=bytes.toString('utf8');assert(content.includes(unicode));assert(content.includes(endMarker));assert(content.includes(expectedText),'TXT omitted part of the full transcript/stress fixture');}
  if(type==='docx'){assert.equal(bytes.readUInt32LE(0),0x04034b50);const xml=docxXml(bytes);assert(xml.includes(unicode));assert(xml.includes(endMarker));const text=xml.replace(/<[^>]+>/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');assert(normalized(text).includes(normalized(expectedText)),'DOCX omitted part of the full transcript/stress fixture');}
  if(type==='pdf'){
    assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert(bytes.toString('latin1').includes('/FontFile2'));
    const inspector=config.pdfInspector||path.resolve(__dirname,'../build/phase2/pdf-inspector/node_modules/pdfjs-dist/legacy/build/pdf.mjs');assert(fs.existsSync(inspector),'Dev-only PDF text inspector is not prepared');
    const {getDocument}=await import(pathToFileURL(inspector).href),loading=getDocument({data:new Uint8Array(bytes),useSystemFonts:false});
    try{
      const pdf=await loading.promise,text=[];for(let n=1;n<=pdf.numPages;n++)text.push((await(await pdf.getPage(n)).getTextContent()).items.map(x=>x.str).join(' '));
      const content=normalized(text.join('\n'));assert(content.includes(unicode));assert(content.includes(endMarker));assert(content.includes(normalized(expectedText)),'PDF omitted part of the full transcript/stress fixture across pages');assert(pdf.numPages>=2,'Long export stress fixture did not create multiple PDF pages');
      const {createCanvas}=require(path.resolve(__dirname,'../build/phase2/pdf-inspector/node_modules/@napi-rs/canvas'));
      const page=await pdf.getPage(1),viewport=page.getViewport({scale:1.25}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
      await page.render({canvasContext:canvas.getContext('2d'),viewport,canvas}).promise;
      const preview=path.join(runDir,`pdf-${phase}-first-page.png`);fs.writeFileSync(preview,canvas.toBuffer('image/png'));
      details={...details,pages:pdf.numPages,unicodeExtracted:true,lastMarkerExtracted:true,fullTranscriptExtracted:true,extractedCharacters:content.length,preview};
    }finally{await loading.destroy();}
  }
  const notice=await evaluate('document.querySelector(".badge.ready")?.textContent||""');assert(notice.includes(destination),'Success notice omitted the selected save path');
  record(`installed-real-ui-native-save-${phase}-${type}`,details);return destination;
}
async function closeAndRestart(){
  const oldPid=currentPid;await evaluate('window.close();true').catch(()=>{});socket?.close();await until(()=>{try{process.kill(oldPid,0);return false;}catch{return true;}},'Installed EXE did not close for real restart',15000);
  const restartEnvironment={...process.env,ELECTRON_SMOKE:'0'};delete restartEnvironment.ELECTRON_RUN_AS_NODE;
  restartProcess=spawn(config.executable,config.launchArguments,{env:restartEnvironment,windowsHide:false,stdio:['ignore','pipe','pipe']});currentPid=restartProcess.pid;restartProcess.stdout.pipe(fs.createWriteStream(path.join(runDir,`restart-${currentPid}.stdout.log`)));restartProcess.stderr.pipe(fs.createWriteStream(path.join(runDir,`restart-${currentPid}.stderr.log`)));await connect();
}
async function openCompleted(id){
  await uiClick('.nav-item','Geçmiş');await until(()=>evaluate(`!![...document.querySelectorAll('.job-row')].find(e=>e.dataset.jobId===${JSON.stringify(id)}||e.querySelector('.file-cell b')?.textContent===${JSON.stringify(`${config.jobId}.wav`)})`),'Completed history row not visible');
  const selector=await evaluate(`(()=>{const rows=[...document.querySelectorAll('.job-row')],i=rows.findIndex(e=>e.dataset.jobId===${JSON.stringify(id)}||e.querySelector('.file-cell b')?.textContent===${JSON.stringify(`${config.jobId}.wav`)});return '.job-row:nth-of-type('+(i+1)+') .view-result-btn'})()`);
  // A direct element index is independent of table wrapper/header markup.
  const point=await evaluate(`(()=>{const row=[...document.querySelectorAll('.job-row')].find(e=>e.dataset.jobId===${JSON.stringify(id)}||e.querySelector('.file-cell b')?.textContent===${JSON.stringify(`${config.jobId}.wav`)}),e=row?.querySelector('.view-result-btn');if(!e||e.disabled)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);assert(point,'Completed row has no enabled Sonucu Görüntüle button');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});await until(()=>evaluate('!!document.querySelector(".result-page .transcript-card")'),'History did not open result page');
}
async function run(){
  assert(/^[A-Za-z0-9_-]{1,100}$/.test(config.jobId));assert(fs.statSync(config.sample).isFile());fs.mkdirSync(manualDir,{recursive:true});fs.mkdirSync(fixtureDir,{recursive:true});save();await connect();
  evidence.networkPolicy='Renderer HTTP/HTTPS blocked via CDP; EXE DNS blocked; host remains connected.';
  const state=await evaluate('({languages:[...document.querySelectorAll(".languages button")].map(e=>e.textContent.trim()),freeBadge:!!document.querySelector(".badge.free"),userAgent:navigator.userAgent})');assert.deepEqual(state.languages,['Otomatik','Türkçe','İngilizce','Almanca']);assert(!state.freeBadge);record('installed-ui-languages-and-header',state);
  const settings={defaultQuality:'Hızlı',defaultLanguage:'Otomatik',timestamps:true,autoCorrect:true,soundEffects:false,animations:false,transparentTheme:true};await evaluate(`window.desktopApi.saveSettings(${JSON.stringify(settings)})`);
  const sample=path.join(fixtureDir,`${config.jobId}.wav`);fs.copyFileSync(config.sample,sample);
  await seed(evaluate,await evaluate('window.desktopApi.getHistory()'));await until(()=>evaluate('!!document.querySelector(".drop-zone")'),'Home did not reload');
  const zone=await evaluate('(()=>{const r=document.querySelector(".drop-zone").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
  const data={items:[],files:[sample],dragOperationsMask:1};for(const type of['dragEnter','dragOver','drop'])await send('Input.dispatchDragEvent',{type,...zone,data});
  const job=await until(async()=>{const jobs=await evaluate('window.desktopApi.getHistory()');return jobs.find(j=>j.sourcePath===sample);},'Native disk-backed drop did not create a queue job');
  record('installed-native-file-drop-ui-queue',{jobId:job.id,sourcePath:sample,gesture:'Chromium native disk-backed drag event, not a physical Explorer mouse gesture'});
  await evaluate('window.__progress=[];window.desktopApi.onProgress(p=>window.__progress.push(p));true');
  evidence.currentStage='actual-ui-transcription';save();await uiClick('.convert-strip .big-convert');
  const completed=await until(async()=>{const value=(await evaluate('window.desktopApi.getHistory()')).find(j=>j.id===job.id);return ['Tamamlandı','Hata','İptal Edildi'].includes(value?.status)?value:null;},'Actual UI transcription failed/timed out',20*60_000);
  assert.equal(completed.status,'Tamamlandı',completed.error||completed.stage);
  assert(completed.transcript?.trim().length>5);assert(await evaluate('!!document.querySelector(".result-page")'),'Transcription UI did not open result');
  const rendered=await evaluate('document.querySelector(".transcript-card")?.textContent||""');assert(rendered.includes(completed.transcript.replace(/^\[[^\]]+\]\s*/,'').split('\n')[0].trim().slice(0,25)));
  if(completed.outputFiles.txt)generatedFiles.add(checkedOutput(completed.outputFiles.txt));
  const stages=await evaluate('window.__progress.map(p=>p.stage)');for(const stage of['Ses hazırlanıyor','Metne dönüştürülüyor','Çıktı oluşturuluyor','Tamamlandı'])assert(stages.includes(stage),`Actual stage missing: ${stage}`);
  evidence.completed=completed;record('installed-ui-offline-whisper-result-and-real-progress',{characters:completed.transcript.length,detectedLanguage:completed.detectedLanguage,stages:[...new Set(stages)]});
  await screenshot('actual-result.png');await timestampChecks({evaluate,clickControl:uiClick,record});
  await runLayoutChecks({evaluate,send,baseJob:completed,screenshot,record});
  await runActualWindowChecks({evaluate,send,baseJob:completed,screenshot,record,nativeOwner:{processId:currentPid,executable:config.executable}});
  const unicode='ç ğ ı İ ö ş ü',endMarker=`SON-KONTROL-${config.jobId}`;
  const stressText=`${completed.transcript}\n\n${Array.from({length:60},(_,i)=>`Dışa aktarma stres örneği ${i+1}: Türkçe karakterler ${unicode}. ${completed.transcript.replace(/\n/g,' ')}`).join('\n')}\n${endMarker}`;
  const stress={...completed,transcript:stressText,rawTranscript:stressText,segments:undefined};const current=await evaluate('window.desktopApi.getHistory()');await seed(evaluate,current.map(j=>j.id===completed.id?stress:j));await openCompleted(completed.id);
  record('export-stress-fixture-explicitly-labelled',{realTranscriptCharacters:completed.transcript.length,stressCharacters:stressText.length,method:'60 labelled repetitions of the actual transcript plus a final marker; this is an export stress fixture, not additional recognized speech'});
  for(const type of['txt','pdf','docx'])await exportUi(type,'result',unicode,endMarker,stressText);
  const before=await evaluate(`(window.desktopApi.getHistory()).then(j=>j.find(x=>x.id===${JSON.stringify(completed.id)}).outputFiles)`);const filesBefore=fs.readdirSync(manualDir);
  await nativeDialog('cancel',undefined,()=>uiClick('.download-buttons button','PDF İndir'));await sleep(300);const after=await evaluate(`(window.desktopApi.getHistory()).then(j=>j.find(x=>x.id===${JSON.stringify(completed.id)}).outputFiles)`);assert.deepEqual(after,before);assert.deepEqual(fs.readdirSync(manualDir),filesBefore);assert(!/kaydedilemedi|hata/i.test(await evaluate('document.querySelector(".badge.ready").textContent')));record('native-save-dialog-cancel-preserves-history-and-files');
  const storedBefore=await evaluate('window.desktopApi.getHistory()');await closeAndRestart();await openCompleted(completed.id);const storedAfter=await evaluate('window.desktopApi.getHistory()');assert.deepEqual(storedAfter,storedBefore);assert((await evaluate('document.querySelector(".transcript-card").textContent')).includes(endMarker));record('actual-process-restart-history-result-reopens-without-retranscription',{oldAndNewPidDiffer:true,pid:currentPid,jobId:completed.id});
  for(const type of['txt','pdf','docx'])await exportUi(type,'history-reopened',unicode,endMarker,stressText);
  assert(path.dirname(sample)===fixtureDir);const missing=`${sample}.temporarily-missing`;assert(!fs.existsSync(missing));fs.renameSync(sample,missing);renamedMedia={source:sample,missing};
  await closeAndRestart();await openCompleted(completed.id);assert((await evaluate('document.querySelector(".transcript-card").textContent')).includes(endMarker));
  await uiClick('.transcript-timestamp',undefined,0);
  const mediaError=await until(()=>evaluate('document.querySelector(".result-page .audio-error")?.textContent'),'Missing source did not show an intelligible playback error',120000);
  assert((await evaluate('document.querySelector(".transcript-card").textContent')).includes(endMarker));
  await exportUi('txt','missing-media',unicode,endMarker,stressText);record('missing-source-media-preserves-history-text-and-native-export',{missingPath:sample,mediaError});
  await screenshot('missing-media-result.png');fs.renameSync(missing,sample);renamedMedia=undefined;
  await evaluate('window.close();true').catch(()=>{});evidence.status='passed';evidence.currentStage='completed';
}
run().catch(error=>{evidence.status='failed';evidence.error=error.stack||String(error);console.error(evidence.error);process.exitCode=1;}).finally(async()=>{
  socket?.close();if(renamedMedia&&fs.existsSync(renamedMedia.missing))fs.renameSync(renamedMedia.missing,renamedMedia.source);
  if(restartProcess&&restartProcess.exitCode===null){spawnSync('taskkill.exe',['/PID',String(restartProcess.pid),'/T','/F'],{windowsHide:true});}
  for(const file of generatedFiles){try{fs.unlinkSync(checkedOutput(file));evidence.removedFiles.push(file);}catch(error){evidence.status='failed';evidence.cleanupError=String(error);process.exitCode=1;}}
  evidence.finishedAt=new Date().toISOString();save();console.log(`INSTALLED_EXE_SMOKE_${evidence.status.toUpperCase()}|tests=${evidence.tests.length}|evidence=${config.evidence}`);
});
