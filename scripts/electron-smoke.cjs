const fs = require("fs");
const path = require("path");
const { app, BrowserWindow } = require("electron");

process.env.ELECTRON_SMOKE = "1";
delete process.env.VITE_DEV_SERVER_URL;

const root = path.resolve(__dirname, "..");
const appRoot = process.env.ELECTRON_APP_ROOT || root;
if (process.env.ELECTRON_APP_RESOURCES) process.chdir(process.env.ELECTRON_APP_RESOURCES);
const fallbackMedia = path.join(root, "build", "real-media-tests", "input", "turkce_kisa_test.wav");
const mediaPath = process.env.ELECTRON_TEST_MEDIA || fallbackMedia;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getReadyWindow() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const window = BrowserWindow.getAllWindows()[0];
    if (window && !window.webContents.isLoading()) return window;
    await wait(100);
  }
  throw new Error("Electron test penceresi yüklenemedi.");
}

function createJob(id, sourcePath) {
  return {
    id,
    sourcePath,
    sourceType: "file",
    name: path.basename(sourcePath),
    format: path.extname(sourcePath).slice(1).toUpperCase(),
    sizeText: `${fs.statSync(sourcePath).size} B`,
    duration: "--:--",
    durationSeconds: 0,
    quality: "Hızlı",
    language: "Türkçe",
    status: "Bekliyor",
    stage: "Bekliyor",
    progress: 0,
    remaining: "Bekliyor",
    transcript: "",
    outputFiles: {},
    createdAt: new Date().toISOString()
  };
}

async function run() {
  if (!fs.existsSync(mediaPath)) {
    throw new Error(`Test medyası bulunamadı: ${mediaPath}`);
  }

  require(path.join(appRoot, "dist-electron", "main", "main.js"));
  await app.whenReady();
  const window = await getReadyWindow();
  const settings = {
    defaultQuality: "Hızlı",
    defaultLanguage: "Türkçe",
    timestamps: true,
    autoCorrect: true,
    soundEffects: false,
    animations: false,
    transparentTheme: true
  };

  const job = createJob(`smoke-${Date.now()}`, mediaPath);
  const completed = await window.webContents.executeJavaScript(
    `window.desktopApi.transcribe(${JSON.stringify(job)}, ${JSON.stringify(settings)})`
  );
  if (completed.status !== "Tamamlandı" || !completed.transcript.trim() || !fs.existsSync(completed.outputFiles.txt)) {
    throw new Error("Gerçek transkripsiyon veya otomatik TXT doğrulaması başarısız.");
  }

  const exported = [];
  for (const type of ["txt", "docx", "pdf"]) {
    const result = await window.webContents.executeJavaScript(
      `window.desktopApi.exportFile(${JSON.stringify({ type, job: completed, settings })})`
    );
    if (!result.path || !fs.existsSync(result.path) || fs.statSync(result.path).size === 0) {
      throw new Error(`${type.toUpperCase()} export doğrulaması başarısız.`);
    }
    exported.push(result.path);
  }

  const cancelJob = createJob(`cancel-${Date.now()}`, mediaPath);
  await window.webContents.executeJavaScript(
    `void (window.__cancelSmoke = window.desktopApi.transcribe(${JSON.stringify(cancelJob)}, ${JSON.stringify(settings)})); true`
  );
  await wait(250);
  await window.webContents.executeJavaScript(`window.desktopApi.cancelTranscription(${JSON.stringify(cancelJob.id)})`);
  const cancelled = await window.webContents.executeJavaScript("window.__cancelSmoke");
  if (cancelled.status !== "İptal Edildi") {
    throw new Error(`Gerçek süreç iptali doğrulanamadı: ${cancelled.status}`);
  }

  for (const file of new Set([completed.outputFiles.txt, ...exported])) {
    try { fs.unlinkSync(file); } catch { /* test çıktısı temizliği en iyi çabadır */ }
  }

  console.log(`ELECTRON_SMOKE_OK|chars=${completed.transcript.length}|exports=txt,docx,pdf|cancel=passed`);
}

run()
  .then(() => {
    app.exit(0);
  })
  .catch((error) => {
    console.error(`ELECTRON_SMOKE_ERROR|${error.stack || error.message}`);
    app.exit(1);
  });
