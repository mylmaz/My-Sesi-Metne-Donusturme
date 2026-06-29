import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

type Quality = "Hızlı" | "Dengeli" | "Yüksek Doğruluk";
type Language = "Otomatik" | "Türkçe" | "Kürtçe" | "İngilizce";
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
  thumbnail?: string;
  channel?: string;
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
  const quantizedLarge = resolveResource("Tools", "models", "ggml-large-v2-q5_k.bin");
  if (fs.existsSync(quantizedLarge)) return quantizedLarge;
  const quantizedLargeFallback = resolveResource("Tools", "models", "ggml-large-v2-q5_0.bin");
  if (fs.existsSync(quantizedLargeFallback)) return quantizedLargeFallback;
  return resolveResource("Tools", "models", "ggml-large-v2.bin");
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

function sanitizeSettings(settings: Partial<AppSettings> | undefined): AppSettings {
  return {
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
  if (quality === "Hızlı") return 4;
  if (quality === "Dengeli") return 6;
  return 8;
}

function initialPrompt(language: Language) {
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
  result = result.replace(/([,.!?;:])(?=\S)/g, "$1 ");
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

function parseSrt(content: string, timestamps: boolean) {
  const blocks = content.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  const lines: string[] = [];
  for (const block of blocks) {
    const parts = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const time = parts.find((line) => line.includes("-->"));
    if (!time) continue;
    const text = parts.filter((line) => !/^\d+$/.test(line) && !line.includes("-->")).join(" ").trim();
    if (!text) continue;
    const start = time.split("-->")[0].trim().replace(",", ".").split(".")[0];
    lines.push(`${timestamps ? `[${start}] ` : ""}${text}`);
  }
  return cleanTranscript(lines.join("\n"));
}

function normalizeTranscript(text: string, settings: AppSettings) {
  if (settings.autoCorrect === false) return (text || "").trim();
  return cleanTranscript(text);
}

function emitProgress(id: string, progress: number, stage: string, startedAt?: number) {
  const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  let remaining = "Hesaplanıyor…";
  if (progress > 5 && startedAt) {
    const total = elapsed / (progress / 100);
    remaining = formatDuration(Math.max(3, total - elapsed));
  }
  mainWindow?.webContents.send("transcribe:progress", { id, progress, stage, remaining });
}

async function prepareInput(job: JobRecord, dir: string) {
  if (job.sourceType === "file") {
    if (!job.sourcePath || !fs.existsSync(job.sourcePath)) throw new UserVisibleError("Seçilen medya dosyası bulunamadı.");
    if (fs.statSync(job.sourcePath).size === 0) throw new UserVisibleError("Seçilen medya dosyası boş.");
    if (!supportedMediaExtensions.has(path.extname(job.sourcePath).toLowerCase())) throw new UserVisibleError("Bu dosya biçimi desteklenmiyor.");
    return job.sourcePath;
  }
  const url = validateYouTubeUrl(job.sourcePath);
  const outputTemplate = path.join(dir, "youtube.%(ext)s");
  await runProcess(requireTool("yt-dlp", "yt-dlp.exe", "yt-dlp"), [
    "-f",
    "bestaudio/best",
    "--no-playlist",
    "--newline",
    "-o",
    outputTemplate,
    url
  ], {
    jobId: job.id,
    onLine: (line) => {
      const match = line.match(/(\d{1,3}(?:\.\d+)?)%/);
      if (match) emitProgress(job.id, Math.min(15, 4 + Number(match[1]) * 0.11), "YouTube sesi indiriliyor");
    }
  });
  const downloaded = fs.readdirSync(dir).find((name) => name.startsWith("youtube."));
  if (!downloaded) throw new UserVisibleError("YouTube sesi indirilemedi.");
  return path.join(dir, downloaded);
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
ipcMain.handle("history:get", () => readJson<JobRecord[]>(historyPath(), []));
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
  return Promise.all(result.filePaths.map(async (file) => {
    const stat = fs.statSync(file);
    const seconds = await probeDuration(file);
    return {
      path: file,
      name: path.basename(file),
      format: path.extname(file).replace(".", "").toUpperCase(),
      sizeText: formatBytes(stat.size),
      duration: formatDuration(seconds),
      durationSeconds: seconds
    };
  }));
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

ipcMain.handle("transcribe:cancel", async (_event, jobId: string) => {
  if (!jobId || typeof jobId !== "string") throw new UserVisibleError("İptal edilecek işlem bulunamadı.");
  await cancelJob(jobId);
  return true;
});

ipcMain.handle("transcribe:start", async (_event, job: JobRecord, settings: AppSettings) => {
  if (!job?.id) throw new UserVisibleError("Dönüştürme işi geçersiz.");
  cancelledJobs.delete(job.id);
  const startedAt = Date.now();
  const dir = workDir(job.id);
  try {
    const ffmpeg = requireTool("ffmpeg", "ffmpeg.exe", "FFmpeg");
    const whisper = requireTool("whisper", "whisper-cli.exe", "Whisper çalıştırıcısı");
    const model = requireModel();
    emitProgress(job.id, 4, "Dosya hazırlanıyor", startedAt);
    const input = await prepareInput(job, dir);
    emitProgress(job.id, 16, "Ses hazırlanıyor", startedAt);
    const wav = path.join(dir, "input_16k.wav");
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
      "aresample=async=1:first_pts=0,loudnorm=I=-18:LRA=11:TP=-1.5",
      "-f",
      "wav",
      wav
    ], { jobId: job.id });
    requireFile(wav, "Hazırlanan ses dosyası", 44);
    const preparedSeconds = await probeDuration(wav);
    if (preparedSeconds <= 0) throw new UserVisibleError("Ses hazırlanamadı. Dosyada okunabilir bir ses kanalı bulunamadı.");

    emitProgress(job.id, 25, "Metne dönüştürülüyor", startedAt);
    const outBase = path.join(dir, "transcript");
    const beam = requestedBeam(job.quality);
    const args = [
      "-m",
      model,
      "-f",
      wav,
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
      "--prompt",
      initialPrompt(job.language),
      "--carry-initial-prompt"
    ];
    const code = languageCode(job.language);
    if (code !== "auto") args.push("-l", code);
    await runProcess(whisper, args, {
      jobId: job.id,
      onLine: (line) => {
        const match = line.match(/(?:progress\s*=\s*|\b)(\d{1,3})%/i);
        if (match) emitProgress(job.id, 25 + Math.min(100, Number(match[1])) * 0.66, "Metne dönüştürülüyor", startedAt);
      }
    });

    emitProgress(job.id, 94, "Çıktı oluşturuluyor", startedAt);
    const srt = `${outBase}.srt`;
    const txt = `${outBase}.txt`;
    let transcript = "";
    if (fs.existsSync(srt)) transcript = parseSrt(fs.readFileSync(srt, "utf8"), settings.timestamps);
    if (!transcript && fs.existsSync(txt)) transcript = normalizeTranscript(fs.readFileSync(txt, "utf8"), settings);
    transcript = normalizeTranscript(transcript, settings);
    if (!hasMeaningfulTranscript(transcript)) {
      throw new UserVisibleError("Konuşma algılanamadı veya Whisper boş çıktı üretti. Ses seviyesini ve seçilen dili kontrol edin.");
    }

    const completed: JobRecord = {
      ...job,
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
    emitProgress(job.id, 100, "Tamamlandı", startedAt);
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
    const detail = error instanceof Error ? error.message.toLowerCase() : "";
    if (detail.includes("matches no streams") || detail.includes("does not contain any stream")) {
      throw new UserVisibleError("Dosyada kullanılabilir bir ses kanalı bulunamadı.");
    }
    if (detail.includes("invalid data") || detail.includes("could not find codec")) {
      throw new UserVisibleError("Medya dosyası bozuk veya desteklenmeyen bir biçimde.");
    }
    runtimeLog(`transcribe:error:${job.id}:${error instanceof Error ? error.stack || error.message : String(error)}`);
    throw new UserVisibleError("Dönüştürme tamamlanamadı. Dosyayı ve uygulama araçlarını kontrol edip yeniden deneyin.");
  } finally {
    activeProcesses.delete(job.id);
    cancelledJobs.delete(job.id);
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
  if (payload.type === "pdf") return { path: await exportPdf(payload.job) };
  if (payload.type === "docx") return { path: await exportDocx(payload.job) };
  return { path: await exportTxt(payload.job) };
});

ipcMain.handle("shell:reveal", async (_event, filePath: string) => {
  if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
  else shell.openPath(outputDir());
  return true;
});

ipcMain.handle("sound:play", () => true);

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

async function exportTxt(job: JobRecord) {
  const file = outputBase(job, "txt");
  fs.writeFileSync(file, renderPlainTranscript(job), "utf8");
  return assertOutputFile(file, "TXT");
}

async function exportDocx(job: JobRecord) {
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
  const file = outputBase(job, "docx");
  fs.writeFileSync(file, buffer);
  return assertOutputFile(file, "DOCX");
}

async function exportPdf(job: JobRecord) {
  const PDFDocument = (await import("pdfkit")).default;
  const file = outputBase(job, "pdf");
  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
  const stream = fs.createWriteStream(file);
  const font = ["C:\\Windows\\Fonts\\arial.ttf", "C:\\Windows\\Fonts\\segoeui.ttf", "C:\\Windows\\Fonts\\tahoma.ttf"].find((candidate) => fs.existsSync(candidate));
  if (!font) throw new UserVisibleError("PDF için Türkçe karakter destekli Windows yazı tipi bulunamadı.");
  doc.registerFont("AppText", font);
  doc.font("AppText");
  doc.pipe(stream);
  doc.fontSize(20).fillColor("#111827").text("My Sesi Metne Dönüştürme");
  doc.moveDown(0.2).fontSize(15).fillColor("#4f46e5").text("Transkript Raporu");
  doc.moveDown();
  doc.fontSize(10).fillColor("#334155");
  doc.text(`Dosya adı: ${job.name}`);
  doc.text(`Tarih: ${new Date().toLocaleString("tr-TR")}`);
  doc.text(`Süre: ${job.duration}`);
  doc.text(`Dil: ${job.language}`);
  doc.text(`Kalite: ${job.quality}`);
  doc.moveDown();
  doc.fontSize(11).fillColor("#111827");
  for (const line of (job.transcript || "Metin bulunamadı.").split(/\r?\n/)) {
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
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
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
