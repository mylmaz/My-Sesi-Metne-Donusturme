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

async function runUiChecks(window) {
  const sizes = [
    [1366, 768],
    [1600, 900],
    [1920, 1080]
  ];
  for (const zoom of [1, 1.25, 1.5]) {
   window.webContents.setZoomFactor(zoom);
   for (const [width, height] of sizes) {
    window.setSize(width, height);
    await wait(150);
    const overflow = await window.webContents.executeJavaScript(`(() => {
      const bad = [];
      for (const el of document.querySelectorAll('.page, .topbar, .queue-main, .job-row, .active-card, .result-hero, .audio-player')) {
        if (el.scrollWidth > el.clientWidth + 3) bad.push(el.className || el.tagName);
      }
      return bad;
    })()`);
    if (overflow.length) throw new Error(`UI taşma kontrolü başarısız (${width}x${height}, %${zoom * 100}): ${overflow.join(", ")}`);
   }
  }
  window.webContents.setZoomFactor(1);

  const visualRules = await window.webContents.executeJavaScript(`(() => {
    const placeholder = document.querySelector('.youtube-placeholder img');
    return { placeholderWidth: placeholder?.getBoundingClientRect().width || 0 };
  })()`);
  if (visualRules.placeholderWidth > 72) throw new Error(`Görsel yerleşim doğrulaması başarısız: ${JSON.stringify(visualRules)}`);

  const uiResult = await window.webContents.executeJavaScript(`(async () => {
    const clickText = (selector, text) => {
      const button = Array.from(document.querySelectorAll(selector)).find((item) => item.textContent.includes(text));
      if (!button) throw new Error(text + ' düğmesi bulunamadı.');
      button.click();
    };
    for (const label of ['Anasayfa', 'Geçmiş', 'Ayarlar', 'Yardım']) clickText('.nav-item', label);
    clickText('.nav-item', 'Ayarlar');
    await new Promise((resolve) => setTimeout(resolve, 50));
    for (const input of document.querySelectorAll('.toggle-row input')) input.click();
    for (const input of document.querySelectorAll('.toggle-row input')) input.click();
    for (const button of document.querySelectorAll('.sound-row button')) button.click();
    clickText('.settings-actions button', 'Kaydet');
    clickText('.settings-actions button', 'Varsayılana Dön');
    clickText('.nav-item', 'Anasayfa');
    return 'UI_OK';
  })()`);
  if (uiResult !== "UI_OK") throw new Error("UI button smoke doğrulaması başarısız.");
}

function createJob(id, sourcePath) {
  return {
    id,
    sourcePath,
    sourceType: [".mp4", ".mkv", ".webm", ".mov", ".avi", ".wmv"].includes(path.extname(sourcePath).toLowerCase()) ? "local-video" : "local-audio",
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

function createYouTubeJob(id, info, prepared) {
  return {
    id,
    sourcePath: info.url,
    sourceType: "youtube",
    previewPath: prepared.path,
    name: info.title,
    format: prepared.format || "YouTube",
    sizeText: prepared.sizeText || "-",
    duration: prepared.duration || info.duration || "--:--",
    durationSeconds: prepared.durationSeconds || 0,
    quality: "Hızlı",
    language: "Otomatik",
    status: "Bekliyor",
    stage: "Bekliyor",
    progress: 0,
    remaining: "Bekliyor",
    transcript: "",
    outputFiles: {},
    createdAt: new Date().toISOString(),
    thumbnail: info.thumbnail,
    channel: info.channel
  };
}

async function run() {
  if (!fs.existsSync(mediaPath)) {
    throw new Error(`Test medyası bulunamadı: ${mediaPath}`);
  }

  require(path.join(appRoot, "dist-electron", "main", "main.js"));
  await app.whenReady();
  const window = await getReadyWindow();
  await runUiChecks(window);
  const settings = {
    parallelJobs: 3,
    transcriptionProfile: "Konuşma",
    defaultQuality: "Hızlı",
    defaultLanguage: "Türkçe",
    timestamps: true,
    autoCorrect: true,
    soundEffects: false,
    animations: false,
    transparentTheme: true
  };

  if (process.env.ELECTRON_FORMAT_FIXTURES) {
    const fixtureFiles = fs.readdirSync(process.env.ELECTRON_FORMAT_FIXTURES).map((name) => path.join(process.env.ELECTRON_FORMAT_FIXTURES, name));
    const inspected = await window.webContents.executeJavaScript(`window.desktopApi.inspectMediaFiles(${JSON.stringify(fixtureFiles)})`);
    const formats = new Set(inspected.map((item) => item.format));
    for (const expected of ["MP3", "WAV", "M4A", "FLAC", "MP4", "MKV"]) if (!formats.has(expected)) throw new Error(`${expected} biçimi doğrulanamadı.`);
  }

  const job = createJob(`smoke-${Date.now()}`, mediaPath);
  if (["Hızlı", "Dengeli", "Yüksek Doğruluk"].includes(process.env.ELECTRON_TEST_QUALITY)) job.quality = process.env.ELECTRON_TEST_QUALITY;
  const completed = await window.webContents.executeJavaScript(
    `window.desktopApi.transcribe(${JSON.stringify(job)}, ${JSON.stringify(settings)})`
  );
  if (completed.status !== "Tamamlandı" || !completed.transcript.trim() || !fs.existsSync(completed.outputFiles.txt)) {
    throw new Error("Gerçek transkripsiyon veya otomatik TXT doğrulaması başarısız.");
  }

  const playback = await window.webContents.executeJavaScript(`(async () => {
    const audio = new Audio('app-media://local/media?path=' + encodeURIComponent(${JSON.stringify(mediaPath)}));
    audio.volume = 0;
    await audio.play();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const target = Math.max(1, audio.duration * 0.6);
    audio.currentTime = target;
    await Promise.race([new Promise((resolve) => audio.addEventListener('seeked', resolve, { once: true })), new Promise((_, reject) => setTimeout(() => reject(new Error('seek timeout')), 4000))]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const result = { currentTime: audio.currentTime, duration: audio.duration, target };
    audio.pause();
    return result;
  })()`);
  if (!(playback.currentTime > 0) || !(playback.duration > 0) || Math.abs(playback.currentTime - playback.target) > 1.5) throw new Error(`Gerçek ses oynatma/seek doğrulaması başarısız: ${JSON.stringify(playback)}`);

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

  let parallelSummary = "skipped";
  if (process.env.ELECTRON_TEST_PARALLEL_DIR) {
    const candidates = fs.readdirSync(process.env.ELECTRON_TEST_PARALLEL_DIR).filter((name) => /\.(wav|mp3|m4a)$/i.test(name) && !/bozuk/i.test(name)).slice(0, 3).map((name, index) => createJob(`parallel-${index}-${Date.now()}`, path.join(process.env.ELECTRON_TEST_PARALLEL_DIR, name)));
    if (candidates.length !== 3) throw new Error("Paralel test için üç medya bulunamadı.");
    const expressions = candidates.map((item, index) => `window.__parallel${index}=window.desktopApi.transcribe(${JSON.stringify(item)}, ${JSON.stringify(settings)})`);
    await window.webContents.executeJavaScript(`void Promise.all([${expressions.join(",")}]); true`);
    await wait(500);
    await window.webContents.executeJavaScript(`window.desktopApi.cancelTranscription(${JSON.stringify(candidates[0].id)})`);
    const results = await window.webContents.executeJavaScript(`Promise.all([window.__parallel0,window.__parallel1,window.__parallel2])`);
    if (results[0].status !== "İptal Edildi" || results.slice(1).some((item) => item.status !== "Tamamlandı")) throw new Error(`Paralel/iptal doğrulaması başarısız: ${results.map((item) => item.status).join(",")}`);
    parallelSummary = results.map((item) => item.status).join(",");
  }

  let youtubeSummary = "skipped";
  if (process.env.ELECTRON_TEST_YOUTUBE) {
    const info = await window.webContents.executeJavaScript(
      `window.desktopApi.getYouTubeInfo(${JSON.stringify(process.env.ELECTRON_TEST_YOUTUBE)})`
    );
    const prepared = await window.webContents.executeJavaScript(
      `window.desktopApi.prepareYouTubeAudio(${JSON.stringify(info.url)})`
    );
    if (!prepared.path || !fs.existsSync(prepared.path) || fs.statSync(prepared.path).size === 0) {
      throw new Error("YouTube ses hazırlama doğrulaması başarısız.");
    }
    const youtubeJob = createYouTubeJob(`youtube-${Date.now()}`, info, prepared);
    const youtubeCompleted = await window.webContents.executeJavaScript(
      `window.desktopApi.transcribe(${JSON.stringify(youtubeJob)}, ${JSON.stringify(settings)})`
    );
    if (youtubeCompleted.status !== "Tamamlandı" || !youtubeCompleted.transcript.trim() || !youtubeCompleted.previewPath || !fs.existsSync(youtubeCompleted.previewPath)) {
      throw new Error("YouTube transkripsiyon doğrulaması başarısız.");
    }
    youtubeSummary = `passed:${youtubeCompleted.transcript.length}`;
  }

  for (const file of new Set([completed.outputFiles.txt, ...exported])) {
    try { fs.unlinkSync(file); } catch { /* test çıktısı temizliği en iyi çabadır */ }
  }

  console.log(`ELECTRON_SMOKE_OK|ui=passed|chars=${completed.transcript.length}|exports=txt,docx,pdf|cancel=passed|parallel=${parallelSummary}|youtube=${youtubeSummary}`);
}

run()
  .then(() => {
    app.exit(0);
  })
  .catch((error) => {
    console.error(`ELECTRON_SMOKE_ERROR|${error.stack || error.message}`);
    app.exit(1);
  });
