// Shared renderer assertions. Seeded records exercise layout/display only; they
// are explicitly separated from tests that execute FFmpeg/Whisper or native UI.
const assert = require('node:assert/strict');
const path = require('node:path');
const {spawn} = require('node:child_process');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(check, message, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { const value = await check(); if (value) return value; } catch (error) { last = error; }
    await sleep(100);
  }
  throw new Error(`${message}${last ? `: ${last.message}` : ''}`);
}

async function click(evaluate, selector, text) {
  assert(await evaluate(`(() => { const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text === undefined ? 'true' : `e.textContent.trim()===${JSON.stringify(text)}`}); if(!e || e.disabled) return false; e.scrollIntoView({block:'nearest'}); e.click(); return true; })()`), `UI control missing/disabled: ${selector} ${text || ''}`);
  await sleep(120);
}

async function seed(evaluate, jobs) {
  await evaluate(`window.desktopApi.saveHistory(${JSON.stringify(jobs)})`);
  await evaluate('window.__oldQaDocument=true;true');
  assert.equal(typeof evaluate.reload,'function','Harness must reload through WebContents/CDP; renderer navigation is intentionally blocked');
  await evaluate.reload();
  await until(() => evaluate('!window.__oldQaDocument && !!document.querySelector(".nav-item") && !!window.desktopApi'), 'Renderer did not reload');
  await sleep(300);
  const stored = await evaluate('window.desktopApi.getHistory()');
  assert.deepEqual(stored.map(job=>job.id),jobs.map(job=>job.id),'Seeded history was overwritten before the new renderer loaded');
}

const layoutExpression = `(() => {
  const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
  const visible=e=>{const b=box(e),s=getComputedStyle(e);return b.width>0&&b.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
  const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1;
  const problems=[],rows=[...document.querySelectorAll('.job-row')];
  const checkSiblings=(elements,label)=>{const all=elements.filter(visible);for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)if(overlaps(box(all[i]),box(all[j])))problems.push(label+': '+all[i].className+' overlaps '+all[j].className)};
  for(const [i,row] of rows.entries())checkSiblings([...row.children].filter(e=>!e.classList.contains('job-detail')),'row '+i);
  for(const player of document.querySelectorAll('.audio-player.compact')) {
    const parent=box(player);const controls=[...player.querySelectorAll('button,input,.audio-time')].filter(visible);
    checkSiblings(controls,'compact player');
    for(const control of controls){const b=box(control);if(b.x<parent.x-2||b.right>parent.right+2||b.y<parent.y-2||b.bottom>parent.bottom+2)problems.push('compact control outside player: '+control.className)}
  }
  const header=document.querySelector('.queue-main > .section-head');if(header)checkSiblings([...header.children],'queue header');
  const sidebar=document.querySelector('.sidebar');let sidebarState;
  if(sidebar){
    const parts=[sidebar.querySelector('.brand'),sidebar.querySelector('nav'),sidebar.querySelector('footer')].filter(Boolean);checkSiblings(parts,'sidebar brand/navigation/footer');
    const footer=sidebar.querySelector('footer'),old=sidebar.scrollTop;sidebar.scrollTop=sidebar.scrollHeight;const after=footer?box(footer):undefined,shell=box(sidebar);
    if(innerWidth>980&&innerHeight<=600&&after&&(after.bottom>shell.bottom+2||after.y<shell.y-2))problems.push('sidebar footer cannot be reached by scrolling');
    sidebarState={box:shell,scrollHeight:sidebar.scrollHeight,clientHeight:sidebar.clientHeight,footerAfterScroll:after,parts:parts.map(e=>({tag:e.tagName,class:e.className,box:box(e)}))};sidebar.scrollTop=old;
  }
  if(document.documentElement.scrollWidth>document.documentElement.clientWidth+2)problems.push('document horizontal overflow');
  return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},rowCount:rows.length,problems,
    rows:rows.map(e=>({box:box(e),name:e.querySelector('.file-cell b')?.textContent,cells:[...e.children].filter(visible).map(c=>({class:c.className,box:box(c)}))})),
    sidebar:sidebarState,progress:[...document.querySelectorAll('.job-progress-label,.active-progress-label')].map(e=>e.textContent.trim()),
    compact:[...document.querySelectorAll('.audio-player.compact')].map(e=>({box:box(e),controls:[...e.querySelectorAll('button,input,.audio-time')].filter(visible).map(c=>({class:c.className,box:box(c)}))}))};
})()`;

async function runLayoutChecks({ evaluate, send, baseJob, screenshot, record, targets }) {
  const original = await evaluate('window.desktopApi.getHistory()');
  const host = await evaluate('({innerWidth,innerHeight,dpr:devicePixelRatio,screen:{width:screen.width,height:screen.height,availWidth:screen.availWidth,availHeight:screen.availHeight}})');
  const results = [];
  try {
    const dimensions=targets?[...new Map(targets.map(t=>[t[0]+'x'+t[1],[t[0],t[1]]])).values()]:[[1920,1080],[1704,900],[1600,900],[1366,768],[1280,720]];
    for (const [width,height] of dimensions) {
      for (const scale of [1,1.25]) {
        if(targets&&!targets.some(target=>target[0]===width&&target[1]===height&&target[2]===scale))continue;
        await send('Emulation.setDeviceMetricsOverride', { width:Math.floor(width/scale), height:Math.floor(height/scale), deviceScaleFactor:scale, mobile:false, screenWidth:width, screenHeight:height });
        for (const count of [0,1,6]) {
          const jobs = Array.from({length:count},(_,index)=>({ ...baseJob,id:`layout-${index}`,name:`Çok uzun kayıt adı ${'Türkçe_çğıİöşü_'.repeat(16)}_${index}.wav`,
            status:index===0?'İşleniyor':'Bekliyor',stage:'Metne dönüştürülüyor',progress:[99.99999,12.3456789,0,100,-1,null][index],remaining:'12 dakika 35 saniye',transcript:'',outputFiles:{} }));
          await seed(evaluate,jobs);
          await click(evaluate,'.nav-item','Geçmiş');
          await until(async()=>(await evaluate('document.querySelectorAll(".job-row").length'))===count,'Queue fixture did not render');
          const snapshot=await evaluate(layoutExpression);
          const id=`${width}x${height}-scale-${scale}-queue-${count}`;
          await screenshot(`layout-${id}.png`);
          assert.deepEqual(snapshot.problems,[],`${id}: ${snapshot.problems.join('; ')}`);
          for(const label of snapshot.progress){assert(!/NaN|Infinity|\d+[,.]\d{3,}/.test(label),`Unbounded progress label: ${label}`);}
          if(count) {assert(snapshot.progress.length>0,'Progress labels were not rendered');assert(!snapshot.progress.some(x=>/^100(?:[,.]0+)?%$/.test(x)),'Pending/running progress reached 100%');}
          results.push({id,...snapshot});
        }
      }
    }
    await send('Emulation.clearDeviceMetricsOverride',{});
    // Explicit formatting cases are seeded display fixtures, not actual progress events.
    const samples=[];
    for(const [status,progress] of [['İşleniyor',0],['İşleniyor',12.3456789],['İşleniyor',99.99999],['İşleniyor',100],['İşleniyor',null],['İşleniyor',-3],['Tamamlandı',33]]){
      await seed(evaluate,[{...baseJob,id:'progress-fixture',status,progress,transcript:status==='Tamamlandı'?'Tamamlanan örnek metin.':'',outputFiles:{}}]);
      await click(evaluate,'.nav-item','Geçmiş');
      const labels=await evaluate('[...document.querySelectorAll(".job-progress-label,.active-progress-label")].map(e=>e.textContent.trim())');
      assert(labels.length>0);for(const label of labels){assert(!/NaN|Infinity|\d+[,.]\d{3,}/.test(label));if(status==='Tamamlandı')assert.equal(label,'100%');else assert.notEqual(label,'100%');}
      samples.push({status,progress,labels});
    }
    record(`renderer-layout-${results.length}-cases-and-progress-display`,{host,emulation:'Chromium device metrics: physical target / scale -> CSS viewport plus deviceScaleFactor. Windows OS display scaling/resolution were not changed.',cases:results,progressFixtures:samples});
  } finally {
    await send('Emulation.clearDeviceMetricsOverride',{}).catch(()=>{});
    await seed(evaluate,original);
  }
}

async function timestampChecks({evaluate,clickControl,record,requiredPositions=3}) {
  await until(()=>evaluate(`document.querySelectorAll(".transcript-timestamp").length>=${requiredPositions}`),`${requiredPositions} timestamp controls were not rendered`);
  const buttons=await evaluate('[...document.querySelectorAll(".transcript-timestamp")].map((e,index)=>({index,seconds:Number(e.dataset.seconds),text:e.textContent}))');
  const positions=requiredPositions===1?[buttons[Math.floor(buttons.length/2)]]:[buttons[0],buttons[Math.floor(buttons.length/2)],buttons[buttons.length-1]];
  assert(new Set(positions.map(p=>p.seconds)).size===requiredPositions,'Distinct timestamp positions required');
  const checks=[];
  for(const point of positions){
    await clickControl(`.transcript-timestamp:nth-of-type(1)`,undefined,point.index);
    await until(()=>evaluate(`(()=>{const a=document.querySelector('.result-page audio');return !!a && !a.error && Number.isFinite(a.duration) && Math.abs(a.currentTime-${point.seconds})<0.6})()`),`Timestamp ${point.text} did not seek corresponding media`,120000);
    checks.push({...point,actual:await evaluate('({time:document.querySelector(".result-page audio").currentTime,paused:document.querySelector(".result-page audio").paused,source:document.querySelector(".result-page audio").src})')});
  }
  record(`${requiredPositions===3?'three':'one'}-timestamp-buttons-seek-real-audio`,{positions:checks});
}

async function runActualWindowChecks({evaluate,send,baseJob,screenshot,record,nativeOwner}) {
  const original=await evaluate('window.desktopApi.getHistory()');let owner,browserError;
  const nativeBounds=(action,width,height,restore)=>new Promise((resolve,reject)=>{
    const args=['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'native-window-bounds.ps1'),'-ProcessId',String(nativeOwner.processId),'-OwnerExecutable',nativeOwner.executable,'-Action',action];
    if(width)args.push('-Width',String(width),'-Height',String(height));if(restore)args.push('-PhysicalPixels','-Left',String(restore.left),'-Top',String(restore.top));
    const child=spawn('powershell.exe',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b.toString('utf8'));child.stderr.on('data',b=>stderr+=b.toString('utf8'));child.on('error',reject);child.on('exit',code=>{try{if(code!==0)throw Error(stderr||stdout);resolve(JSON.parse(stdout.trim()));}catch(error){reject(error);}});
  });
  try { owner=await send('Browser.getWindowForTarget',{}); }
  catch(error){browserError=error.message;if(!nativeOwner){record('actual-native-window-resize',{status:'skipped',reason:`Browser domain unavailable: ${error.message}`,emulatedChecksAreNotAReplacement:true});return;}}
  const nativeOriginal=owner?undefined:await nativeBounds('read');
  const cases=[];
  try{
    await send('Emulation.clearDeviceMetricsOverride',{});
    const jobs=Array.from({length:6},(_,i)=>({...baseJob,id:`native-layout-${i}`,name:`Gerçek pencere — ${'çok_uzun_çğıİöşü_'.repeat(15)}_${i}.wav`,status:i===0?'İşleniyor':'Bekliyor',progress:i===0?87.0444:0,remaining:'12 dakika 35 saniye',transcript:'',outputFiles:{}}));
    await seed(evaluate,jobs);await click(evaluate,'.nav-item','Geçmiş');
    if(owner)await send('Browser.setWindowBounds',{windowId:owner.windowId,bounds:{windowState:'normal'}});
    for(const [width,height]of[[1920,1080],[1704,900],[1600,900],[1366,768],[1280,720]]){
      let actual;
      if(owner){await send('Browser.setWindowBounds',{windowId:owner.windowId,bounds:{left:owner.bounds.left,top:owner.bounds.top,width,height}});actual=(await send('Browser.getWindowBounds',{windowId:owner.windowId})).bounds;}
      else actual=await nativeBounds('set',width,height,nativeOriginal.physicalBounds);
      await sleep(350);const snapshot=await evaluate(layoutExpression);
      await screenshot(`actual-window-${width}x${height}-queue-6.png`);assert.equal(snapshot.rowCount,6);assert.deepEqual(snapshot.problems,[],`Actual native window ${width}x${height}: ${snapshot.problems.join('; ')}`);
      cases.push({requestedOuterWindow:{width,height},actualOuterWindow:actual,...snapshot});
    }
    if(!owner){
      const actual=await nativeBounds('set',1280,650,nativeOriginal.physicalBounds);await sleep(350);const snapshot=await evaluate(layoutExpression);await screenshot('actual-window-1280x650-small-client-queue-6.png');assert.deepEqual(snapshot.problems,[],'Small actual native window layout failed');cases.push({requestedOuterWindow:{width:1280,height:650,units:'physicalPixels'},actualOuterWindow:actual,...snapshot});
    }
    record('actual-native-window-resize-five-sizes-plus-small-client',{method:owner?'Browser.setWindowBounds changes the actual isolated EXE top-level Windows window; requested bounds in DIP.':'Controlled DPI-aware Win32 SetWindowPos changes only the verified isolated EXE PID window; requested sizes in physical pixels, actual physical/DIP bounds and renderer DPR recorded. OS resolution/scaling unchanged. An extra1280x650physical case exercises the short client viewport.',browserDomainUnavailable:browserError,cases});
  }finally{
    if(owner){await send('Browser.setWindowBounds',{windowId:owner.windowId,bounds:{left:owner.bounds.left,top:owner.bounds.top,width:owner.bounds.width,height:owner.bounds.height}}).catch(()=>{});
    if(owner.bounds.windowState!=='normal')await send('Browser.setWindowBounds',{windowId:owner.windowId,bounds:{windowState:owner.bounds.windowState}}).catch(()=>{});}
    else await nativeBounds('set',nativeOriginal.physicalBounds.width,nativeOriginal.physicalBounds.height,nativeOriginal.physicalBounds);
    await seed(evaluate,original);
  }
}

module.exports={until,click,seed,runLayoutChecks,runActualWindowChecks,timestampChecks,layoutExpression};
