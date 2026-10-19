// Fast source/packaged renderer QA without model inference. Layout records are
// seeded test fixtures; real EXE transcription/native-dialog tests run separately.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {app,BrowserWindow}=require('electron');
const {until,click,seed,runLayoutChecks,runActualWindowChecks}=require('./ui-regression.cjs');
const root=path.resolve(__dirname,'..'),appRoot=process.env.ELECTRON_APP_ROOT||root;
const runDir=path.join(root,'build','phase2',`layout-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const userData=path.join(runDir,'userData');fs.mkdirSync(path.join(userData,'data'),{recursive:true});fs.mkdirSync(path.join(runDir,'documents'));
process.env.ELECTRON_SMOKE='1';delete process.env.VITE_DEV_SERVER_URL;app.setPath('userData',userData);app.setPath('sessionData',path.join(userData,'session'));app.setPath('documents',path.join(runDir,'documents'));
const evidence={status:'running',startedAt:new Date().toISOString(),runDir,tests:[]};const evidencePath=path.join(runDir,'evidence.json');
const record=(name,detail={})=>{evidence.tests.push({name,status:'passed',...detail});fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));console.log('LAYOUT_UI_PASS|'+name);};
async function run(){
  require(path.join(appRoot,'dist-electron/main/main.js'));await app.whenReady();const window=await until(()=>{const w=BrowserWindow.getAllWindows()[0];return w&&!w.webContents.isLoading()?w:null;},'Window did not load');window.webContents.setBackgroundThrottling(false);window.webContents.debugger.attach('1.3');
  const evaluate=expression=>window.webContents.executeJavaScript(expression,true),send=(method,params)=>window.webContents.debugger.sendCommand(method,params),screenshot=async name=>fs.writeFileSync(path.join(runDir,name),(await window.webContents.capturePage()).toPNG());
  evaluate.reload=()=>window.webContents.reload();
  await until(()=>evaluate('!!document.querySelector(".nav-item")'),'UI did not load');
  const sample=path.join(root,'build/real-media-tests/input/en_us.wav'),baseJob={id:'layout-base',sourceType:'file',sourcePath:sample,name:'Düzen örneği.wav',format:'WAV',duration:'00:09',durationSeconds:9,sizeText:'280 KB',quality:'Hızlı',language:'Otomatik',status:'Tamamlandı',stage:'Tamamlandı',progress:100,remaining:'Tamamlandı',transcript:'[00:00:00] İlk cümle.\n[00:00:03] İkinci cümle.\n[00:00:06] Üçüncü cümle.',outputFiles:{},createdAt:new Date().toISOString()};
  const targets=process.env.ELECTRON_LAYOUT_FOCUSED==='1'?[[1366,768,1],[1280,720,1.25],[1024,490,1]]:undefined;
  await runLayoutChecks({evaluate,send,baseJob,screenshot,record,targets});
  if(process.env.ELECTRON_LAYOUT_ACTUAL_WINDOW==='1')await runActualWindowChecks({evaluate,send,baseJob,screenshot,record,nativeOwner:{processId:process.pid,executable:process.execPath}});
  const rawOnly={...baseJob,id:'legacy-raw-only',name:'Eski ham metin.wav',transcript:'',rawTranscript:'[00:00:00] Eski ham metin korunur: ç ğ ı İ ö ş ü.'},statusOnly={...baseJob,id:'legacy-status-only',name:'Yalnızca tamamlandı durumu.wav',transcript:'',rawTranscript:''};
  await seed(evaluate,[rawOnly,statusOnly]);await click(evaluate,'.nav-item','Geçmiş');
  assert.equal(await evaluate('document.querySelector("[data-job-id=legacy-status-only] .view-result-btn").disabled'),true);
  assert.equal(await evaluate('document.querySelector("[data-job-id=legacy-raw-only] .view-result-btn").disabled'),false);
  await click(evaluate,'[data-job-id=legacy-raw-only] .view-result-btn');await until(()=>evaluate('!!document.querySelector(".result-page")'),'Recovered legacy history did not open');
  assert((await evaluate('document.querySelector(".transcript-card").textContent')).includes('Eski ham metin korunur'));const legacy=await evaluate('window.desktopApi.getHistory()');assert.equal(legacy[0].id,rawOnly.id);assert.equal(legacy[0].quality,rawOnly.quality);assert.equal(legacy[0].language,rawOnly.language);assert.equal(legacy[0].transcript,rawOnly.rawTranscript);assert.equal(legacy[1].transcript,'');
  await screenshot('legacy-raw-result.png');record('legacy-raw-only-restored-status-only-disabled',{fixture:'Seeded historical records; no transcription ran'});
  evidence.status='passed';
}
run().catch(error=>{evidence.status='failed';evidence.error=error.stack||String(error);console.error(evidence.error);process.exitCode=1;}).finally(()=>{evidence.finishedAt=new Date().toISOString();fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));console.log(`LAYOUT_UI_${evidence.status.toUpperCase()}|evidence=${evidencePath}`);app.exit(evidence.status==='passed'?0:1);});
