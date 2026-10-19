// Actual Electron main/FFmpeg/Whisper regression for stereo cancellation, with
// isolated history and exports. This does not replace the helper/unit checks.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');const {app,BrowserWindow}=require('electron');
const {until}=require('./ui-regression.cjs');
const root=path.resolve(__dirname,'..');
const benchmarkRoot=path.join(root,'build/whisper-benchmarks');
const latestStereo=fs.existsSync(benchmarkRoot)?fs.readdirSync(benchmarkRoot).filter(name=>name.startsWith('stereo-')&&fs.existsSync(path.join(benchmarkRoot,name,'anti-phase.wav'))).sort().at(-1):undefined;
const input=process.env.ELECTRON_TEST_ANTIPHASE||(latestStereo?path.join(benchmarkRoot,latestStereo,'anti-phase.wav'):undefined);
const runDir=path.join(root,'build/phase2',`stereo-guard-${new Date().toISOString().replace(/[:.]/g,'-')}`),profile=path.join(runDir,'profile'),documents=path.join(runDir,'documents');fs.mkdirSync(profile,{recursive:true});fs.mkdirSync(documents,{recursive:true});
process.env.ELECTRON_SMOKE='1';delete process.env.VITE_DEV_SERVER_URL;app.setPath('userData',profile);app.setPath('sessionData',path.join(profile,'session'));app.setPath('documents',documents);
const evidence={status:'running',startedAt:new Date().toISOString(),input,runDir};
async function run(){
  assert(input,'Prepare a stereo benchmark fixture first, or set ELECTRON_TEST_ANTIPHASE to the controlled anti-phase WAV path.');assert(fs.statSync(input).isFile());
  const probe=spawnSync(path.join(root,'Tools/ffmpeg/ffprobe.exe'),['-v','error','-select_streams','a:0','-show_entries','stream=channels,channel_layout','-of','json',input],{encoding:'utf8',windowsHide:true});assert.equal(probe.status,0);evidence.sourceStream=JSON.parse(probe.stdout).streams[0];assert.equal(evidence.sourceStream.channels,2);assert(!evidence.sourceStream.channel_layout||evidence.sourceStream.channel_layout==='unknown','This regression fixture must reproduce omitted channel layout');
  require(path.join(root,'dist-electron/main/main.js'));await app.whenReady();const window=await until(()=>{const w=BrowserWindow.getAllWindows()[0];return w&&!w.webContents.isLoading()?w:null;},'Electron did not load');
  window.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}));
  await until(()=>window.webContents.executeJavaScript('!!window.desktopApi'),'Preload API unavailable');
  const job={id:`stereo-guard-${process.pid}`,sourceType:'file',sourcePath:input,name:'anti-phase.wav',format:'WAV',sizeText:`${fs.statSync(input).size} B`,duration:'00:14',durationSeconds:14,quality:'Hızlı',language:'Türkçe',status:'Bekliyor',stage:'Bekliyor',progress:0,remaining:'Bekliyor',transcript:'',outputFiles:{},createdAt:new Date().toISOString()};
  const settings={defaultQuality:'Hızlı',defaultLanguage:'Türkçe',timestamps:true,autoCorrect:true,soundEffects:false,animations:false,transparentTheme:true};
  const result=await window.webContents.executeJavaScript(`window.desktopApi.transcribe(${JSON.stringify(job)},${JSON.stringify(settings)})`,true);assert.equal(result.status,'Tamamlandı',result.error);assert(result.transcript.trim().length>20);for(const word of[/yolcu/i,/uça/i,/duvar/i])assert(word.test(result.transcript),`Expected real Turkish speech not found: ${result.transcript}`);
  const log=fs.readFileSync(path.join(os.tmpdir(),'MySesiMetneDonusturme-electron.log'),'utf8').split(/\r?\n/).filter(line=>line.includes(`audio:stereo-cancellation:${job.id}:`));assert(log.length>0,'Actual main pipeline skipped stereo cancellation guard');
  assert(fs.existsSync(result.outputFiles.txt));const work=path.join(profile,'data/work');assert(!fs.existsSync(work)||fs.readdirSync(work).length===0);assert.equal(fs.statSync(path.join(root,'Tools/models/ggml-large-v2-q5_0.bin')).size,1080732091);
  evidence.result=result;evidence.guardLog=log;evidence.actualMainPipeline=true;evidence.network='Electron HTTP/HTTPS blocked; only local media processed';evidence.status='passed';
}
run().catch(error=>{evidence.status='failed';evidence.error=error.stack||String(error);console.error(evidence.error);}).finally(()=>{evidence.finishedAt=new Date().toISOString();const file=path.join(runDir,'evidence.json');fs.writeFileSync(file,JSON.stringify(evidence,null,2));console.log(`STEREO_GUARD_${evidence.status.toUpperCase()}|evidence=${file}`);app.exit(evidence.status==='passed'?0:1);});
