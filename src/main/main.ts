import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { pathToFileURL } from "url";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

type Quality = "Hızlı" | "Dengeli" | "Yüksek Doğruluk";
type Language = "Otomatik" | "Türkçe" | "Kürtçe" | "İngilizce";
type JobStatus = "Bekliyor" | "İşleniyor" | "Tamamlandı" | "Hata" | "İptal Edildi" | "Durduruldu";

interface AppSettings {
  parallelJobs: 1 | 2 | 3;
  transcriptionProfile: "Konuşma" | "Müzik/Vokal";
  defaultQuality: Quality;
  defaultLanguage: Language;
  timestamps: boolean;
  autoCorrect: boolean;
  soundEffects: boolean;
  animations: boolean;
  transparentTheme: boolean;
}

interface JobRecord {
  id: string;
  sourcePath: string;
  sourceType: "youtube" | "local-audio" | "local-video" | "file";
  previewPath?: string;
  name: string;
  format: string;
  sizeText: string;
  duration: string;
  durationSeconds: number;
  quality: Quality;
  language: Language;
  status: JobStatus;
  stage: string;
  progress: number;
  remaining: string;
  transcript: string;
  rawTranscript?: string;
  outputFiles: { pdf?: string; docx?: string; txt?: string };
  createdAt: string;
  completedAt?: string;
  error?: string;
  thumbnail?: string;
  channel?: string;
}

interface PreparedAudio {
  path: string;
  format: string;
  sizeText: string;
  duration: string;
  durationSeconds: number;
}

const defaultSettings: AppSettings = {
  parallelJobs: 3,
  transcriptionProfile: "Konuşma",
  defaultQuality: "Dengeli",
  defaultLanguage: "Türkçe",
  timestamps: true,
  autoCorrect: true,
  soundEffects: true,
  animations: true,
  transparentTheme: true
};
const supportedMediaExtensions = new Set([".mp3", ".wav", ".m4a", ".mp4", ".webm", ".mpeg", ".mpga", ".mov", ".avi", ".mkv", ".flac", ".aac", ".ogg", ".opus", ".wma", ".wmv"]);

let mainWindow: BrowserWindow | null = null;
const activeProcesses = new Map<string, Set<ChildProcessWithoutNullStreams>>();
const cancelledJobs = new Set<string>();
const etaStates = new Map<string, { stage: string; lastAt: number; lastValue: number; speed: number; samples: number }>();

class UserVisibleError extends Error {}
class CancelledError extends Error {}

function runtimeLog(message: string) {
  try {
    const file = path.join(os.tmpdir(), "MySesiMetneDonusturme-electron.log");
    fs.appendFileSync(file, `${new Date().toISOString()} ${message}\n`, "utf8");
  } catch {
    // Runtime diagnostics should never block the app.
  }
}

process.on("uncaughtException", (error) => runtimeLog(`uncaughtException: ${error.stack || error.message}`));
process.on("unhandledRejection", (error) => runtimeLog(`unhandledRejection: ${String(error)}`));

protocol.registerSchemesAsPrivileged([{ scheme: "app-media", privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }]);
app.setAppUserModelId("com.mustafayilmaz.mysesimetnedonusturme");

function createWindow() {
  runtimeLog("createWindow:start");
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1280,
    minHeight: 760,
    title: "My Sesi Metne Dönüştürme",
    icon: resolveResource("resources", "app-icon.ico"),
    backgroundColor: "#eef6ff",
    show: process.env.ELECTRON_SMOKE !== "1",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    runtimeLog(`did-fail-load: code=${code} description=${description} url=${url}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    runtimeLog(`render-process-gone: ${JSON.stringify(details)}`);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    runtimeLog(`loadURL:${process.env.VITE_DEV_SERVER_URL}`);
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const file = path.join(__dirname, "../../dist/index.html");
    runtimeLog(`loadFile:${file}`);
    mainWindow.loadFile(file);
  }
  runtimeLog("createWindow:end");
}

app.whenReady().then(() => {
  runtimeLog("app:ready");
  protocol.handle("app-media", (request) => {
    try {
      const mediaPath = new URL(request.url).searchParams.get("path") || "";
      if (!path.isAbsolute(mediaPath) || !fs.existsSync(mediaPath) || !fs.statSync(mediaPath).isFile()) return new Response("Medya bulunamadı", { status: 404 });
      return net.fetch(pathToFileURL(mediaPath).toString(), { headers: request.headers });
    } catch (error) {
      runtimeLog(`media:protocol:error:${String(error)}`);
      return new Response("Medya açılamadı", { status: 400 });
    }
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => runtimeLog(`app:ready:error:${error.stack || error.message}`));

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function appDataDir() {
  const dir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function outputDir() {
  const dir = process.env.ELECTRON_SMOKE_OUTPUT_DIR || path.join(app.getPath("documents"), "My Sesi Metne Donusturme Ciktilar");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function previewDir() {
  const dir = path.join(appDataDir(), "youtube-preview");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function workDir(jobId: string) {
  const dir = path.join(appDataDir(), "work", jobId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveResource(...parts: string[]) {
  const packaged = path.join(process.resourcesPath || process.cwd(), ...parts);
  if (fs.existsSync(packaged)) return packaged;
  return path.join(process.cwd(), ...parts);
}

function toolPath(folder: string, exe: string) {
  const candidates = [
    resolveResource("Tools", folder, exe),
    path.join(process.cwd(), "Tools", folder, exe)
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function modelPath() {
  const managed = path.join(appDataDir(), "models", "ggml-large-v2.bin");
  return fs.existsSync(managed) ? managed : resolveResource("Tools", "models", "ggml-large-v2.bin");
}

function requireFile(file: string, label: string, minimumBytes = 1) {
  if (!fs.existsSync(file)) {
    throw new UserVisibleError(`${label} bulunamadı. Uygulamayı yeniden kurun veya Tools klasörünü kontrol edin.`);
  }
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size < minimumBytes) {
    throw new UserVisibleError(`${label} eksik veya bozuk görünüyor. Uygulamayı yeniden kurun.`);
  }
  return file;
}

function requireTool(folder: string, executable: string, label: string) {
  return requireFile(toolPath(folder, executable), label, 1024);
}

function requireModel() {
  return requireFile(modelPath(), "Whisper Large-v2 model dosyası", 100 * 1024 * 1024);
}

const modelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v2.bin";
const modelSha256 = "9a423fe4d40c82774b6af34115b8b935f34152246eb19e80e376071d3f999487";

async function fileSha256(file: string) {
  const hash = createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
}

async function ensureModel(jobId: string, startedAt: number) {
  try {
    return requireModel();
  } catch {
    // Kurulumlu paket modeli ilk kullanımda yönetilen kullanıcı klasörüne indirir.
  }
  const dir = path.join(appDataDir(), "models");
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "ggml-large-v2.bin");
  const partial = `${target}.part`;
  const existing = fs.existsSync(partial) ? fs.statSync(partial).size : 0;
  emitProgress(jobId, 1, "Whisper modeli indiriliyor", startedAt, formatBytes(existing));
  const response = await fetch(modelUrl, { headers: existing ? { Range: `bytes=${existing}-` } : {} });
  if (!response.ok || !response.body) throw new UserVisibleError("Whisper modeli indirilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.");
  const append = existing > 0 && response.status === 206;
  const base = append ? existing : 0;
  const remaining = Number(response.headers.get("content-length") || 0);
  const total = base + remaining;
  let received = base;
  const progress = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      const percent = total > 0 ? Math.min(12, Math.max(1, (received / total) * 12)) : 1;
      const eta = stageEta(jobId, "Whisper modeli indiriliyor", received, total);
      emitProgress(jobId, percent, "Whisper modeli indiriliyor", startedAt, `${eta} · ${formatBytes(received)} / ${formatBytes(total)}`);
      controller.enqueue(chunk);
    }
  });
  await pipeline(Readable.fromWeb(response.body.pipeThrough(progress) as never), fs.createWriteStream(partial, { flags: append ? "a" : "w" }));
  if (await fileSha256(partial) !== modelSha256) {
    fs.rmSync(partial, { force: true });
    throw new UserVisibleError("Whisper modeli doğrulanamadı. İndirme yeniden başlatılacak; lütfen tekrar deneyin.");
  }
  fs.renameSync(partial, target);
  return requireFile(target, "Whisper Large-v2 model dosyası", 100 * 1024 * 1024);
}

function settingsPath() {
  return path.join(appDataDir(), "settings.json");
}

function historyPath() {
  return path.join(appDataDir(), "history.json");
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function registerProcess(jobId: string | undefined, child: ChildProcessWithoutNullStreams) {
  if (!jobId) return;
  const processes = activeProcesses.get(jobId) || new Set<ChildProcessWithoutNullStreams>();
  processes.add(child);
  activeProcesses.set(jobId, processes);
}

function unregisterProcess(jobId: string | undefined, child: ChildProcessWithoutNullStreams) {
  if (!jobId) return;
  const processes = activeProcesses.get(jobId);
  processes?.delete(child);
  if (processes?.size === 0) activeProcesses.delete(jobId);
}

async function terminateProcessTree(child: ChildProcessWithoutNullStreams) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform !== "win32") {
    child.kill("SIGTERM");
    return;
  }
  await new Promise<void>((resolve) => {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
    killer.once("error", () => {
      child.kill("SIGKILL");
      resolve();
    });
    killer.once("close", () => resolve());
  });
}

async function cancelJob(jobId: string) {
  cancelledJobs.add(jobId);
  const processes = Array.from(activeProcesses.get(jobId) || []);
  await Promise.all(processes.map(terminateProcessTree));
  return processes.length > 0;
}

function runProcess(command: string, args: string[], options: { jobId?: string; onLine?: (line: string) => void } = {}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    if (options.jobId && cancelledJobs.has(options.jobId)) {
      reject(new CancelledError("İşlem kullanıcı tarafından iptal edildi."));
      return;
    }
    const child = spawn(command, args, { windowsHide: true });
    registerProcess(options.jobId, child);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;
      if (options.onLine) text.split(/\r?\n/).filter(Boolean).forEach(options.onLine);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      if (options.onLine) text.split(/\r?\n/).filter(Boolean).forEach(options.onLine);
    });
    child.on("error", (error) => {
      unregisterProcess(options.jobId, child);
      reject(error);
    });
    child.on("close", (code) => {
      unregisterProcess(options.jobId, child);
      if (options.jobId && cancelledJobs.has(options.jobId)) {
        reject(new CancelledError("İşlem kullanıcı tarafından iptal edildi."));
        return;
      }
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `Komut tamamlanamadı: ${code}`));
    });
  });
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--:--";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function stableId(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 20);
}

async function probeDuration(file: string) {
  try {
    const result = await runProcess(requireTool("ffmpeg", "ffprobe.exe", "FFprobe"), [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nokey=1:noprint_wrappers=1",
      file
    ]);
    const seconds = Number.parseFloat(result.stdout.trim());
    return Number.isFinite(seconds) ? seconds : 0;
  } catch (error) {
    if (error instanceof UserVisibleError) throw error;
    return 0;
  }
}

async function inspectMediaFile(file: string): Promise<PreparedAudio> {
  if (!file || !fs.existsSync(file)) throw new UserVisibleError("Seçilen medya dosyası bulunamadı.");
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size === 0) throw new UserVisibleError("Seçilen medya dosyası boş veya okunamıyor.");
  const extension = path.extname(file).toLowerCase();
  if (!supportedMediaExtensions.has(extension)) throw new UserVisibleError("Bu dosya biçimi desteklenmiyor.");
  const seconds = await probeDuration(file);
  return {
    path: file,
    format: extension.replace(".", "").toUpperCase(),
    sizeText: formatBytes(stat.size),
    duration: formatDuration(seconds),
    durationSeconds: seconds
  };
}

function sanitizeSettings(settings: Partial<AppSettings> | undefined): AppSettings {
  return {
    parallelJobs: settings?.parallelJobs === 1 || settings?.parallelJobs === 2 || settings?.parallelJobs === 3 ? settings.parallelJobs : 3,
    transcriptionProfile: settings?.transcriptionProfile === "Müzik/Vokal" ? "Müzik/Vokal" : "Konuşma",
    defaultQuality: settings?.defaultQuality && ["Hızlı", "Dengeli", "Yüksek Doğruluk"].includes(settings.defaultQuality) ? settings.defaultQuality : defaultSettings.defaultQuality,
    defaultLanguage: settings?.defaultLanguage && ["Otomatik", "Türkçe", "Kürtçe", "İngilizce"].includes(settings.defaultLanguage) ? settings.defaultLanguage : defaultSettings.defaultLanguage,
    timestamps: settings?.timestamps !== false,
    autoCorrect: settings?.autoCorrect !== false,
    soundEffects: settings?.soundEffects !== false,
    animations: settings?.animations !== false,
    transparentTheme: settings?.transparentTheme !== false
  };
}

function languageCode(language: Language) {
  if (language === "Otomatik") return "auto";
  if (language === "Kürtçe") return "ku";
  if (language === "İngilizce") return "en";
  return "tr";
}

function requestedBeam(quality: Quality) {
  if (quality === "Hızlı") return 2;
  if (quality === "Dengeli") return 4;
  return 6;
}

function initialPrompt(language: Language, profile: AppSettings["transcriptionProfile"]) {
  if (profile === "Müzik/Vokal") {
    if (language === "İngilizce") return "Song or vocal recording. Transcribe every clearly audible lyric faithfully. Do not replace lyrics with a music description.";
    return "Türkçe şarkı veya vokal kaydı. Net duyulan tüm sözleri sırasıyla ve olduğu gibi yaz. Şarkı sözlerini müzik açıklamasıyla değiştirme, duyulmayan sözleri uydurma.";
  }
  if (language === "İngilizce") return "Speech recording. Transcribe faithfully. Do not invent unclear parts.";
  if (language === "Kürtçe") return "Kürtçe konuşma kaydı. Konuşulan kelimeleri olduğu gibi yaz. Anlaşılmayan bölümleri uydurma.";
  if (language === "Otomatik") return "Konuşma kaydı. Dili otomatik algıla. Anlaşılmayan bölümleri uydurma.";
  return "Türkçe konuşma kaydı. Konuşulan kelimeleri olduğu gibi yaz. Türkçe karakterleri doğru kullan. Anlaşılmayan bölümleri uydurma.";
}

function safeName(value: string) {
  return (value || "transkript")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 90)
    .replace(/[._\s]+$/g, "") || "transkript";
}

function cleanTranscript(text: string) {
  let result = (text || "").trim();
  result = result.replace(/\s+([,.!?;:])/g, "$1");
  result = result.replace(/([,.!?;:])(?=\S)/g, (match, punctuation: string, offset: number, source: string) => {
    const previous = source[offset - 1] || "";
    const next = source[offset + 1] || "";
    if (punctuation === ":" && /\d/.test(previous) && /\d/.test(next)) return match;
    return `${punctuation} `;
  });
  result = result.replace(/[ \t]{2,}/g, " ");
  result = result.replace(/(^|\n)([a-zçğıöşü])/g, (_m, p1: string, p2: string) => p1 + p2.toLocaleUpperCase("tr-TR"));
  return result.trim();
}

function hasMeaningfulTranscript(text: string) {
  return (text.match(/[\p{L}\p{N}]/gu) || []).length >= 2;
}

function validateYouTubeUrl(value: string) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    if (host !== "youtube.com" && !host.endsWith(".youtube.com") && host !== "youtu.be") throw new Error();
    return parsed.toString();
  } catch {
    throw new UserVisibleError("Geçerli bir YouTube bağlantısı girin.");
  }
}

function parseSrtTime(value: string) {
  const match = value.trim().match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?/);
  if (!match) return 0;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const milliseconds = Number((match[4] || "0").padEnd(3, "0"));
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function formatTimestamp(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function parseSrt(content: string, timestamps: boolean, offsetSeconds = 0) {
  const blocks = content.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  const lines: string[] = [];
  for (const block of blocks) {
    const parts = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const time = parts.find((line) => line.includes("-->"));
    if (!time) continue;
    const text = parts.filter((line) => !/^\d+$/.test(line) && !line.includes("-->")).join(" ").trim();
    if (!text) continue;
    const [startRaw, endRaw] = time.split("-->").map((value) => value.trim());
    const start = parseSrtTime(startRaw) + offsetSeconds;
    const end = parseSrtTime(endRaw || startRaw) + offsetSeconds;
    lines.push(`${timestamps ? `[${formatTimestamp(start)} - ${formatTimestamp(Math.max(start, end))}] ` : ""}${text}`);
  }
  return cleanTranscript(lines.join("\n"));
}

function normalizeTranscript(text: string, settings: AppSettings) {
  if (settings.autoCorrect === false) return (text || "").trim();
  return cleanTranscript(text);
}

function stageEta(id: string, stage: string, completed: number, total: number) {
  const now = Date.now();
  const previous = etaStates.get(id);
  if (!previous || previous.stage !== stage || completed < previous.lastValue) {
    etaStates.set(id, { stage, lastAt: now, lastValue: completed, speed: 0, samples: 0 });
    return "Hesaplanıyor…";
  }
  const elapsed = (now - previous.lastAt) / 1000;
  const delta = completed - previous.lastValue;
  if (elapsed >= 0.4 && delta > 0) {
    const instant = delta / elapsed;
    previous.speed = previous.samples ? previous.speed * 0.72 + instant * 0.28 : instant;
    previous.samples += 1;
    previous.lastAt = now;
    previous.lastValue = completed;
  }
  if (previous.samples < 2 || previous.speed <= 0 || total <= completed) return total <= completed ? "Birkaç saniye" : "Hesaplanıyor…";
  return formatDuration(Math.max(1, (total - completed) / previous.speed));
}

function emitProgress(id: string, progress: number, stage: string, startedAt?: number, remainingOverride?: string) {
  mainWindow?.webContents.send("transcribe:progress", { id, progress: Math.round(clamp(progress, 0, 100)), stage, remaining: remainingOverride || "Hesaplanıyor…" });
}

function emitMediaProgress(id: string, processedSeconds: number, totalSeconds: number, startPercent: number, endPercent: number, stage: string, startedAt?: number) {
  const ratio = totalSeconds > 0 ? clamp(processedSeconds / totalSeconds, 0, 1) : 0;
  const progress = startPercent + (endPercent - startPercent) * ratio;
  emitProgress(id, progress, stage, startedAt, stageEta(id, stage, processedSeconds, totalSeconds));
}

function parseProcessTime(line: string) {
  const ms = line.match(/out_time_ms=(\d+)/);
  if (ms) return Number(ms[1]) / 1_000_000;
  const us = line.match(/out_time_us=(\d+)/);
  if (us) return Number(us[1]) / 1_000_000;
  const text = line.match(/out_time=(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)/);
  if (text) return parseSrtTime(text[1]);
  const whisper = line.match(/\[(\d{1,2}:\d{2}:\d{2}(?:[,.]\d{1,3})?)\s*-->/);
  if (whisper) return parseSrtTime(whisper[1]);
  return 0;
}

function mapTranscriptionError(error: unknown) {
  const detail = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (detail.includes("ffmpeg") && (detail.includes("bulunamad") || detail.includes("enoent"))) {
    return "FFmpeg bulunamadı. Uygulamayı yeniden kurun veya Tools klasörünü kontrol edin.";
  }
  if (detail.includes("ffprobe") && (detail.includes("bulunamad") || detail.includes("enoent"))) {
    return "FFprobe bulunamadı. Uygulamayı yeniden kurun veya Tools klasörünü kontrol edin.";
  }
  if (detail.includes("whisper") && (detail.includes("bulunamad") || detail.includes("enoent"))) {
    return "Whisper çalıştırıcısı bulunamadı. Uygulamayı yeniden kurun.";
  }
  if (detail.includes("model") || detail.includes("ggml-large-v2")) {
    return "Whisper large-v2 modeli yüklenemedi. Model dosyası eksik, bozuk veya bellek yetersiz olabilir.";
  }
  if (detail.includes("matches no streams") || detail.includes("does not contain any stream") || detail.includes("stream map")) {
    return "Dosyada kullanılabilir bir ses kanalı bulunamadı.";
  }
  if (detail.includes("invalid data") || detail.includes("could not find codec") || detail.includes("moov atom not found")) {
    return "Medya dosyası bozuk veya desteklenmeyen bir biçimde.";
  }
  if (detail.includes("unable to download") || detail.includes("http error") || detail.includes("network") || detail.includes("timed out")) {
    return "YouTube sesi alınamadı. İnternet bağlantınızı ve bağlantıyı kontrol edin.";
  }
  if (detail.includes("permission") || detail.includes("eperm") || detail.includes("eacces")) {
    return "Dosya yazma izni yok. Farklı bir klasör seçin veya uygulamayı yeniden başlatın.";
  }
  if (detail.includes("no space") || detail.includes("enospc")) {
    return "Diskte yeterli boş alan yok.";
  }
  if (detail.includes("memory") || detail.includes("bad allocation") || detail.includes("alloc")) {
    return "Bilgisayar belleği bu işlem için yetersiz kaldı. Daha kısa bir dosya deneyin veya diğer programları kapatın.";
  }
  return "Dönüştürme tamamlanamadı. Dosyayı, internet bağlantısını ve uygulama araçlarını kontrol edip yeniden deneyin.";
}

async function downloadYoutubeAudio(url: string, targetDir: string, jobId?: string, startedAt?: number) {
  fs.mkdirSync(targetDir, { recursive: true });
  const existing = fs.readdirSync(targetDir)
    .filter((name) => /^audio\./i.test(name))
    .map((name) => path.join(targetDir, name))
    .find((file) => {
      try {
        return fs.statSync(file).size > 1024;
      } catch {
        return false;
      }
    });
  if (existing) return existing;

  const ffmpeg = requireTool("ffmpeg", "ffmpeg.exe", "FFmpeg");
  const outputTemplate = path.join(targetDir, "audio.%(ext)s");
  await runProcess(requireTool("yt-dlp", "yt-dlp.exe", "yt-dlp"), [
    "-f",
    "bestaudio/best",
    "--no-playlist",
    "--newline",
    "--extract-audio",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "--ffmpeg-location",
    path.dirname(ffmpeg),
    "-o",
    outputTemplate,
    url
  ], {
    jobId,
    onLine: (line) => {
      if (!jobId) return;
      const match = line.match(/(\d{1,3}(?:\.\d+)?)%/);
      if (match) {
        const completed = Number(match[1]);
        emitProgress(jobId, Math.min(18, 4 + completed * 0.14), "YouTube sesi hazırlanıyor", startedAt, stageEta(jobId, "YouTube sesi hazırlanıyor", completed, 100));
      }
    }
  });
  const downloaded = fs.readdirSync(targetDir).find((name) => /^audio\./i.test(name));
  if (!downloaded) throw new UserVisibleError("YouTube sesi alınamadı. Bağlantıyı ve internet erişimini kontrol edin.");
  return path.join(targetDir, downloaded);
}

async function prepareYouTubePreview(url: string, jobId?: string, startedAt?: number): Promise<PreparedAudio> {
  const validatedUrl = validateYouTubeUrl(url);
  const dir = path.join(previewDir(), stableId(validatedUrl));
  const audio = await downloadYoutubeAudio(validatedUrl, dir, jobId, startedAt);
  return inspectMediaFile(audio);
}

async function prepareInput(job: JobRecord, dir: string, startedAt?: number) {
  if (job.sourceType !== "youtube") {
    if (!job.sourcePath || !fs.existsSync(job.sourcePath)) throw new UserVisibleError("Seçilen medya dosyası bulunamadı.");
    if (fs.statSync(job.sourcePath).size === 0) throw new UserVisibleError("Seçilen medya dosyası boş.");
    if (!supportedMediaExtensions.has(path.extname(job.sourcePath).toLowerCase())) throw new UserVisibleError("Bu dosya biçimi desteklenmiyor.");
    return { input: job.sourcePath, previewPath: job.sourcePath };
  }
  if (job.previewPath && fs.existsSync(job.previewPath)) return { input: job.previewPath, previewPath: job.previewPath };
  const prepared = await prepareYouTubePreview(job.sourcePath, job.id, startedAt);
  return { input: prepared.path, previewPath: prepared.path };
}

ipcMain.handle("settings:get", () => sanitizeSettings(readJson<Partial<AppSettings>>(settingsPath(), defaultSettings)));
ipcMain.handle("settings:save", (_event, settings: AppSettings) => {
  const sanitized = sanitizeSettings(settings);
  writeJson(settingsPath(), sanitized);
  return sanitized;
});
ipcMain.handle("settings:reset", () => {
  writeJson(settingsPath(), defaultSettings);
  return defaultSettings;
});
ipcMain.handle("history:get", () => readJson<JobRecord[]>(historyPath(), []).map((job) => {
  const extension = path.extname(job.sourcePath || job.name).toLowerCase();
  const sourceType = job.sourceType === "file" ? ([".mp4", ".mkv", ".webm", ".mov", ".avi", ".wmv"].includes(extension) ? "local-video" : "local-audio") : job.sourceType;
  return job.status === "İşleniyor" ? { ...job, sourceType, status: "Bekliyor" as const, stage: "Yeniden başlatılmayı bekliyor", progress: 0, remaining: "Bekliyor" } : { ...job, sourceType };
}));
ipcMain.handle("history:save", (_event, jobs: JobRecord[]) => {
  writeJson(historyPath(), jobs);
  return true;
});

ipcMain.handle("files:choose", async () => {
  const result = await dialog.showOpenDialog({
    title: "Ses veya video dosyası seç",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Ses ve video", extensions: ["mp3", "wav", "m4a", "mp4", "webm", "mpeg", "mpga", "mov", "avi", "mkv", "flac", "aac", "ogg", "opus", "wma", "wmv"] }
    ]
  });
  if (result.canceled) return [];
  return Promise.all(result.filePaths.map(async (file) => ({
    ...await inspectMediaFile(file),
    name: path.basename(file)
  })));
});

ipcMain.handle("files:inspect", async (_event, paths: string[]) => {
  if (!Array.isArray(paths)) return [];
  const uniquePaths = Array.from(new Set(paths.filter((file) => typeof file === "string" && file.trim())));
  const inspected = await Promise.allSettled(uniquePaths.map(async (file) => ({
    ...await inspectMediaFile(file),
    name: path.basename(file)
  })));
  const valid = inspected.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (!valid.length && inspected.some((result) => result.status === "rejected")) {
    const first = inspected.find((result) => result.status === "rejected");
    const reason = first?.status === "rejected" ? first.reason : undefined;
    if (reason instanceof UserVisibleError) throw reason;
    throw new UserVisibleError("Seçilen dosyalar okunamadı veya desteklenmiyor.");
  }
  return valid;
});

ipcMain.handle("youtube:info", async (_event, url: string) => {
  const validatedUrl = validateYouTubeUrl(url);
  try {
    const result = await runProcess(requireTool("yt-dlp", "yt-dlp.exe", "yt-dlp"), ["--dump-single-json", "--no-playlist", "--no-warnings", validatedUrl]);
    const data = JSON.parse(result.stdout);
    return {
      url: validatedUrl,
      title: data.title || "Video bilgisi",
      duration: formatDuration(Number(data.duration || 0)),
      channel: data.channel || data.uploader || "",
      thumbnail: data.thumbnail || ""
    };
  } catch (error) {
    if (error instanceof UserVisibleError) throw error;
    throw new UserVisibleError("YouTube bilgisi alınamadı. Bağlantıyı ve internet erişimini kontrol edin.");
  }
});

ipcMain.handle("youtube:prepare", async (_event, url: string, jobId?: string) => {
  try {
    const prepared = await prepareYouTubePreview(url, typeof jobId === "string" ? jobId : undefined, Date.now());
    return { ...prepared, name: path.basename(prepared.path) };
  } catch (error) {
    if (error instanceof UserVisibleError) throw error;
    const detail = error instanceof Error ? error.message.toLowerCase() : "";
    if (detail.includes("network") || detail.includes("unable to download") || detail.includes("download")) {
      throw new UserVisibleError("YouTube sesi alınamadı. İnternet bağlantınızı ve bağlantıyı kontrol edin.");
    }
    throw new UserVisibleError("YouTube sesi hazırlanamadı. Bağlantıyı kontrol edip yeniden deneyin.");
  }
});

ipcMain.handle("transcribe:cancel", async (_event, jobId: string) => {
  if (!jobId || typeof jobId !== "string") throw new UserVisibleError("İptal edilecek işlem bulunamadı.");
  await cancelJob(jobId);
  return true;
});

async function splitAudioIfNeeded(ffmpeg: string, wav: string, totalSeconds: number, dir: string, jobId: string) {
  const chunkSeconds = 600;
  if (totalSeconds <= chunkSeconds) return [{ file: wav, offset: 0, duration: totalSeconds }];
  const chunkDir = path.join(dir, "chunks");
  fs.mkdirSync(chunkDir, { recursive: true });
  const pattern = path.join(chunkDir, "chunk_%04d.wav");
  await runProcess(ffmpeg, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-i",
    wav,
    "-map",
    "0:a:0",
    "-f",
    "segment",
    "-segment_time",
    String(chunkSeconds),
    "-reset_timestamps",
    "1",
    "-c",
    "copy",
    pattern
  ], { jobId });
  const files = fs.readdirSync(chunkDir)
    .filter((name) => /^chunk_\d+\.wav$/i.test(name))
    .sort()
    .map((name) => path.join(chunkDir, name));
  if (!files.length) return [{ file: wav, offset: 0, duration: totalSeconds }];
  let offset = 0;
  const chunks = [];
  for (const file of files) {
    const duration = await probeDuration(file);
    chunks.push({ file, offset, duration: duration > 0 ? duration : Math.min(chunkSeconds, Math.max(0, totalSeconds - offset)) });
    offset += chunks[chunks.length - 1].duration;
  }
  return chunks;
}

async function transcribeChunks(job: JobRecord, settings: AppSettings, whisper: string, model: string, chunks: { file: string; offset: number; duration: number }[], totalSeconds: number, dir: string, startedAt: number) {
  const beam = requestedBeam(job.quality);
  const code = languageCode(job.language);
  const transcriptParts: string[] = [];
  let processedSeconds = 0;
  for (let index = 0; index < chunks.length; index++) {
    if (cancelledJobs.has(job.id)) throw new CancelledError("İşlem kullanıcı tarafından iptal edildi.");
    const chunk = chunks[index];
    const outBase = path.join(dir, `transcript_${String(index).padStart(4, "0")}`);
    const args = [
      "-m",
      model,
      "-f",
      chunk.file,
      "-of",
      outBase,
      "-otxt",
      "-osrt",
      "-t",
      Math.max(2, Math.min(8, os.cpus().length - 1)).toString(),
      "-bs",
      beam.toString(),
      "-bo",
      beam.toString(),
      "-pp",
      "--prompt",
      initialPrompt(job.language, settings.transcriptionProfile),
      "--carry-initial-prompt"
    ];
    args.push("-nth", settings.transcriptionProfile === "Müzik/Vokal" ? "0.85" : "0.75");
    if (code !== "auto") args.push("-l", code);
    await runProcess(whisper, args, {
      jobId: job.id,
      onLine: (line) => {
        const percent = line.match(/(?:progress\s*=\s*|\b)(\d{1,3})%/i);
        if (percent) {
          emitMediaProgress(job.id, processedSeconds + chunk.duration * (Number(percent[1]) / 100), totalSeconds, 25, 92, `Metne dönüştürülüyor (${index + 1}/${chunks.length})`, startedAt);
          return;
        }
        const current = parseProcessTime(line);
        if (current > 0) {
          emitMediaProgress(job.id, processedSeconds + Math.min(chunk.duration || current, current), totalSeconds, 25, 92, `Metne dönüştürülüyor (${index + 1}/${chunks.length})`, startedAt);
        }
      }
    });
    const srt = `${outBase}.srt`;
    const txt = `${outBase}.txt`;
    let chunkTranscript = "";
    if (fs.existsSync(srt)) chunkTranscript = parseSrt(fs.readFileSync(srt, "utf8"), settings.timestamps, chunk.offset);
    if (!chunkTranscript && fs.existsSync(txt)) {
      const raw = fs.readFileSync(txt, "utf8").trim();
      chunkTranscript = settings.timestamps ? `[${formatTimestamp(chunk.offset)} - ${formatTimestamp(chunk.offset + chunk.duration)}] ${raw}` : raw;
    }
    if (chunkTranscript.trim()) transcriptParts.push(chunkTranscript.trim());
    processedSeconds = Math.min(totalSeconds, processedSeconds + Math.max(0, chunk.duration));
    emitMediaProgress(job.id, processedSeconds, totalSeconds, 25, 92, `Metne dönüştürülüyor (${index + 1}/${chunks.length})`, startedAt);
  }
  return normalizeTranscript(transcriptParts.join("\n"), settings);
}

ipcMain.handle("transcribe:start", async (_event, job: JobRecord, settings: AppSettings) => {
  if (!job?.id) throw new UserVisibleError("Dönüştürme işi geçersiz.");
  cancelledJobs.delete(job.id);
  const startedAt = Date.now();
  const dir = workDir(job.id);
  try {
    const ffmpeg = requireTool("ffmpeg", "ffmpeg.exe", "FFmpeg");
    const whisper = requireTool("whisper", "whisper-cli.exe", "Whisper çalıştırıcısı");
    const model = await ensureModel(job.id, startedAt);
    emitProgress(job.id, 4, "Dosya hazırlanıyor", startedAt);
    const preparedInput = await prepareInput(job, dir, startedAt);
    const input = preparedInput.input;
    const inputInfo = await inspectMediaFile(input);
    const inputSeconds = inputInfo.durationSeconds || job.durationSeconds || 0;
    emitProgress(job.id, 16, "Ses hazırlanıyor", startedAt);
    const wav = path.join(dir, "input_16k.wav");
    await runProcess(ffmpeg, [
      "-y",
      "-hide_banner",
      "-nostdin",
      "-probesize",
      "50M",
      "-analyzeduration",
      "100M",
      "-i",
      input,
      "-vn",
      "-sn",
      "-dn",
      "-map",
      "0:a:0",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      "-sample_fmt",
      "s16",
      "-af",
      "aresample=async=1:first_pts=0,loudnorm=I=-18:LRA=11:TP=-1.5",
      "-progress",
      "pipe:1",
      "-nostats",
      "-f",
      "wav",
      wav
    ], {
      jobId: job.id,
      onLine: (line) => {
        const current = parseProcessTime(line);
        if (current > 0) emitMediaProgress(job.id, current, inputSeconds, 16, 24, "Ses hazırlanıyor", startedAt);
      }
    });
    requireFile(wav, "Hazırlanan ses dosyası", 44);
    const preparedSeconds = await probeDuration(wav);
    if (preparedSeconds <= 0) throw new UserVisibleError("Ses hazırlanamadı. Dosyada okunabilir bir ses kanalı bulunamadı.");

    emitProgress(job.id, 25, "Metne dönüştürülüyor", startedAt);
    const chunks = await splitAudioIfNeeded(ffmpeg, wav, preparedSeconds, dir, job.id);
    let transcript = await transcribeChunks(job, settings, whisper, model, chunks, preparedSeconds, dir, startedAt);

    emitProgress(job.id, 94, "Çıktı oluşturuluyor", startedAt);
    transcript = normalizeTranscript(transcript, settings);
    if (!hasMeaningfulTranscript(transcript)) {
      throw new UserVisibleError("Konuşma algılanamadı veya Whisper boş çıktı üretti. Ses seviyesini ve seçilen dili kontrol edin.");
    }

    const completed: JobRecord = {
      ...job,
      previewPath: preparedInput.previewPath,
      format: job.sourceType === "youtube" ? inputInfo.format : job.format,
      sizeText: job.sourceType === "youtube" ? inputInfo.sizeText : job.sizeText,
      duration: formatDuration(preparedSeconds),
      durationSeconds: preparedSeconds,
      status: "Tamamlandı",
      progress: 100,
      stage: "Tamamlandı",
      remaining: "Tamamlandı",
      rawTranscript: transcript,
      transcript,
      completedAt: new Date().toISOString(),
      error: undefined
    };
    const autoTxt = await exportTxt(completed);
    completed.outputFiles = { ...completed.outputFiles, txt: autoTxt };
    emitProgress(job.id, 100, "Tamamlandı", startedAt, "Tamamlandı");
    return completed;
  } catch (error) {
    if (error instanceof CancelledError || cancelledJobs.has(job.id)) {
      return {
        ...job,
        status: "İptal Edildi",
        stage: "İptal edildi",
        progress: Math.min(job.progress || 0, 99),
        remaining: "-",
        transcript: "",
        rawTranscript: "",
        outputFiles: {},
        completedAt: new Date().toISOString(),
        error: undefined
      };
    }
    if (error instanceof UserVisibleError) throw error;
    runtimeLog(`transcribe:error:${job.id}:${error instanceof Error ? error.stack || error.message : String(error)}`);
    throw new UserVisibleError(mapTranscriptionError(error));
  } finally {
    activeProcesses.delete(job.id);
    cancelledJobs.delete(job.id);
    etaStates.delete(job.id);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      runtimeLog(`workdir:cleanup:error:${job.id}:${String(error)}`);
    }
  }
});

ipcMain.handle("export:file", async (_event, payload: { type: "pdf" | "docx" | "txt"; job: JobRecord }) => {
  if (!payload?.job || payload.job.status !== "Tamamlandı" || !hasMeaningfulTranscript(payload.job.transcript)) {
    throw new UserVisibleError("Dışa aktarmak için tamamlanmış ve geçerli bir transkript gerekli.");
  }
  const extension = payload.type;
  let targetPath = defaultOutputPath(payload.job, extension);
  if (process.env.ELECTRON_SMOKE !== "1") {
    const result = await dialog.showSaveDialog({
      title: `${extension.toUpperCase()} olarak kaydet`,
      defaultPath: targetPath,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
    });
    if (result.canceled || !result.filePath) return { path: "" };
    targetPath = result.filePath;
  }
  try {
    if (payload.type === "pdf") return { path: await exportPdf(payload.job, targetPath) };
    if (payload.type === "docx") return { path: await exportDocx(payload.job, targetPath) };
    return { path: await exportTxt(payload.job, targetPath) };
  } catch (error) {
    if (error instanceof UserVisibleError) throw error;
    runtimeLog(`export:${payload.type}:error:${error instanceof Error ? error.stack || error.message : String(error)} target=${targetPath}`);
    throw new UserVisibleError("Dosya kaydedilemedi. Seçilen klasör izinlerini ve disk alanını kontrol edin.");
  }
});

ipcMain.handle("shell:reveal", async (_event, filePath: string) => {
  if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
  else shell.openPath(outputDir());
  return true;
});

ipcMain.handle("shell:diagnostics", async () => {
  const dir = app.getPath("logs");
  fs.mkdirSync(dir, { recursive: true });
  await shell.openPath(dir);
  return true;
});

function outputStamp() {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const time = `${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;
  return `${date}_${time}`;
}

function defaultOutputPath(job: JobRecord, extension: string) {
  return path.join(outputDir(), `${safeName(path.parse(job.name).name)}_transkript_${outputStamp()}.${extension}`);
}

function outputBase(job: JobRecord, extension: string, targetFile?: string) {
  if (targetFile) {
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    return targetFile;
  }
  const stamp = outputStamp();
  const base = path.join(outputDir(), `${safeName(path.parse(job.name).name)}_transkript_${stamp}`);
  let candidate = `${base}.${extension}`;
  let suffix = 2;
  while (fs.existsSync(candidate)) candidate = `${base}_${suffix++}.${extension}`;
  return candidate;
}

function assertOutputFile(file: string, label: string) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    throw new UserVisibleError(`${label} çıktısı oluşturulamadı. Çıktı klasörü izinlerini kontrol edin.`);
  }
  return file;
}

function printableText(value: string) {
  return (value || "")
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\u00a0/g, " ");
}

async function exportTxt(job: JobRecord, targetFile?: string) {
  const file = outputBase(job, "txt", targetFile);
  fs.writeFileSync(file, `\uFEFF${printableText(renderPlainTranscript(job)).replace(/(?<!\r)\n/g, "\r\n")}`, "utf8");
  return assertOutputFile(file, "TXT");
}

async function exportDocx(job: JobRecord, targetFile?: string) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableCell, TableRow, WidthType } = await import("docx");
  const rows = [
    ["Dosya adı", job.name],
    ["Tarih", new Date().toLocaleString("tr-TR")],
    ["Süre", job.duration],
    ["Dil", job.language],
    ["Kalite", job.quality]
  ].map(([left, right]) => new TableRow({
    children: [
      new TableCell({ width: { size: 25, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: left, bold: true })] })] }),
      new TableCell({ children: [new Paragraph(right)] })
    ]
  }));
  const transcriptParagraphs = printableText(job.transcript || "Metin bulunamadı.")
    .split(/\r?\n/)
    .map((line) => new Paragraph({ children: [new TextRun(line)] }));
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: "My Sesi Metne Dönüştürme", heading: HeadingLevel.TITLE }),
        new Paragraph({ text: "Transkript Raporu", heading: HeadingLevel.HEADING_1 }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
        new Paragraph(""),
        ...transcriptParagraphs,
        new Paragraph(""),
        new Paragraph("© 2026 Mustafa Yılmaz. Tüm hakları saklıdır.")
      ]
    }]
  });
  const buffer = await Packer.toBuffer(doc);
  const file = outputBase(job, "docx", targetFile);
  fs.writeFileSync(file, buffer);
  return assertOutputFile(file, "DOCX");
}

async function exportPdf(job: JobRecord, targetFile?: string) {
  // Standalone dağıtım fontkit bağımlılıklarını kendi içinde taşır; paketli ASAR'da
  // electron-builder'ın eksik transitive modül toplamasına bağlı kalmaz.
  const PDFDocument = require("pdfkit/js/pdfkit.standalone.js") as typeof import("pdfkit");
  const file = outputBase(job, "pdf", targetFile);
  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
  const stream = fs.createWriteStream(file);
  const finished = new Promise<void>((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  const font = ["C:\\Windows\\Fonts\\arial.ttf", "C:\\Windows\\Fonts\\segoeui.ttf", "C:\\Windows\\Fonts\\tahoma.ttf"].find((candidate) => fs.existsSync(candidate));
  if (!font) throw new UserVisibleError("PDF için Türkçe karakter destekli Windows yazı tipi bulunamadı.");
  doc.registerFont("AppText", fs.readFileSync(font));
  doc.font("AppText");
  doc.pipe(stream);
  doc.fontSize(20).fillColor("#111827").text("My Sesi Metne Dönüştürme");
  doc.moveDown(0.2).fontSize(15).fillColor("#4f46e5").text("Transkript Raporu");
  doc.moveDown();
  doc.fontSize(10).fillColor("#334155");
  doc.text(`Dosya adı: ${printableText(job.name)}`);
  doc.text(`Tarih: ${new Date().toLocaleString("tr-TR")}`);
  doc.text(`Süre: ${job.duration}`);
  doc.text(`Dil: ${job.language}`);
  doc.text(`Kalite: ${job.quality}`);
  doc.moveDown();
  doc.fontSize(11).fillColor("#111827");
  for (const line of printableText(job.transcript || "Metin bulunamadı.").split(/\r?\n/)) {
    const match = line.match(/^\[(.+?)\]\s*(.*)$/);
    const printable = match ? `[${match[1]}] ${match[2] || ""}` : line;
    doc.fillColor(match ? "#1f3fbf" : "#111827").text(printable || " ", {
      width: 500,
      lineGap: 4,
      paragraphGap: 3,
      features: []
    });
    if (doc.y > 760) doc.addPage();
  }
  doc.moveDown();
  doc.fontSize(9).fillColor("#64748b").text("© 2026 Mustafa Yılmaz. Tüm hakları saklıdır.");
  doc.end();
  await finished;
  return assertOutputFile(file, "PDF");
}

function renderPlainTranscript(job: JobRecord) {
  return [
    "My Sesi Metne Dönüştürme",
    "Transkript Raporu",
    "",
    `Dosya adı: ${job.name}`,
    `Tarih: ${new Date().toLocaleString("tr-TR")}`,
    `Süre: ${job.duration}`,
    `Dil: ${job.language}`,
    `Kalite: ${job.quality}`,
    "",
    job.transcript || "",
    "",
    "© 2026 Mustafa Yılmaz. Tüm hakları saklıdır."
  ].join("\n");
}
