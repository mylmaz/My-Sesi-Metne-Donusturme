// Actual Electron + local model test. Only the atomic automatic-TXT rename is
// fault-injected; this simulates EACCES rather than changing a Windows ACL.
// Run: node node_modules/electron/cli.js scripts/export-failure-smoke.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog } = require('electron');

process.env.ELECTRON_SMOKE = '1';
delete process.env.VITE_DEV_SERVER_URL;
const root = path.resolve(__dirname, '..');
const appRoot = process.env.ELECTRON_APP_ROOT || root;
const resources = process.env.ELECTRON_APP_RESOURCES || root;
if (process.env.ELECTRON_APP_RESOURCES) process.chdir(resources);
const runDir = path.join(root, 'build', 'phase2', `export-failure-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
const userData = path.join(runDir, 'userData');
const documents = path.join(runDir, 'documents');
const automaticDir = path.join(documents, 'My Sesi Metne Donusturme Ciktilar');
const manualDir = path.join(runDir, 'manual-exports');
const manualPath = path.join(manualDir, 'kurtarılan Türkçe sonuç.txt');
const evidencePath = path.join(runDir, 'evidence.json');
const mediaPath = process.env.ELECTRON_TEST_MEDIA || path.join(root, 'build', 'real-media-tests', 'input', 'en_us.wav');
for (const directory of [path.join(userData, 'data'), documents, manualDir]) fs.mkdirSync(directory, { recursive: true });
// Isolate all paths before importing the production entry point.
app.setPath('userData', userData);
app.setPath('sessionData', path.join(userData, 'session'));
app.setPath('documents', documents);
const settings = { defaultQuality: 'Hızlı', defaultLanguage: 'İngilizce', timestamps: true, autoCorrect: true, soundEffects: false, animations: false, transparentTheme: true };
fs.writeFileSync(path.join(userData, 'data', 'settings.json'), JSON.stringify(settings));
fs.writeFileSync(path.join(userData, 'data', 'history.json'), '[]');
const evidence = {
  startedAt: new Date().toISOString(), runDir, appRoot, resources, mediaPath,
  fault: 'Simulated fs.renameSync EACCES only in this test process and only for the isolated automatic-TXT directory; no NTFS ACL changed',
  isolatedPaths: { userData, documents, manualDir }, injectedRenames: [], tests: []
};
const originalRename = fs.renameSync;
const originalSaveDialog = dialog.showSaveDialog;
let window;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const writeEvidence = () => fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
function record(name, details = {}) {
  evidence.tests.push({ name, status: 'passed', ...details });
  writeEvidence();
  console.log(`EXPORT_FAILURE_SMOKE_PASS|${name}`);
}
async function until(callback, message, timeout = 30000) {
  const end = Date.now() + timeout;
  let lastError;
  while (Date.now() < end) {
    try { const result = await callback(); if (result) return result; } catch (error) { lastError = error; }
    await wait(100);
  }
  throw new Error(`${message}${lastError ? ': ' + lastError.message : ''}`);
}
const js = source => window.webContents.executeJavaScript(source, true);
const api = (name, ...args) => js(`window.desktopApi[${JSON.stringify(name)}](...${JSON.stringify(args)})`);
const normalized = file => path.resolve(file).toLowerCase();
// Guard the exact parent; settings, history, caches, native outputs and every
// other path still use the genuine rename implementation.
fs.renameSync = function (from, to) {
  if (normalized(path.dirname(String(to))) !== normalized(automaticDir)) return originalRename.apply(this, arguments);
  assert.equal(path.extname(String(to)).toLowerCase(), '.txt');
  assert.equal(path.extname(String(from)), '.tmp');
  assert.equal(normalized(path.dirname(String(from))), normalized(automaticDir));
  const bytes = fs.readFileSync(from);
  assert(bytes.length > 20, 'Production writer must have produced a real temporary export before the injected error');
  evidence.injectedRenames.push({ from: String(from), to: String(to), bytes: bytes.length, temporaryText: bytes.toString('utf8') });
  const error = new Error('Simulated EACCES: automatic TXT atomic rename denied by focused smoke test');
  Object.assign(error, { code: 'EACCES', syscall: 'rename', path: String(from), dest: String(to) });
  throw error;
};

async function run() {
  assert(fs.existsSync(mediaPath), `Test speech is missing: ${mediaPath}`);
  require(path.join(appRoot, 'dist-electron', 'main', 'main.js'));
  await app.whenReady();
  window = await until(() => {
    const candidate = BrowserWindow.getAllWindows()[0];
    return candidate && !candidate.webContents.isLoading() ? candidate : null;
  }, 'Electron window did not load');
  window.webContents.setBackgroundThrottling(false);
  await until(() => js('!!window.desktopApi && !!document.querySelector(".languages")'), 'Production renderer/preload did not load');
  window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
  await js('window.__exportFailureProgress=[];window.desktopApi.onProgress(p=>window.__exportFailureProgress.push(p));true');
  const inspected = await api('inspectMediaFiles', [mediaPath]);
  assert.equal(inspected.errors.length, 0);
  assert.equal(inspected.files.length, 1);
  const media = inspected.files[0];
  const job = {
    ...media, id: `export-failure-${process.pid}`, name: path.basename(mediaPath), sourcePath: mediaPath, sourceType: 'file',
    quality: 'Hızlı', language: 'İngilizce', status: 'Bekliyor', stage: 'Bekliyor', progress: 0,
    remaining: 'Bekliyor', transcript: '', outputFiles: {}, createdAt: new Date().toISOString()
  };
  const completed = await api('transcribe', job, settings);
  evidence.completed = completed;
  evidence.progress = await js('window.__exportFailureProgress');
  assert.equal(completed.status, 'Tamamlandı', completed.error);
  assert.equal(completed.progress, 100);
  assert.match(completed.transcript, /speech|transcription|program|audio|internet/i);
  assert(completed.rawTranscript.trim().length > 20);
  assert(completed.segments.length > 0);
  assert.match(completed.warning, /otomatik TXT kopyası kaydedilemedi/);
  assert.equal(completed.error, undefined);
  assert.equal(completed.outputFiles.txt, undefined);
  assert.equal(evidence.injectedRenames.length, 1, 'Exactly one automatic-TXT rename should be denied');
  assert(evidence.injectedRenames[0].temporaryText.includes(completed.transcript), 'The failed export must contain the actual complete recognized transcript');
  assert.deepEqual(fs.readdirSync(automaticDir), [], 'Failed automatic export left an output or temporary file');
  const work = path.join(userData, 'data', 'work');
  assert.deepEqual(fs.existsSync(work) ? fs.readdirSync(work) : [], [], 'Native job directory was not cleaned up');
  assert(evidence.progress.some(item => item.stage === 'Metne dönüştürülüyor'));
  assert(evidence.progress.some(item => item.stage === 'Tamamlandı' && item.progress === 100));
  record('actual-model-result-retained-after-simulated-automatic-txt-eacces', {
    chars: completed.transcript.length, segments: completed.segments.length, warning: completed.warning,
    automaticDirectoryEmpty: true, workDirectoryEmpty: true
  });

  // Recovery uses the genuine writer again and the normal export IPC. Only the
  // OS chooser response points at this test's own separate destination.
  fs.renameSync = originalRename;
  const requests = [];
  dialog.showSaveDialog = async (...args) => {
    const options = args.length > 1 ? args[1] : args[0];
    requests.push({ title: options.title, defaultPath: options.defaultPath, filters: options.filters });
    return { canceled: false, filePath: manualPath };
  };
  const saved = await api('exportFile', { type: 'txt', job: completed });
  assert.equal(saved.path, manualPath);
  assert.equal(saved.canceled, undefined);
  assert.equal(requests.length, 1);
  const recovered = fs.readFileSync(manualPath, 'utf8');
  assert(recovered.includes(completed.transcript), 'Manual export lost the completed model text');
  assert(recovered.includes('My Sesi Metne'), 'Expected export metadata is absent');
  assert(!fs.readdirSync(manualDir).some(file => file.endsWith('.tmp')));
  assert.deepEqual(fs.readdirSync(automaticDir), []);
  evidence.manualExport = { path: saved.path, bytes: Buffer.byteLength(recovered), saveDialogRequests: requests };
  record('manual-txt-export-recovers-full-model-text-at-selected-path', { path: saved.path, bytes: Buffer.byteLength(recovered) });
  evidence.status = 'passed';
  evidence.finishedAt = new Date().toISOString();
  writeEvidence();
  console.log(`EXPORT_FAILURE_SMOKE_OK|passed=${evidence.tests.length}|evidence=${evidencePath}`);
}
const timeout = setTimeout(() => {
  fs.renameSync = originalRename;
  dialog.showSaveDialog = originalSaveDialog;
  evidence.status = 'failed'; evidence.error = 'Test timed out after 20 minutes'; writeEvidence(); app.exit(1);
}, 20 * 60 * 1000);
run().then(() => {
  clearTimeout(timeout); fs.renameSync = originalRename; dialog.showSaveDialog = originalSaveDialog; app.exit(0);
}).catch(error => {
  clearTimeout(timeout); fs.renameSync = originalRename; dialog.showSaveDialog = originalSaveDialog;
  evidence.status = 'failed'; evidence.finishedAt = new Date().toISOString(); evidence.error = error.stack || error.message; writeEvidence();
  console.error(`EXPORT_FAILURE_SMOKE_ERROR|${evidence.error}|evidence=${evidencePath}`); app.exit(1);
});
