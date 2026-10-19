// Host-side CDP driver for the actual EXE installed by the isolated NSIS fixture.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { inflateRawSync } = require('node:zlib');
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const evidence = { startedAt: new Date().toISOString(), executable: config.executable, sample: config.sample, method: 'Actual installed EXE with preload IPC driven through loopback CDP', status: 'running', tests: [], removedFiles: [] };
const generatedFiles = new Set();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;

function saveEvidence() { fs.writeFileSync(config.evidence, JSON.stringify(evidence, null, 2)); }
function checkedOutput(file) {
  assert.equal(typeof file, 'string');
  const absolute = path.resolve(file);
  assert.equal(path.dirname(absolute).toLowerCase(), path.resolve(config.outputDirectory).toLowerCase(), 'Unexpected export directory');
  assert(path.basename(absolute).startsWith(`${config.jobId}_`), 'Export filename does not belong to this exact test run');
  assert(['.txt', '.pdf', '.docx'].includes(path.extname(absolute)), 'Unexpected export extension');
  assert(fs.lstatSync(absolute).isFile() && !fs.lstatSync(absolute).isSymbolicLink(), 'Export is not a normal file');
  assert.equal(fs.realpathSync(path.dirname(absolute)).toLowerCase(), fs.realpathSync(config.outputDirectory).toLowerCase(), 'Export directory changed');
  return absolute;
}
function docxXml(buffer) {
  for (let index = 0; index + 46 < buffer.length; index++) {
    if (buffer.readUInt32LE(index) !== 0x02014b50) continue;
    const length = buffer.readUInt16LE(index + 28);
    if (buffer.subarray(index + 46, index + 46 + length).toString() !== 'word/document.xml') continue;
    const compression = buffer.readUInt16LE(index + 10), size = buffer.readUInt32LE(index + 20), local = buffer.readUInt32LE(index + 42);
    const offset = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const bytes = buffer.subarray(offset, offset + size);
    return (compression === 8 ? inflateRawSync(bytes) : bytes).toString('utf8');
  }
  throw new Error('DOCX document.xml is missing');
}

async function run() {
  assert(/^[A-Za-z0-9_-]{1,100}$/.test(config.jobId), 'Invalid isolated test ID');
  assert(fs.statSync(config.sample).isFile(), 'Speech sample is missing');
  saveEvidence();
  let page;
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${config.port}/json/list`)).json();
      page = pages.find(item => item.type === 'page' && item.url.includes('index.html'));
      if (page) break;
    } catch { /* The installed process may still be starting. */ }
    await sleep(200);
  }
  assert(page, 'Installed executable did not expose its renderer');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const value = JSON.parse(event.data);
    const request = pending.get(value.id);
    if (!request) return;
    pending.delete(value.id);
    clearTimeout(request.timer);
    if (value.error) request.reject(new Error(JSON.stringify(value.error)));
    else request.resolve(value.result);
  };
  const rejectPending = reason => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(reason)); }
    pending.clear();
  };
  socket.onclose = () => rejectPending('Installed renderer debugging connection closed');
  socket.onerror = () => rejectPending('Installed renderer debugging connection failed');
  const send = (method, params, timeout = 15000) => new Promise((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) { reject(new Error('Installed renderer debugging connection is not open')); return; }
    const id = ++nextId;
    const timer = setTimeout(() => { if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`)); }, timeout);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  async function evaluate(expression, timeout) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeout);
    assert(!result.exceptionDetails, `Installed renderer exception: ${JSON.stringify(result.exceptionDetails)}`);
    return result.result.value;
  }
  await send('Network.enable', {});
  await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
  evidence.networkPolicy = 'Renderer HTTP/HTTPS blocked by CDP; EXE also launched with DNS blocking. Host network remains connected.';
  evidence.currentStage = 'checking-installed-interface';
  let state;
  for (let attempt = 0; attempt < 100; attempt++) {
    state = JSON.parse(await evaluate('JSON.stringify({ready: typeof window.desktopApi?.transcribe === "function" && !!document.querySelector(".drop-zone"), title: document.title, languages: [...document.querySelectorAll(".choice-row.languages b")].map(e=>e.textContent), freeBadge: !!document.querySelector(".badge.free"), userAgent: navigator.userAgent})'));
    if (state.ready) break;
    await sleep(100);
  }
  assert(state?.ready && !state.freeBadge, 'Installed interface is not ready');
  assert.equal(state.languages.join('|'), 'Otomatik|Türkçe|İngilizce|Almanca');
  evidence.ui = state;
  evidence.tests.push('installed-executable-ui-ready');
  evidence.currentStage = 'transcribing-local-speech';
  saveEvidence();
  const settings = { defaultQuality: 'Hızlı', defaultLanguage: 'Otomatik', timestamps: true, autoCorrect: true, soundEffects: false, animations: false, transparentTheme: true };
  const job = { id: config.jobId, sourcePath: config.sample, sourceType: 'file', name: `${config.jobId}.wav`, format: 'WAV', sizeText: `${fs.statSync(config.sample).size} B`, duration: '--:--', durationSeconds: 0, quality: 'Hızlı', language: 'Otomatik', status: 'Bekliyor', stage: 'Bekliyor', progress: 0, remaining: 'Bekliyor', transcript: '', outputFiles: {}, createdAt: new Date().toISOString() };
  const completed = JSON.parse(await evaluate(`window.desktopApi.transcribe(${JSON.stringify(job)},${JSON.stringify(settings)}).then(value=>JSON.stringify(value))`, 20 * 60_000));
  assert.equal(completed.status, 'Tamamlandı', completed.error);
  assert(completed.transcript?.trim().length > 5, 'Actual installed executable returned an empty transcript');
  generatedFiles.add(checkedOutput(completed.outputFiles.txt));
  evidence.completed = completed;
  evidence.tests.push('installed-executable-offline-local-transcription');
  saveEvidence();
  const exportJob = { ...completed, transcript: `${completed.transcript}\nTürkçe karakterler: ç ğ ı İ ö ş ü` };
  evidence.exports = {};
  for (const type of ['txt', 'pdf', 'docx']) {
    evidence.currentStage = `exporting-${type}`;
    saveEvidence();
    const payload = { type, job: exportJob, settings };
    const result = JSON.parse(await evaluate(`window.desktopApi.exportFile(${JSON.stringify(payload)}).then(value=>JSON.stringify(value))`, 120000));
    const file = checkedOutput(result.path);
    generatedFiles.add(file);
    const bytes = fs.readFileSync(file);
    assert(bytes.length > 20);
    if (type === 'txt') assert(bytes.toString('utf8').includes('ç ğ ı İ ö ş ü'));
    if (type === 'docx') { assert.equal(bytes.readUInt32LE(0), 0x04034b50); assert(docxXml(bytes).includes('ç ğ ı İ ö ş ü')); }
    if (type === 'pdf') { assert.equal(bytes.subarray(0, 5).toString(), '%PDF-'); assert(bytes.toString('latin1').includes('%%EOF')); assert(bytes.toString('latin1').includes('/FontFile2')); }
    evidence.exports[type] = { path: file, bytes: bytes.length };
    evidence.tests.push(`installed-executable-offline-export-${type}`);
    saveEvidence();
  }
  await evaluate('window.close();true').catch(() => {});
  evidence.status = 'passed';
  evidence.currentStage = 'completed';
}

run().catch(error => {
  evidence.status = 'failed';
  evidence.error = error?.stack || error?.message || String(error);
  console.error(evidence.error);
  process.exitCode = 1;
}).finally(() => {
  socket?.close();
  for (const file of generatedFiles) {
    try { fs.unlinkSync(checkedOutput(file)); evidence.removedFiles.push(file); }
    catch (error) { evidence.status = 'failed'; evidence.cleanupError = String(error); process.exitCode = 1; }
  }
  evidence.finishedAt = new Date().toISOString();
  saveEvidence();
  console.log(`INSTALLED_EXE_SMOKE_${evidence.status.toUpperCase()}|tests=${evidence.tests.length}|evidence=${config.evidence}`);
});
