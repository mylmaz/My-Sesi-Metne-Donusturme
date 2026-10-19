import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell, type IpcMainInvokeEvent } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createHash, randomBytes, randomUUID } from "crypto";
import { Readable } from "stream";
import { pathToFileURL } from "url";
import { parseSrtSegments, renderTranscript, type TranscriptSegment } from "./transcription";
import { readStereoRms, stereoCancellationChannel } from "./audio-preparation";

type Quality = "Hızlı" | "Dengeli" | "Yüksek Doğruluk";
type Language = "Otomatik" | "Türkçe" | "İngilizce" | "Almanca";
type JobStatus = "Bekliyor" | "İşleniyor" | "Tamamlandı" | "Hata" | "İptal Edildi" | "Durduruldu";

interface AppSettings {
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
  sourceType: "file" | "youtube";
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
  warning?: string;
  thumbnail?: string;
  channel?: string;
  detectedLanguage?: string;
  segments?: TranscriptSegment[];
}

const defaultSettings: AppSettings = {
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
const runningJobs = new Set<string>();
const playbackTokens = new Map<string, string>();
const pinnedCacheFiles = new Set<string>();

// This scheme can only serve opaque tokens issued for prepared audio; it cannot
// turn renderer supplied paths into unrestricted file-system access.
protocol.registerSchemesAsPrivileged([
  { scheme: "app-media", privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }
]);

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

function createWindow() {
  runtimeLog("createWindow:start");
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 960,
    minHeight: 520,
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
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());

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
  registerAudioProtocol();
  pruneAudioCache();
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
  const dir = path.join(app.getPath("documents"), "My Sesi Metne Donusturme Ciktilar");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function workDir(jobId: string) {
  validateJobId(jobId);
  const root = path.join(appDataDir(), "work");
  fs.mkdirSync(root, { recursive: true });
  return fs.mkdtempSync(path.join(root, `${jobId}-`));
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
  return resolveResource("Tools", "models", "ggml-large-v2-q5_0.bin");
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
  return requireFile(modelPath(), "Whisper Large-v2 q5_0 model dosyası", 1000 * 1024 * 1024);
}

function validateJobId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) {
    throw new UserVisibleError("Dönüştürme işleminin kimliği geçersiz.");
  }
}

function trustedHandle(channel: string, handler: (event: IpcMainInvokeEvent, ...args: any[]) => unknown) {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    const frame = event.senderFrame;
    const expectedUrl = process.env.VITE_DEV_SERVER_URL;
    const rendererFile = pathToFileURL(path.join(__dirname, "../../dist/index.html")).toString();
    const allowedUrl = frame && (expectedUrl
      ? new URL(frame.url).origin === new URL(expectedUrl).origin
      : frame.url.split(/[?#]/)[0] === rendererFile);
    if (!mainWindow || event.sender !== mainWindow.webContents || frame !== event.sender.mainFrame || !allowedUrl) {
      throw new UserVisibleError("Bu işlem yalnızca uygulama penceresinde kullanılabilir.");
    }
    return handler(event, ...args);
  });
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
  // Replace the complete document only after the new copy is safely written.
  // An interrupted write must not truncate an existing transcript history.
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
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

function runProcess(command: string, args: string[], options: { jobId?: string; onLine?: (line: string) => void; cwd?: string } = {}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    if (options.jobId && cancelledJobs.has(options.jobId)) {
      reject(new CancelledError("İşlem kullanıcı tarafından iptal edildi."));
      return;
    }
    const child = spawn(command, args, { windowsHide: true, cwd: options.cwd });
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
      else reject(new Error(`${path.basename(command)} çıkış kodu: ${code}\n${stderr || stdout || "Komut tamamlanamadı."}`));
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

async function stereoInputFilter(input: string, ffmpeg: string, jobId: string) {
  try {
    const probe = await runProcess(requireTool("ffmpeg", "ffprobe.exe", "FFprobe"), ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels,channel_layout", "-of", "json", input], { jobId });
    const stream = JSON.parse(probe.stdout).streams?.[0];
    // Ordinary two-channel PCM WAV often omits channel_layout; FFmpeg already
    // interprets that same channel order as L/R during the existing -ac 1 mix.
    // Keep explicitly declared non-stereo layouts outside this exception.
    if (stream?.channels !== 2 || (stream.channel_layout && !["stereo", "unknown"].includes(stream.channel_layout))) return "";
    const result = await runProcess(ffmpeg, ["-hide_banner", "-nostdin", "-i", input, "-map", "0:a:0", "-vn", "-sn", "-dn", "-af", "pan=3c|c0=c0|c1=c1|c2=0.5*c0+0.5*c1,astats=metadata=0:reset=0", "-f", "null", "-"], { jobId });
    const decision = stereoCancellationChannel(readStereoRms(result.stderr));
    if (!decision) return "";
    runtimeLog(`audio:stereo-cancellation:${jobId}:${JSON.stringify(decision)}`);
    return `pan=mono|c0=c${decision.channel},`;
  } catch (error) {
    if (error instanceof CancelledError || cancelledJobs.has(jobId)) throw error;
    // Diagnostics must never make a previously supported media file fail.
    runtimeLog(`audio:stereo-analysis:error:${jobId}:${String(error)}`);
    return "";
  }
}

function validateLocalMedia(value: unknown) {
  if (typeof value !== "string" || !path.isAbsolute(value) || value.includes("\0")) {
    throw new UserVisibleError("Dosyanın bilgisayardaki tam yolu alınamadı. Dosyayı yeniden seçin.");
  }
  const file = path.resolve(value);
  if (!supportedMediaExtensions.has(path.extname(file).toLowerCase())) {
    throw new UserVisibleError(`${path.basename(file)}: Bu dosya biçimi desteklenmiyor. Ses veya video dosyası seçin.`);
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new UserVisibleError(`${path.basename(file)}: Medya dosyası bulunamadı.`);
  if (fs.statSync(file).size === 0) throw new UserVisibleError(`${path.basename(file)}: Medya dosyası boş.`);
  fs.accessSync(file, fs.constants.R_OK);
  return file;
}

async function inspectMediaFiles(values: unknown) {
  if (!Array.isArray(values) || values.length > 200) throw new UserVisibleError("Bir defada en fazla 200 medya dosyası ekleyin.");
  const files: { path: string; name: string; format: string; sizeText: string; duration: string; durationSeconds: number }[] = [];
  const errors: string[] = [];
  for (const value of [...new Set(values)]) {
    try {
      const file = validateLocalMedia(value);
      const stat = fs.statSync(file);
      const seconds = await probeDuration(file);
      if (seconds <= 0) throw new UserVisibleError(`${path.basename(file)}: Medya bilgisi okunamadı. Dosya bozuk olabilir.`);
      files.push({ path: file, name: path.basename(file), format: path.extname(file).slice(1).toUpperCase(), sizeText: formatBytes(stat.size), duration: formatDuration(seconds), durationSeconds: seconds });
    } catch (error) {
      runtimeLog(`files:inspect:error:${String(error)}`);
      errors.push(error instanceof UserVisibleError ? error.message : "Dosya okunamadı. Erişim izinlerini kontrol edin.");
    }
  }
  return { files, errors };
}

function sanitizeSettings(settings: Partial<AppSettings> | undefined): AppSettings {
  return {
    defaultQuality: settings?.defaultQuality && ["Hızlı", "Dengeli", "Yüksek Doğruluk"].includes(settings.defaultQuality) ? settings.defaultQuality : defaultSettings.defaultQuality,
    defaultLanguage: (settings?.defaultLanguage as string) === "Kürtçe" ? "Otomatik" : settings?.defaultLanguage && ["Otomatik", "Türkçe", "İngilizce", "Almanca"].includes(settings.defaultLanguage) ? settings.defaultLanguage : defaultSettings.defaultLanguage,
    timestamps: settings?.timestamps !== false,
    autoCorrect: settings?.autoCorrect !== false,
    soundEffects: settings?.soundEffects !== false,
    animations: settings?.animations !== false,
    transparentTheme: settings?.transparentTheme !== false
  };
}

function languageCode(language: Language) {
  if (language === "Otomatik") return "auto";
  if (language === "Almanca") return "de";
  if (language === "İngilizce") return "en";
  return "tr";
}

function requestedBeam(quality: Quality) {
  if (quality === "Hızlı") return 4;
  if (quality === "Dengeli") return 6;
  return 8;
}

function initialPrompt(language: Language) {
  if (language === "İngilizce") return "Speech recording. Transcribe faithfully. Do not invent unclear parts.";
  if (language === "Almanca") return "Deutsche Sprachaufnahme. Gesprochene Wörter originalgetreu transkribieren. Unverständliche Stellen nicht erfinden.";
  if (language === "Otomatik") return "";
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
  result = result.replace(/([,.!?;:])(?=\S)/g, (punctuation: string, _match: string, offset: number, source: string) => {
    // Preserve timestamp separators and decimal numbers while spacing prose.
    if (/\d/.test(source[offset - 1] || "") && /\d/.test(source[offset + 1] || "")) return punctuation;
    return `${punctuation} `;
  });
  result = result.replace(/[ \t]{2,}/g, " ");
  result = result.replace(/(^|\n)([a-zçğıöşü])/g, (_m, p1: string, p2: string) => p1 + p2.toLocaleUpperCase("tr-TR"));
  return result.trim();
}

function hasMeaningfulTranscript(text: string) {
  return typeof text === "string" && /[\p{L}\p{N}]/u.test(text.replace(/\[\d+(?::\d{2}){1,2}(?:[.,]\d{1,3})?\]/g, ""));
}

function validateYouTubeUrl(value: string) {
  try {
    if (typeof value !== "string" || value.length > 4096) throw new Error();
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    if (host !== "youtube.com" && !host.endsWith(".youtube.com") && host !== "youtu.be") throw new Error();
    if (parsed.username || parsed.password || parsed.port) throw new Error();
    const id = host === "youtu.be" ? parsed.pathname.split("/")[1]
      : parsed.pathname === "/watch" ? parsed.searchParams.get("v")
      : /^\/(?:shorts|embed|live)\//.test(parsed.pathname) ? parsed.pathname.split("/")[2] : null;
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error();
    return `https://www.youtube.com/watch?v=${id}`;
  } catch {
    throw new UserVisibleError("Geçerli bir YouTube bağlantısı girin.");
  }
}

function normalizeTranscript(text: string, settings: AppSettings) {
  if (settings.autoCorrect === false) return (text || "").trim();
  return cleanTranscript(text);
}

function emitProgress(id: string, progress: number, stage: string, startedAt?: number) {
  const maximum = stage === "Tamamlandı" ? 100 : 99.99;
  progress = Number.isFinite(progress) ? Math.round(Math.max(0, Math.min(maximum, progress)) * 100) / 100 : 0;
  const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  let remaining = stage === "Tamamlandı" ? "—" : "Hesaplanıyor…";
  if (progress > 5 && progress < 100 && startedAt) {
    const total = elapsed / (progress / 100);
    remaining = formatDuration(Math.max(3, total - elapsed));
  }
  mainWindow?.webContents.send("transcribe:progress", { id, progress, stage, remaining });
}

function audioCacheDir() {
  const dir = path.join(appDataDir(), "audio-cache");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cacheKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isWithin(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function pruneAudioCache() {
  // Run only at startup. Files issued to a player stay pinned for the session,
  // and completed downloads are never deleted with a transcription work folder.
  const root = audioCacheDir();
  const files = fs.readdirSync(root).filter((name) => /^[a-f0-9]{64}\.(?:mp3|source)$/.test(name))
    .map((name) => { const file = path.join(root, name); return { file, stat: fs.statSync(file) }; })
    .filter(({ stat }) => stat.isFile()).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  let bytes = 0;
  for (const { file, stat } of files) {
    bytes += stat.size;
    if (Date.now() - stat.mtimeMs > 30 * 86400_000 || bytes > 2 * 1024 ** 3) {
      try { fs.unlinkSync(file); } catch (error) { runtimeLog(`cache:prune:${String(error)}`); }
    }
  }
  // Only our generated, direct-child staging directories may be removed.
  for (const name of fs.readdirSync(root).filter((name) => /^staging-[a-f0-9-]{36}$/.test(name))) {
    const dir = path.join(root, name);
    if (isWithin(root, dir)) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (error) { runtimeLog(`cache:staging:cleanup:${String(error)}`); }
    }
  }
}

function registerAudioProtocol() {
  protocol.handle("app-media", async (request) => {
    const url = new URL(request.url);
    const file = url.hostname === "audio" && /^\/[a-f0-9]{48}$/.test(url.pathname) && !url.search
      ? playbackTokens.get(url.pathname.slice(1)) : undefined;
    if (!file || !pinnedCacheFiles.has(file) || !isWithin(audioCacheDir(), file) || !fs.existsSync(file)) {
      return new Response(null, { status: 404 });
    }
    if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
    const size = fs.statSync(file).size;
    let start = 0;
    let end = size - 1;
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      if (!match[1]) start = Math.max(0, size - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      }
    }
    const headers: Record<string, string> = { "Content-Type": "audio/mpeg", "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes", "Cache-Control": "private, no-store" };
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    const body = request.method === "HEAD" ? null : Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream<Uint8Array>;
    return new Response(body, { status: range ? 206 : 200, headers });
  });
}

function youtubeArguments() {
  const ffmpeg = requireTool("ffmpeg", "ffmpeg.exe", "FFmpeg");
  const deno = requireTool("deno", "deno.exe", "YouTube JavaScript çalışma zamanı (Deno)");
  // yt-dlp otherwise writes Windows ANSI stdout: a valid downloaded Unicode
  // path cannot be decoded as UTF-8 by Node and would appear to be missing.
  return ["--ignore-config", "--encoding", "utf-8", "--no-plugin-dirs", "--no-playlist", "--no-js-runtimes", "--js-runtimes", `deno:${deno}`, "--ffmpeg-location", path.dirname(ffmpeg), "--socket-timeout", "30", "--retries", "3"];
}

function youtubeError(error: unknown, operation: string) {
  runtimeLog(`youtube:${operation}:error:${error instanceof Error ? error.stack || error.message : String(error)}`);
  if (error instanceof UserVisibleError || error instanceof CancelledError) return error;
  const detail = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (/sign in|confirm you|private video|members.only|age.restricted|login required|cookies/.test(detail)) {
    return new UserVisibleError("YouTube bu içerik için oturum veya erişim izni istiyor. Herkese açık ve erişim hakkınız bulunan desteklenen bir video kullanın.");
  }
  if (/unavailable|not available|has been removed|copyright|geo.restricted/.test(detail)) {
    return new UserVisibleError("YouTube videosuna erişilemiyor; video kaldırılmış veya bölgenizde kısıtlanmış olabilir.");
  }
  if (/403|forbidden|signature|challenge|javascript|requested format/.test(detail)) {
    return new UserVisibleError("YouTube ses akışına erişim sağlanamadı. YouTube erişim kısıtlarını ve uygulamanın yt-dlp/Deno araçlarının güncelliğini kontrol edin. Teknik ayrıntılar günlüğe kaydedildi.");
  }
  return new UserVisibleError(`YouTube ${operation === "info" ? "bilgisi alınamadı" : "sesi indirilemedi"}. Bu işlem internet gerektirir. Bağlantıyı kontrol edip yeniden deneyin; teknik ayrıntılar günlüğe kaydedildi.`);
}

interface AudioBuild {
  id: string;
  promise: Promise<string>;
  consumers: Set<string>;
  progress: Map<string, (line: string) => void>;
}
const audioBuilds = new Map<string, AudioBuild>();

async function cachedAudioFile(key: string, extension: "source" | "mp3", builder: (dir: string, id: string, onLine: (line: string) => void) => Promise<string>, jobId?: string, onLine?: (line: string) => void) {
  const target = path.join(audioCacheDir(), `${key}.${extension}`);
  if (fs.existsSync(target) && fs.statSync(target).size > 44) {
    const now = new Date();
    fs.utimesSync(target, now, now);
    return target;
  }
  const buildKey = `${key}.${extension}`;
  let build = audioBuilds.get(buildKey);
  if (!build) {
    const id = `cache-${randomUUID()}`;
    const dir = path.join(audioCacheDir(), `staging-${randomUUID()}`);
    fs.mkdirSync(dir, { recursive: true });
    build = { id, consumers: new Set(), progress: new Map(), promise: Promise.resolve("") };
    const current = build;
    current.promise = (async () => {
      try {
        const prepared = await builder(dir, id, (line) => current.progress.forEach((callback) => callback(line)));
        if (cancelledJobs.has(id)) throw new CancelledError("İşlem iptal edildi.");
        requireFile(prepared, "Hazırlanan ses dosyası", 44);
        if (await probeDuration(prepared) <= 0) throw new UserVisibleError("Hazırlanan ses dosyası okunamadı veya ses kanalı bulunamadı.");
        fs.renameSync(prepared, target);
        return target;
      } finally {
        audioBuilds.delete(buildKey);
        cancelledJobs.delete(id);
        if (isWithin(audioCacheDir(), dir)) fs.rmSync(dir, { recursive: true, force: true });
      }
    })();
    // A cancelled subscriber may leave a shared preparation running briefly.
    // Keep its rejection observed until all process handles have closed.
    void current.promise.catch(() => undefined);
    audioBuilds.set(buildKey, current);
  }
  const consumer = `${jobId || "preview"}-${randomUUID()}`;
  build.consumers.add(consumer);
  if (onLine) build.progress.set(consumer, onLine);
  let timer: NodeJS.Timeout | undefined;
  try {
    if (!jobId) return await build.promise;
    const cancelled = new Promise<never>((_resolve, reject) => {
      timer = setInterval(() => { if (cancelledJobs.has(jobId)) reject(new CancelledError("İşlem kullanıcı tarafından iptal edildi.")); }, 100);
    });
    return await Promise.race([build.promise, cancelled]);
  } finally {
    if (timer) clearInterval(timer);
    build.consumers.delete(consumer);
    build.progress.delete(consumer);
    if (build.consumers.size === 0 && cancelledJobs.has(jobId || "") && audioBuilds.get(buildKey) === build) await cancelJob(build.id);
  }
}

async function youtubeSource(value: string, jobId?: string) {
  const url = validateYouTubeUrl(value);
  return cachedAudioFile(cacheKey(url), "source", async (dir, id, onLine) => {
    try {
      const result = await runProcess(requireTool("yt-dlp", "yt-dlp.exe", "yt-dlp"), [
        ...youtubeArguments(), "-f", "bestaudio/best", "--newline", "--progress", "--no-simulate", "--print", "after_move:filepath",
        "-o", path.join(dir, "youtube.%(ext)s"), url
      ], { jobId: id, onLine });
      // after_move prints the actual final path, never a .part/fragment or an
      // unrelated file from a directory scan. The downloader writes only here.
      const downloaded = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => path.isAbsolute(line)).pop();
      if (!downloaded || !isWithin(dir, path.resolve(downloaded)) || /\.(?:part|ytdl|tmp)$/.test(downloaded)) throw new UserVisibleError("YouTube indirmesi tamamlandı ancak son ses dosyası bulunamadı.");
      return downloaded;
    } catch (error) { throw youtubeError(error, "download"); }
  }, jobId, (line) => {
    const match = line.match(/(\d{1,3}(?:\.\d+)?)%/);
    if (jobId && match) emitProgress(jobId, Math.min(15, 4 + Number(match[1]) * 0.11), "YouTube sesi indiriliyor (internet gerekir)");
  });
}

async function prepareInput(job: JobRecord) {
  if (job.sourceType === "file") return validateLocalMedia(job.sourcePath);
  if (job.sourceType !== "youtube") throw new UserVisibleError("Medya kaynağı geçersiz.");
  return youtubeSource(job.sourcePath, job.id);
}

async function prepareAudio(sourceType: "file" | "youtube", sourcePath: string) {
  if (sourceType !== "file" && sourceType !== "youtube") throw new UserVisibleError("Ses kaynağı geçersiz.");
  const input = sourceType === "youtube" ? await youtubeSource(sourcePath) : validateLocalMedia(sourcePath);
  const stat = fs.statSync(input);
  const key = sourceType === "youtube" ? cacheKey(validateYouTubeUrl(sourcePath)) : cacheKey(`${input}\0${stat.size}\0${stat.mtimeMs}`);
  const file = await cachedAudioFile(key, "mp3", async (dir, id) => {
    const output = path.join(dir, "preview.mp3");
    await runProcess(requireTool("ffmpeg", "ffmpeg.exe", "FFmpeg"), ["-y", "-hide_banner", "-loglevel", "error", "-nostdin", "-i", input, "-map", "0:a:0", "-vn", "-sn", "-dn", "-c:a", "libmp3lame", "-b:a", "192k", output], { jobId: id });
    return output;
  });
  pinnedCacheFiles.add(file);
  const existingToken = [...playbackTokens.entries()].find(([, cachedFile]) => cachedFile === file)?.[0];
  const token = existingToken || randomBytes(24).toString("hex");
  playbackTokens.set(token, file);
  return `app-media://audio/${token}`;
}

trustedHandle("settings:get", () => {
  const saved = readJson<Partial<AppSettings>>(settingsPath(), defaultSettings);
  const sanitized = sanitizeSettings(saved);
  if ((saved.defaultLanguage as string) === "Kürtçe") writeJson(settingsPath(), sanitized);
  return sanitized;
});
trustedHandle("settings:save", (_event, settings: AppSettings) => {
  const sanitized = sanitizeSettings(settings);
  writeJson(settingsPath(), sanitized);
  return sanitized;
});
trustedHandle("settings:reset", () => {
  writeJson(settingsPath(), defaultSettings);
  return defaultSettings;
});
trustedHandle("history:get", () => {
  const file = historyPath();
  if (!fs.existsSync(file)) return [];
  try {
    const saved: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(saved)) throw new Error("Geçmiş dosyası bir kayıt listesi değil.");
    return saved.map((record: JobRecord) => {
      // Older jobs can have their model text only in rawTranscript. Reuse that
      // exact stored text; never re-transcribe or apply today's settings to it.
      if (record?.status === "Tamamlandı" && !hasMeaningfulTranscript(record.transcript) && hasMeaningfulTranscript(record.rawTranscript || "")) {
        return { ...record, transcript: record.rawTranscript };
      }
      return record;
    });
  } catch (error) {
    // Let the renderer keep persistence disabled rather than overwrite a
    // recoverable history file with its initial empty queue.
    runtimeLog(`history:read:error:${String(error)}`);
    throw new UserVisibleError("Geçmiş okunamadı. Kayıt dosyanız korunuyor; teknik ayrıntılar günlüğe kaydedildi.");
  }
});
trustedHandle("history:save", (_event, jobs: JobRecord[]) => {
  if (!Array.isArray(jobs)) throw new UserVisibleError("Geçmiş kayıtları geçersiz.");
  writeJson(historyPath(), jobs);
  return true;
});

trustedHandle("files:inspect", (_event, paths: string[]) => inspectMediaFiles(paths));
trustedHandle("audio:prepare", async (_event, sourceType: "file" | "youtube", sourcePath: string) => {
  try { return await prepareAudio(sourceType, sourcePath); }
  catch (error) {
    runtimeLog(`audio:prepare:error:${error instanceof Error ? error.stack || error.message : String(error)}`);
    if (error instanceof UserVisibleError) throw error;
    throw new UserVisibleError("Ses önizlemesi hazırlanamadı. Dosyanın ses kanalını ve uygulama araçlarını kontrol edin.");
  }
});
trustedHandle("files:choose", async () => {
  const result = await dialog.showOpenDialog({
    title: "Ses veya video dosyası seç",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Ses ve video", extensions: ["mp3", "wav", "m4a", "mp4", "webm", "mpeg", "mpga", "mov", "avi", "mkv", "flac", "aac", "ogg", "opus", "wma", "wmv"] }
    ]
  });
  if (result.canceled) return [];
  const inspected = await inspectMediaFiles(result.filePaths);
  if (inspected.errors.length) {
    await dialog.showMessageBox(mainWindow!, { type: "warning", title: "Bazı dosyalar eklenemedi", message: inspected.errors.join("\n") });
  }
  return inspected.files;
});

trustedHandle("youtube:info", async (_event, url: string) => {
  const validatedUrl = validateYouTubeUrl(url);
  try {
    const result = await runProcess(requireTool("yt-dlp", "yt-dlp.exe", "yt-dlp"), [...youtubeArguments(), "--dump-single-json", "--skip-download", validatedUrl]);
    const data = JSON.parse(result.stdout);
    return {
      url: validatedUrl,
      title: data.title || "Video bilgisi",
      duration: formatDuration(Number(data.duration || 0)),
      durationSeconds: Number(data.duration || 0),
      channel: data.channel || data.uploader || "",
      thumbnail: data.thumbnail || ""
    };
  } catch (error) {
    throw youtubeError(error, "info");
  }
});

trustedHandle("transcribe:cancel", async (_event, jobId: string) => {
  validateJobId(jobId);
  await cancelJob(jobId);
  return true;
});

trustedHandle("transcribe:start", async (_event, job: JobRecord, settings: AppSettings) => {
  validateJobId(job?.id);
  if (runningJobs.has(job.id)) throw new UserVisibleError("Bu dönüştürme işlemi zaten çalışıyor.");
  if (typeof job.name !== "string" || typeof job.sourcePath !== "string") throw new UserVisibleError("Dönüştürme işi geçersiz.");
  settings = sanitizeSettings(settings);
  job = { ...job, language: sanitizeSettings({ defaultLanguage: job.language }).defaultLanguage, quality: sanitizeSettings({ defaultQuality: job.quality }).defaultQuality };
  cancelledJobs.delete(job.id);
  const startedAt = Date.now();
  const dir = workDir(job.id);
  runningJobs.add(job.id);
  try {
    const ffmpeg = requireTool("ffmpeg", "ffmpeg.exe", "FFmpeg");
    const whisper = requireTool("whisper", "whisper-cli.exe", "Whisper çalıştırıcısı");
    const model = requireModel();
    emitProgress(job.id, 4, "Dosya hazırlanıyor", startedAt);
    const input = await prepareInput(job);
    emitProgress(job.id, 16, "Ses hazırlanıyor", startedAt);
    const wav = path.join(dir, "input_16k.wav");
    const channelFilter = await stereoInputFilter(input, ffmpeg, job.id);
    await runProcess(ffmpeg, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
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
      `${channelFilter}aresample=async=1:first_pts=0,loudnorm=I=-18:LRA=11:TP=-1.5`,
      "-f",
      "wav",
      wav
    ], { jobId: job.id });
    requireFile(wav, "Hazırlanan ses dosyası", 44);
    const preparedSeconds = await probeDuration(wav);
    if (preparedSeconds <= 0) throw new UserVisibleError("Ses hazırlanamadı. Dosyada okunabilir bir ses kanalı bulunamadı.");

    emitProgress(job.id, 25, "Metne dönüştürülüyor", startedAt);
    const outBase = path.join(dir, "transcript");
    // Official Windows whisper-cli currently aborts (0xC0000409) when native
    // fopen receives some non-ASCII absolute paths. Pass only ASCII relative
    // filenames from a Unicode-safe cwd. A private directory junction avoids
    // copying the 1 GB model and also works when install/userData volumes differ.
    const modelDirectory = path.join(dir, "model");
    fs.symlinkSync(path.dirname(model), modelDirectory, process.platform === "win32" ? "junction" : "dir");
    const beam = requestedBeam(job.quality);
    const args = [
      "-m",
      path.join("model", path.basename(model)),
      "-f",
      path.basename(wav),
      "-of",
      "transcript",
      "-otxt",
      "-osrt",
      "-t",
      Math.max(2, Math.min(8, os.cpus().length - 1)).toString(),
      "-bs",
      beam.toString(),
      "-bo",
      beam.toString(),
      "--print-progress"
    ];
    const code = languageCode(job.language);
    // whisper.cpp defaults to English when -l is omitted. Explicit auto is
    // essential, and an initial prompt would bias automatic language detection.
    args.push("-l", code);
    const prompt = initialPrompt(job.language);
    if (prompt) args.push("--prompt", prompt, "--carry-initial-prompt");
    const whisperResult = await runProcess(whisper, args, {
      jobId: job.id,
      cwd: dir,
      onLine: (line) => {
        const match = line.match(/(?:progress\s*=\s*|\b)(\d{1,3})%/i);
        if (match) emitProgress(job.id, 25 + Math.min(100, Number(match[1])) * 0.66, "Metne dönüştürülüyor", startedAt);
      }
    });

    emitProgress(job.id, 94, "Çıktı oluşturuluyor", startedAt);
    const srt = `${outBase}.srt`;
    const txt = `${outBase}.txt`;
    const segments = fs.existsSync(srt) ? parseSrtSegments(fs.readFileSync(srt, "utf8")) : [];
    let rawTranscript = renderTranscript(segments, settings.timestamps);
    if (!rawTranscript && fs.existsSync(txt)) rawTranscript = fs.readFileSync(txt, "utf8").trim();
    const transcript = normalizeTranscript(rawTranscript, settings);
    if (!hasMeaningfulTranscript(transcript)) {
      throw new UserVisibleError("Konuşma algılanamadı veya Whisper boş çıktı üretti. Ses seviyesini ve seçilen dili kontrol edin.");
    }

    const detected = `${whisperResult.stderr}\n${whisperResult.stdout}`.match(/auto[- ]detected language\s*:\s*([a-z]{2,3})\b/i)?.[1];
    const completed: JobRecord = {
      ...job,
      status: "Tamamlandı",
      progress: 100,
      stage: "Tamamlandı",
      remaining: "Tamamlandı",
      rawTranscript,
      transcript,
      segments: segments.length ? segments : undefined,
      detectedLanguage: detected,
      completedAt: new Date().toISOString(),
      error: undefined,
      warning: undefined
    };
    try {
      const autoTxt = await exportTxt(completed);
      completed.outputFiles = { ...completed.outputFiles, txt: autoTxt };
    } catch (error) {
      // A Documents-folder permission or disk error must not discard a valid
      // model result. The user can still choose another manual export path.
      runtimeLog(`transcribe:auto-txt:error:${job.id}:${error instanceof Error ? error.stack || error.message : String(error)}`);
      completed.warning = "Metin hazır; otomatik TXT kopyası kaydedilemedi. Sonuç ekranından kayıt konumu seçebilirsiniz.";
    }
    emitProgress(job.id, 100, "Tamamlandı", startedAt);
    return completed;
  } catch (error) {
    runtimeLog(`transcribe:error:${job.id}:${error instanceof Error ? error.stack || error.message : String(error)}`);
    if (error instanceof CancelledError || cancelledJobs.has(job.id)) {
      return {
        ...job,
        status: "İptal Edildi",
        stage: "İptal edildi",
        progress: Math.min(job.progress || 0, 99),
        remaining: "-",
        transcript: "",
        rawTranscript: "",
        segments: undefined,
        detectedLanguage: undefined,
        warning: undefined,
        outputFiles: {},
        completedAt: new Date().toISOString(),
        error: undefined
      };
    }
    if (error instanceof UserVisibleError) throw error;
    const detail = error instanceof Error ? error.message.toLowerCase() : "";
    if (detail.includes("matches no streams") || detail.includes("does not contain any stream")) {
      throw new UserVisibleError("Dosyada kullanılabilir bir ses kanalı bulunamadı.");
    }
    if (detail.includes("invalid data") || detail.includes("could not find codec")) {
      throw new UserVisibleError("Medya dosyası bozuk veya desteklenmeyen bir biçimde.");
    }
    throw new UserVisibleError("Dönüştürme tamamlanamadı. Dosyayı ve uygulama araçlarını kontrol edip yeniden deneyin.");
  } finally {
    runningJobs.delete(job.id);
    activeProcesses.delete(job.id);
    cancelledJobs.delete(job.id);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      runtimeLog(`workdir:cleanup:error:${job.id}:${String(error)}`);
    }
  }
});

trustedHandle("export:file", async (_event, payload: { type: "pdf" | "docx" | "txt"; job: JobRecord }) => {
  if (!payload?.job || payload.job.status !== "Tamamlandı" || !hasMeaningfulTranscript(payload.job.transcript)) {
    throw new UserVisibleError("Dışa aktarmak için tamamlanmış ve geçerli bir transkript gerekli.");
  }
  if (!["pdf", "docx", "txt"].includes(payload.type)) throw new UserVisibleError("Dışa aktarma biçimi geçersiz.");
  const labels = { pdf: "PDF belgesi", docx: "Word belgesi", txt: "Metin belgesi" };
  try {
    const options = {
      title: `${labels[payload.type]} kaydet`,
      defaultPath: path.join(app.getPath("documents"), `${safeName(path.parse(payload.job.name).name)}.${payload.type}`),
      buttonLabel: "Kaydet",
      filters: [{ name: labels[payload.type], extensions: [payload.type] }],
      properties: ["dontAddToRecent"] as ("dontAddToRecent")[]
    };
    const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { canceled: true };
    const destination = result.filePath;
    if (payload.type === "pdf") return { path: await exportPdf(payload.job, destination) };
    if (payload.type === "docx") return { path: await exportDocx(payload.job, destination) };
    return { path: await exportTxt(payload.job, destination) };
  } catch (error) {
    runtimeLog(`export:${payload.type}:error:${error instanceof Error ? error.stack || error.message : String(error)}`);
    if (error instanceof UserVisibleError) throw error;
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "EACCES" || code === "EPERM") throw new UserVisibleError("Dosya kaydedilemedi. Seçtiğiniz klasörün yazma iznini ve aynı adlı dosyanın başka bir programda açık olup olmadığını kontrol edin.");
    if (code === "ENOSPC") throw new UserVisibleError("Dosya kaydedilemedi. Diskte yeterli boş alan bulunmuyor.");
    throw new UserVisibleError("Dosya kaydedilemedi. Kayıt konumunu kontrol edin; teknik ayrıntılar uygulama günlüğüne yazıldı.");
  }
});

trustedHandle("shell:reveal", async (_event, filePath: string) => {
  if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
  else shell.openPath(outputDir());
  return true;
});

trustedHandle("sound:play", () => true);

function outputBase(job: JobRecord, extension: string) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "");
  const base = path.join(outputDir(), `${safeName(path.parse(job.name).name)}_${stamp}`);
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

async function writeExport(file: string, label: string, write: (temporary: string) => Promise<void>) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  try {
    await write(temporary);
    assertOutputFile(temporary, label);
    fs.renameSync(temporary, file);
    return assertOutputFile(file, label);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

async function exportTxt(job: JobRecord, destination?: string) {
  return writeExport(destination || outputBase(job, "txt"), "TXT", async (temporary) => {
    fs.writeFileSync(temporary, renderPlainTranscript(job), { encoding: "utf8", flag: "wx" });
  });
}

async function exportDocx(job: JobRecord, destination?: string) {
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
  const transcriptParagraphs = (job.transcript || "Metin bulunamadı.")
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
  return writeExport(destination || outputBase(job, "docx"), "DOCX", async (temporary) => {
    fs.writeFileSync(temporary, buffer, { flag: "wx" });
  });
}

async function exportPdf(job: JobRecord, destination?: string) {
  const PDFDocument = (await import("pdfkit")).default;
  const fonts = path.join(process.env.WINDIR || process.env.SystemRoot || "C:\\Windows", "Fonts");
  const font = ["arial.ttf", "segoeui.ttf", "tahoma.ttf"].map((name) => path.join(fonts, name)).find((candidate) => fs.existsSync(candidate));
  if (!font) throw new UserVisibleError("PDF için Türkçe karakter destekli Windows yazı tipi bulunamadı.");
  return writeExport(destination || outputBase(job, "pdf"), "PDF", async (temporary) => {
    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 48 });
      const stream = fs.createWriteStream(temporary, { flags: "wx" });
      // Attach listeners before writing. Both a stream failure and a PDF/font
      // failure must reject the IPC call rather than leave a partial file.
      stream.once("finish", resolve);
      stream.once("error", reject);
      doc.once("error", (error) => stream.destroy(error));
      doc.pipe(stream);
      try {
        doc.registerFont("AppText", font).font("AppText");
        doc.fontSize(20).fillColor("#111827").text("My Sesi Metne Dönüştürme");
        doc.moveDown(0.2).fontSize(15).fillColor("#4f46e5").text("Transkript Raporu");
        doc.moveDown().fontSize(10).fillColor("#334155");
        doc.text(`Dosya adı: ${job.name}`);
        doc.text(`Tarih: ${new Date().toLocaleString("tr-TR")}`);
        doc.text(`Süre: ${job.duration}`);
        doc.text(`Dil: ${job.language}`);
        doc.text(`Kalite: ${job.quality}`);
        doc.moveDown().fontSize(11).fillColor("#111827");
        for (const line of (job.transcript || "Metin bulunamadı.").split(/\r?\n/)) {
          // PDFKit wraps and paginates within the A4 margins. A manual y-based
          // page break would add blank pages and can move text past the footer.
          doc.fillColor(/^\[.+?\]/.test(line) ? "#1f3fbf" : "#111827").text(line || " ", {
            width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
            lineGap: 4, paragraphGap: 3, features: []
          });
        }
        doc.moveDown().fontSize(9).fillColor("#64748b").text("© 2026 Mustafa Yılmaz. Tüm hakları saklıdır.");
        doc.end();
      } catch (error) {
        doc.unpipe(stream);
        stream.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
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
