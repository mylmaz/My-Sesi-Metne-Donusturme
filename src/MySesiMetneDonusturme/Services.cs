using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Xml.Serialization;

namespace MySesiMetneDonusturme
{
    public static class AppPaths
    {
        public static readonly string AppName = "MySesiMetneDonusturme";

        public static string DataRoot
        {
            get
            {
                string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), AppName);
                EnsureDirectory(root);
                return root;
            }
        }

        public static string LogRoot
        {
            get
            {
                string root = Path.Combine(DataRoot, "logs");
                EnsureDirectory(root);
                return root;
            }
        }

        public static string WorkRoot
        {
            get
            {
                string root = Path.Combine(DataRoot, "work");
                EnsureDirectory(root);
                return root;
            }
        }

        public static string ToolsRoot
        {
            get
            {
                string root = Path.Combine(DataRoot, "Tools");
                EnsureDirectory(root);
                return root;
            }
        }

        public static string DefaultOutputRoot
        {
            get
            {
                string docs = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
                string root = Path.Combine(docs, "My Sesi Metne Donusturme Ciktilar");
                EnsureDirectory(root);
                return root;
            }
        }

        public static string SettingsFile
        {
            get { return Path.Combine(DataRoot, "settings.xml"); }
        }

        public static string HistoryFile
        {
            get { return Path.Combine(DataRoot, "history.xml"); }
        }

        public static void EnsureDirectory(string path)
        {
            if (!Directory.Exists(path))
            {
                Directory.CreateDirectory(path);
            }
        }
    }

    public static class Logger
    {
        private static readonly object SyncRoot = new object();

        public static void Info(string message)
        {
            Write("INFO", message, null);
        }

        public static void Error(string message, Exception exception)
        {
            Write("ERROR", message, exception);
        }

        private static void Write(string level, string message, Exception exception)
        {
            try
            {
                lock (SyncRoot)
                {
                    string file = Path.Combine(AppPaths.LogRoot, "app-" + DateTime.Now.ToString("yyyyMMdd", CultureInfo.InvariantCulture) + ".log");
                    StringBuilder line = new StringBuilder();
                    line.Append(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture));
                    line.Append(" [").Append(level).Append("] ").Append(message);
                    if (exception != null)
                    {
                        line.Append(Environment.NewLine).Append(exception.ToString());
                    }
                    File.AppendAllText(file, line.ToString() + Environment.NewLine, Encoding.UTF8);
                }
            }
            catch
            {
            }
        }
    }

    public class SettingsService
    {
        public AppSettings Load()
        {
            try
            {
                if (File.Exists(AppPaths.SettingsFile))
                {
                    using (FileStream stream = File.OpenRead(AppPaths.SettingsFile))
                    {
                        XmlSerializer serializer = new XmlSerializer(typeof(AppSettings));
                        AppSettings settings = serializer.Deserialize(stream) as AppSettings;
                        if (settings != null)
                        {
                            FillDefaults(settings);
                            return settings;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error("Ayarlar okunamadi", ex);
            }

            AppSettings defaults = CreateDefaults();
            Save(defaults);
            return defaults;
        }

        public void Save(AppSettings settings)
        {
            try
            {
                FillDefaults(settings);
                AppPaths.EnsureDirectory(Path.GetDirectoryName(AppPaths.SettingsFile));
                using (FileStream stream = File.Create(AppPaths.SettingsFile))
                {
                    XmlSerializer serializer = new XmlSerializer(typeof(AppSettings));
                    serializer.Serialize(stream, settings);
                }
            }
            catch (Exception ex)
            {
                Logger.Error("Ayarlar kaydedilemedi", ex);
            }
        }

        private static AppSettings CreateDefaults()
        {
            AppSettings settings = new AppSettings();
            settings.OutputFolder = AppPaths.DefaultOutputRoot;
            settings.DefaultLanguage = "Türkçe";
            settings.DefaultModel = "Dengeli";
            settings.DarkTheme = true;
            settings.AutoSave = true;
            settings.TimestampsEnabled = true;
            settings.ParagraphMode = true;
            settings.RemoveFillers = false;
            settings.ImprovePunctuation = true;
            settings.SplitLongFiles = true;
            settings.ReduceSilence = false;
            settings.FirstRunCompleted = false;
            return settings;
        }

        private static void FillDefaults(AppSettings settings)
        {
            if (settings == null) return;
            if (String.IsNullOrWhiteSpace(settings.OutputFolder)) settings.OutputFolder = AppPaths.DefaultOutputRoot;
            if (String.IsNullOrWhiteSpace(settings.DefaultLanguage)) settings.DefaultLanguage = "Türkçe";
            if (String.IsNullOrWhiteSpace(settings.DefaultModel)) settings.DefaultModel = "Dengeli";
        }
    }

    public class HistoryService
    {
        public List<HistoryItem> Load()
        {
            try
            {
                if (File.Exists(AppPaths.HistoryFile))
                {
                    using (FileStream stream = File.OpenRead(AppPaths.HistoryFile))
                    {
                        XmlSerializer serializer = new XmlSerializer(typeof(HistoryStore));
                        HistoryStore store = serializer.Deserialize(stream) as HistoryStore;
                        if (store != null && store.Items != null)
                        {
                            return store.Items;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error("Gecmis okunamadi", ex);
            }
            return new List<HistoryItem>();
        }

        public void AddOrUpdate(HistoryItem item)
        {
            List<HistoryItem> items = Load();
            HistoryItem existing = items.FirstOrDefault(delegate(HistoryItem h) { return h.Id == item.Id; });
            if (existing != null)
            {
                items.Remove(existing);
            }
            items.Insert(0, item);
            Save(items);
        }

        public void Clear()
        {
            Save(new List<HistoryItem>());
        }

        private void Save(List<HistoryItem> items)
        {
            try
            {
                HistoryStore store = new HistoryStore();
                store.Items = items;
                AppPaths.EnsureDirectory(Path.GetDirectoryName(AppPaths.HistoryFile));
                using (FileStream stream = File.Create(AppPaths.HistoryFile))
                {
                    XmlSerializer serializer = new XmlSerializer(typeof(HistoryStore));
                    serializer.Serialize(stream, store);
                }
            }
            catch (Exception ex)
            {
                Logger.Error("Gecmis kaydedilemedi", ex);
            }
        }
    }

    public class ProcessRunner
    {
        public Task<ProcessResult> RunAsync(string fileName, string arguments, CancellationToken token)
        {
            return Task.Factory.StartNew(delegate
            {
                StringBuilder output = new StringBuilder();
                StringBuilder error = new StringBuilder();

                using (Process process = new Process())
                {
                    process.StartInfo.FileName = fileName;
                    process.StartInfo.Arguments = arguments;
                    process.StartInfo.UseShellExecute = false;
                    process.StartInfo.RedirectStandardOutput = true;
                    process.StartInfo.RedirectStandardError = true;
                    process.StartInfo.CreateNoWindow = true;
                    process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
                    {
                        if (e.Data != null) output.AppendLine(e.Data);
                    };
                    process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
                    {
                        if (e.Data != null) error.AppendLine(e.Data);
                    };

                    Logger.Info("Komut calisiyor: " + fileName + " " + arguments);
                    process.Start();
                    process.BeginOutputReadLine();
                    process.BeginErrorReadLine();

                    while (!process.WaitForExit(200))
                    {
                        if (token.IsCancellationRequested)
                        {
                            try
                            {
                                process.Kill();
                            }
                            catch
                            {
                            }
                            token.ThrowIfCancellationRequested();
                        }
                    }
                    process.WaitForExit();

                    ProcessResult result = new ProcessResult();
                    result.ExitCode = process.ExitCode;
                    result.Output = output.ToString();
                    result.Error = error.ToString();
                    return result;
                }
            }, token);
        }

        public static string Quote(string value)
        {
            if (String.IsNullOrEmpty(value)) return "\"\"";
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }
    }

    public class DependencyService
    {
        public List<DependencyItem> CheckAll()
        {
            List<DependencyItem> items = new List<DependencyItem>();
            Add(items, "FFmpeg", FindTool("ffmpeg", new string[] { "ffmpeg.exe" }), "Tools\\ffmpeg\\ffmpeg.exe");
            Add(items, "FFprobe", FindTool("ffmpeg", new string[] { "ffprobe.exe" }), "Tools\\ffmpeg\\ffprobe.exe");
            Add(items, "Whisper", FindTool("whisper", new string[] { "whisper-cli.exe", "main.exe" }), "Tools\\whisper\\whisper-cli.exe");
            Add(items, "Whisper model", FindModel("Dengeli"), "Tools\\models\\ggml-base.bin");
            Add(items, "yt-dlp", FindTool("yt-dlp", new string[] { "yt-dlp.exe" }), "Tools\\yt-dlp\\yt-dlp.exe");
            return items;
        }

        public string FindFfmpeg()
        {
            return FindTool("ffmpeg", new string[] { "ffmpeg.exe" });
        }

        public string FindFfprobe()
        {
            return FindTool("ffmpeg", new string[] { "ffprobe.exe" });
        }

        public string FindWhisper()
        {
            return FindTool("whisper", new string[] { "whisper-cli.exe", "main.exe" });
        }

        public string FindYtDlp()
        {
            return FindTool("yt-dlp", new string[] { "yt-dlp.exe" });
        }

        public string FindModel(string modelChoice)
        {
            string name = "ggml-base.bin";
            if (String.Equals(modelChoice, "Hızlı", StringComparison.OrdinalIgnoreCase)) name = "ggml-tiny.bin";
            if (String.Equals(modelChoice, "Yüksek Doğruluk", StringComparison.OrdinalIgnoreCase)) name = "ggml-small.bin";

            foreach (string root in GetToolRoots())
            {
                string models = Path.Combine(root, "Tools", "models");
                string exact = Path.Combine(models, name);
                if (File.Exists(exact)) return exact;
                if (Directory.Exists(models))
                {
                    string first = Directory.GetFiles(models, "*.bin").FirstOrDefault();
                    if (!String.IsNullOrEmpty(first)) return first;
                }
            }
            return null;
        }

        public async Task<string> GetDurationAsync(string filePath)
        {
            string ffprobe = FindFfprobe();
            if (String.IsNullOrEmpty(ffprobe) || !File.Exists(filePath)) return "Bilinmiyor";

            try
            {
                ProcessRunner runner = new ProcessRunner();
                string args = "-v error -show_entries format=duration -of default=nokey=1:noprint_wrappers=1 " + ProcessRunner.Quote(filePath);
                ProcessResult result = await runner.RunAsync(ffprobe, args, CancellationToken.None);
                if (result.ExitCode == 0)
                {
                    double seconds;
                    string text = (result.Output ?? "").Trim();
                    if (Double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out seconds))
                    {
                        TimeSpan span = TimeSpan.FromSeconds(seconds);
                        if (span.TotalHours >= 1) return span.ToString(@"hh\:mm\:ss", CultureInfo.InvariantCulture);
                        return span.ToString(@"mm\:ss", CultureInfo.InvariantCulture);
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error("Sure bilgisi alinamadi", ex);
            }
            return "Bilinmiyor";
        }

        private static void Add(List<DependencyItem> items, string name, string path, string hint)
        {
            DependencyItem item = new DependencyItem();
            item.Name = name;
            item.Path = path ?? "";
            item.Found = !String.IsNullOrEmpty(path);
            item.Hint = hint;
            items.Add(item);
        }

        private static string FindTool(string folder, string[] names)
        {
            foreach (string root in GetToolRoots())
            {
                foreach (string name in names)
                {
                    string candidate = Path.Combine(root, "Tools", folder, name);
                    if (File.Exists(candidate)) return candidate;
                }
            }

            string path = Environment.GetEnvironmentVariable("PATH") ?? "";
            string[] pathParts = path.Split(new char[] { Path.PathSeparator }, StringSplitOptions.RemoveEmptyEntries);
            foreach (string part in pathParts)
            {
                foreach (string name in names)
                {
                    try
                    {
                        string candidate = Path.Combine(part.Trim(), name);
                        if (File.Exists(candidate)) return candidate;
                    }
                    catch
                    {
                    }
                }
            }
            return null;
        }

        private static IEnumerable<string> GetToolRoots()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            yield return baseDir;
            yield return AppPaths.DataRoot;
            yield return Path.GetFullPath(Path.Combine(baseDir, ".."));
            yield return Path.GetFullPath(Path.Combine(baseDir, "..", ".."));
            yield return Directory.GetCurrentDirectory();
        }
    }

    public class ToolInstallerService
    {
        private const string YtDlpUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
        private const string WhisperZipUrl = "https://github.com/ggml-org/whisper.cpp/releases/latest/download/whisper-bin-x64.zip";
        private const string FfmpegZipUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";
        private const string BaseModelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";

        private readonly DependencyService _dependencies;

        public ToolInstallerService(DependencyService dependencies)
        {
            _dependencies = dependencies;
        }

        public bool HasTranscriptionTools()
        {
            return !String.IsNullOrEmpty(_dependencies.FindFfmpeg()) &&
                   !String.IsNullOrEmpty(_dependencies.FindWhisper()) &&
                   !String.IsNullOrEmpty(_dependencies.FindModel("Dengeli"));
        }

        public bool HasYouTubeTools()
        {
            return !String.IsNullOrEmpty(_dependencies.FindYtDlp()) &&
                   !String.IsNullOrEmpty(_dependencies.FindFfmpeg());
        }

        public async Task EnsureAllAsync(IProgress<string> progress, CancellationToken token)
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            await Task.Factory.StartNew(delegate
            {
                string tools = AppPaths.ToolsRoot;
                string download = Path.Combine(AppPaths.WorkRoot, "downloads");
                AppPaths.EnsureDirectory(download);

                EnsureYtDlp(tools, progress, token);
                EnsureFfmpeg(tools, download, progress, token);
                EnsureWhisper(tools, download, progress, token);
                EnsureBaseModel(tools, progress, token);

                Report(progress, "Araçlar hazır.");
            }, token);
        }

        public async Task EnsureYouTubeAsync(IProgress<string> progress, CancellationToken token)
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            await Task.Factory.StartNew(delegate
            {
                string tools = AppPaths.ToolsRoot;
                string download = Path.Combine(AppPaths.WorkRoot, "downloads");
                AppPaths.EnsureDirectory(download);
                EnsureYtDlp(tools, progress, token);
                EnsureFfmpeg(tools, download, progress, token);
                Report(progress, "YouTube araçları hazır.");
            }, token);
        }

        public async Task EnsureTranscriptionAsync(IProgress<string> progress, CancellationToken token)
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            await Task.Factory.StartNew(delegate
            {
                string tools = AppPaths.ToolsRoot;
                string download = Path.Combine(AppPaths.WorkRoot, "downloads");
                AppPaths.EnsureDirectory(download);
                EnsureFfmpeg(tools, download, progress, token);
                EnsureWhisper(tools, download, progress, token);
                EnsureBaseModel(tools, progress, token);
                Report(progress, "Transkripsiyon araçları hazır.");
            }, token);
        }

        private void EnsureYtDlp(string tools, IProgress<string> progress, CancellationToken token)
        {
            if (!String.IsNullOrEmpty(_dependencies.FindYtDlp())) return;
            Report(progress, "YouTube bileşeni indiriliyor...");
            DownloadFile(YtDlpUrl, Path.Combine(tools, "yt-dlp", "yt-dlp.exe"), token);
        }

        private void EnsureFfmpeg(string tools, string download, IProgress<string> progress, CancellationToken token)
        {
            if (!String.IsNullOrEmpty(_dependencies.FindFfmpeg()) && !String.IsNullOrEmpty(_dependencies.FindFfprobe())) return;
            Report(progress, "FFmpeg indiriliyor...");
            string zip = Path.Combine(download, "ffmpeg.zip");
            DownloadFile(FfmpegZipUrl, zip, token);
            ExtractFfmpeg(zip, Path.Combine(tools, "ffmpeg"));
        }

        private void EnsureWhisper(string tools, string download, IProgress<string> progress, CancellationToken token)
        {
            if (!String.IsNullOrEmpty(_dependencies.FindWhisper())) return;
            Report(progress, "Whisper motoru indiriliyor...");
            string zip = Path.Combine(download, "whisper.zip");
            DownloadFile(WhisperZipUrl, zip, token);
            ExtractWhisper(zip, Path.Combine(tools, "whisper"));
        }

        private void EnsureBaseModel(string tools, IProgress<string> progress, CancellationToken token)
        {
            if (!String.IsNullOrEmpty(_dependencies.FindModel("Dengeli"))) return;
            Report(progress, "Whisper modeli indiriliyor...");
            DownloadFile(BaseModelUrl, Path.Combine(tools, "models", "ggml-base.bin"), token);
        }

        private static void DownloadFile(string url, string destination, CancellationToken token)
        {
            token.ThrowIfCancellationRequested();
            string folder = Path.GetDirectoryName(destination);
            if (!Directory.Exists(folder)) Directory.CreateDirectory(folder);

            string temp = destination + ".download";
            if (File.Exists(temp)) File.Delete(temp);
            using (WebClient client = new WebClient())
            {
                client.Headers.Add("User-Agent", "MySesiMetneDonusturme/1.0.0");
                client.DownloadFile(url, temp);
            }
            token.ThrowIfCancellationRequested();
            if (File.Exists(destination)) File.Delete(destination);
            File.Move(temp, destination);
        }

        private static void ExtractWhisper(string zipPath, string destination)
        {
            AppPaths.EnsureDirectory(destination);
            using (ZipArchive archive = ZipFile.OpenRead(zipPath))
            {
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    if (String.IsNullOrEmpty(entry.Name)) continue;
                    if (!entry.Name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) &&
                        !entry.Name.EndsWith(".dll", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    string outPath = Path.Combine(destination, entry.Name);
                    if (File.Exists(outPath)) File.Delete(outPath);
                    entry.ExtractToFile(outPath);
                }
            }
        }

        private static void ExtractFfmpeg(string zipPath, string destination)
        {
            AppPaths.EnsureDirectory(destination);
            using (ZipArchive archive = ZipFile.OpenRead(zipPath))
            {
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    string name = entry.Name.ToLowerInvariant();
                    if (name != "ffmpeg.exe" && name != "ffprobe.exe") continue;

                    string outPath = Path.Combine(destination, entry.Name);
                    if (File.Exists(outPath)) File.Delete(outPath);
                    entry.ExtractToFile(outPath);
                }
            }
        }

        private static void Report(IProgress<string> progress, string message)
        {
            if (progress != null) progress.Report(message);
            Logger.Info(message);
        }
    }

    public class YouTubeService
    {
        private readonly DependencyService _dependencies;
        private readonly ProcessRunner _runner;

        public YouTubeService(DependencyService dependencies, ProcessRunner runner)
        {
            _dependencies = dependencies;
            _runner = runner;
        }

        public async Task<YouTubeMetadata> GetMetadataAsync(string url, CancellationToken token)
        {
            string ytdlp = _dependencies.FindYtDlp();
            if (String.IsNullOrEmpty(ytdlp))
            {
                throw new UserVisibleException("YouTube bilgisi almak için yt-dlp bulunamadı. Tools\\yt-dlp\\yt-dlp.exe dosyasını ekleyin.");
            }

            ProcessResult result = await _runner.RunAsync(ytdlp, "--dump-json --no-playlist " + ProcessRunner.Quote(url), token);
            if (result.ExitCode != 0)
            {
                Logger.Error("yt-dlp metadata hatasi", new Exception(result.Error));
                throw new UserVisibleException("Video bilgisi alınamadı. Link özel, silinmiş, hatalı ya da internet bağlantısı yok olabilir.");
            }

            JavaScriptSerializer serializer = new JavaScriptSerializer();
            Dictionary<string, object> data = serializer.Deserialize<Dictionary<string, object>>(result.Output);
            YouTubeMetadata metadata = new YouTubeMetadata();
            metadata.RawUrl = url;
            metadata.Title = GetString(data, "title", "YouTube videosu");
            metadata.ThumbnailUrl = GetString(data, "thumbnail", "");
            object durationObj;
            if (data.TryGetValue("duration", out durationObj))
            {
                double seconds;
                if (Double.TryParse(Convert.ToString(durationObj, CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out seconds))
                {
                    metadata.Duration = TimeSpan.FromSeconds(seconds).ToString(@"hh\:mm\:ss", CultureInfo.InvariantCulture);
                }
            }
            if (String.IsNullOrEmpty(metadata.Duration)) metadata.Duration = "Bilinmiyor";
            return metadata;
        }

        public async Task<string> DownloadAudioAsync(string url, string workDirectory, CancellationToken token)
        {
            string ytdlp = _dependencies.FindYtDlp();
            string ffmpeg = _dependencies.FindFfmpeg();
            if (String.IsNullOrEmpty(ytdlp))
            {
                throw new UserVisibleException("YouTube indirme bileşeni bulunamadı. Tools\\yt-dlp\\yt-dlp.exe dosyasını ekleyin.");
            }
            if (String.IsNullOrEmpty(ffmpeg))
            {
                throw new UserVisibleException("YouTube ses çıkarma için FFmpeg bulunamadı.");
            }
            AppPaths.EnsureDirectory(workDirectory);
            string outputPattern = Path.Combine(workDirectory, "youtube_audio.%(ext)s");
            string args = "-x --audio-format wav --ffmpeg-location " + ProcessRunner.Quote(Path.GetDirectoryName(ffmpeg)) + " --no-playlist -o " + ProcessRunner.Quote(outputPattern) + " " + ProcessRunner.Quote(url);
            ProcessResult result = await _runner.RunAsync(ytdlp, args, token);
            if (result.ExitCode != 0)
            {
                Logger.Error("yt-dlp indirme hatasi", new Exception(result.Error));
                throw new UserVisibleException("YouTube videosundan ses alınamadı. Lütfen bağlantıyı, izinleri ve internet bağlantısını kontrol edin.");
            }
            string wav = Directory.GetFiles(workDirectory, "*.wav").FirstOrDefault();
            if (String.IsNullOrEmpty(wav))
            {
                throw new UserVisibleException("YouTube sesi indirildi ancak WAV dosyası bulunamadı. FFmpeg eksik olabilir.");
            }
            return wav;
        }

        private static string GetString(Dictionary<string, object> data, string key, string fallback)
        {
            object value;
            if (data.TryGetValue(key, out value) && value != null) return Convert.ToString(value, CultureInfo.CurrentCulture);
            return fallback;
        }
    }

    public class TranscriptionService
    {
        private readonly DependencyService _dependencies;
        private readonly ProcessRunner _runner;
        private readonly HistoryService _history;

        public TranscriptionService(DependencyService dependencies, ProcessRunner runner, HistoryService history)
        {
            _dependencies = dependencies;
            _runner = runner;
            _history = history;
        }

        public async Task<string> TranscribeFileAsync(MediaJob job, TranscriptionOptions options, IProgress<int> progress, CancellationToken token)
        {
            string whisper = _dependencies.FindWhisper();
            string model = _dependencies.FindModel(options.Model);
            string ffmpeg = _dependencies.FindFfmpeg();

            if (String.IsNullOrEmpty(whisper))
            {
                throw new UserVisibleException("Transkripsiyon motoru bulunamadı. Tools\\whisper klasörüne whisper-cli.exe dosyasını ekleyin.");
            }
            if (String.IsNullOrEmpty(model))
            {
                throw new UserVisibleException("Whisper model dosyası bulunamadı. Tools\\models klasörüne ggml-base.bin, ggml-small.bin veya ggml-medium.bin ekleyin.");
            }
            if (String.IsNullOrEmpty(ffmpeg))
            {
                throw new UserVisibleException("FFmpeg bulunamadı. Ses/video dönüştürme için Tools\\ffmpeg\\ffmpeg.exe gereklidir.");
            }

            string work = Path.Combine(AppPaths.WorkRoot, job.Id);
            AppPaths.EnsureDirectory(work);
            string wav = Path.Combine(work, "input_16k.wav");
            string outBase = Path.Combine(work, "transcript");

            progress.Report(5);
            job.State = JobState.Isleniyor;
            job.Progress = 5;

            string ffmpegArgs = BuildFfmpegArgs(job.SourcePath, wav, options);
            ProcessResult convert = await _runner.RunAsync(ffmpeg, ffmpegArgs, token);
            if (convert.ExitCode != 0)
            {
                Logger.Error("FFmpeg donusturme hatasi", new Exception(convert.Error));
                throw new UserVisibleException("Dosya okunamadı veya ses çıkarılamadı. Dosyanın bozuk olmadığını ve desteklenen bir formatta olduğunu kontrol edin.");
            }
            progress.Report(25);

            string whisperArgs = BuildWhisperArgs(model, wav, outBase, options);
            ProcessResult whisperResult = await _runner.RunAsync(whisper, whisperArgs, token);
            if (whisperResult.ExitCode != 0)
            {
                Logger.Error("Whisper hatasi", new Exception(whisperResult.Error));
                throw new UserVisibleException("Ses metne dönüştürülemedi. Model dosyasını, ses kalitesini ve disk alanını kontrol edin.");
            }
            progress.Report(85);

            string transcript = ReadTranscript(outBase, options);
            transcript = TextPostProcessor.Apply(transcript, options);
            if (String.IsNullOrWhiteSpace(transcript))
            {
                throw new UserVisibleException("Transkripsiyon tamamlandı ancak metin üretilemedi. Daha net sesli bir dosya deneyin.");
            }

            string safeName = SafeFileName(Path.GetFileNameWithoutExtension(job.DisplayName));
            string outputFolder = String.IsNullOrWhiteSpace(options.OutputFolder) ? AppPaths.DefaultOutputRoot : options.OutputFolder;
            AppPaths.EnsureDirectory(outputFolder);
            string autoTxt = Path.Combine(outputFolder, safeName + "_" + DateTime.Now.ToString("yyyyMMdd_HHmmss", CultureInfo.InvariantCulture) + ".txt");
            if (options.OutputFolder != null)
            {
                File.WriteAllText(autoTxt, transcript, Encoding.UTF8);
                job.OutputPath = autoTxt;
            }

            job.Transcript = transcript;
            job.State = JobState.Tamamlandi;
            job.Progress = 100;
            progress.Report(100);

            HistoryItem history = new HistoryItem();
            history.Id = job.Id;
            history.FileName = job.DisplayName;
            history.SourcePath = job.SourcePath;
            history.CreatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm", CultureInfo.CurrentCulture);
            history.Duration = job.Duration;
            history.OutputPath = job.OutputPath;
            history.State = MediaJob.ToStateText(job.State);
            history.Language = options.Language;
            _history.AddOrUpdate(history);

            return transcript;
        }

        private static string BuildFfmpegArgs(string input, string output, TranscriptionOptions options)
        {
            string filters = "";
            if (options.ReduceSilence)
            {
                filters = " -af silenceremove=start_periods=1:start_duration=0.3:start_threshold=-45dB:stop_periods=-1:stop_duration=0.5:stop_threshold=-45dB";
            }
            return "-y -i " + ProcessRunner.Quote(input) + " -vn -ar 16000 -ac 1" + filters + " " + ProcessRunner.Quote(output);
        }

        private static string BuildWhisperArgs(string model, string wav, string outBase, TranscriptionOptions options)
        {
            StringBuilder args = new StringBuilder();
            args.Append("-m ").Append(ProcessRunner.Quote(model));
            args.Append(" -f ").Append(ProcessRunner.Quote(wav));
            args.Append(" -of ").Append(ProcessRunner.Quote(outBase));
            args.Append(" -otxt -osrt -ovtt");

            string code = LanguageCode(options.Language);
            if (!String.IsNullOrEmpty(code))
            {
                args.Append(" -l ").Append(code);
            }
            return args.ToString();
        }

        private static string LanguageCode(string language)
        {
            if (String.IsNullOrWhiteSpace(language)) return "tr";
            if (language.IndexOf("Otomatik", StringComparison.OrdinalIgnoreCase) >= 0) return "";
            if (language.IndexOf("Türk", StringComparison.OrdinalIgnoreCase) >= 0) return "tr";
            if (language.IndexOf("İngiliz", StringComparison.OrdinalIgnoreCase) >= 0 || language.IndexOf("English", StringComparison.OrdinalIgnoreCase) >= 0) return "en";
            if (language.IndexOf("Alman", StringComparison.OrdinalIgnoreCase) >= 0) return "de";
            if (language.IndexOf("Arap", StringComparison.OrdinalIgnoreCase) >= 0) return "ar";
            return "tr";
        }

        private static string ReadTranscript(string outBase, TranscriptionOptions options)
        {
            string srt = outBase + ".srt";
            string txt = outBase + ".txt";

            if (options.TimestampsEnabled && File.Exists(srt))
            {
                string parsed = ParseSrtToTimestampText(File.ReadAllText(srt, Encoding.UTF8));
                if (!String.IsNullOrWhiteSpace(parsed)) return parsed;
            }
            if (File.Exists(txt))
            {
                string raw = File.ReadAllText(txt, Encoding.UTF8);
                if (options.TimestampsEnabled && raw.IndexOf("[", StringComparison.Ordinal) < 0)
                {
                    return "[00:00:00] " + raw.Trim();
                }
                return raw.Trim();
            }
            if (File.Exists(srt)) return ParseSrtToTimestampText(File.ReadAllText(srt, Encoding.UTF8));
            return "";
        }

        private static string ParseSrtToTimestampText(string srt)
        {
            StringBuilder builder = new StringBuilder();
            string[] blocks = Regex.Split(srt.Replace("\r\n", "\n"), @"\n\s*\n");
            foreach (string block in blocks)
            {
                string[] lines = block.Split(new char[] { '\n' }, StringSplitOptions.RemoveEmptyEntries);
                if (lines.Length < 3) continue;
                string timeLine = lines.FirstOrDefault(delegate(string line) { return line.IndexOf("-->", StringComparison.Ordinal) >= 0; });
                if (String.IsNullOrEmpty(timeLine)) continue;
                string start = timeLine.Split(new string[] { "-->" }, StringSplitOptions.None)[0].Trim();
                TimeSpan startTime;
                if (!TryParseSrtTime(start, out startTime)) startTime = TimeSpan.Zero;
                StringBuilder text = new StringBuilder();
                foreach (string line in lines)
                {
                    if (line.IndexOf("-->", StringComparison.Ordinal) >= 0) continue;
                    int number;
                    if (Int32.TryParse(line.Trim(), out number)) continue;
                    if (text.Length > 0) text.Append(" ");
                    text.Append(line.Trim());
                }
                if (text.Length > 0)
                {
                    builder.Append("[");
                    builder.Append(startTime.ToString(@"hh\:mm\:ss", CultureInfo.InvariantCulture));
                    builder.Append("] ");
                    builder.AppendLine(text.ToString());
                }
            }
            return builder.ToString().Trim();
        }

        private static bool TryParseSrtTime(string value, out TimeSpan result)
        {
            value = (value ?? "").Replace(',', '.');
            return TimeSpan.TryParseExact(value, @"hh\:mm\:ss\.fff", CultureInfo.InvariantCulture, out result);
        }

        private static string SafeFileName(string value)
        {
            if (String.IsNullOrWhiteSpace(value)) return "transkripsiyon";
            foreach (char invalid in Path.GetInvalidFileNameChars())
            {
                value = value.Replace(invalid, '_');
            }
            return value;
        }
    }

    public static class TextPostProcessor
    {
        public static string Apply(string text, TranscriptionOptions options)
        {
            if (String.IsNullOrWhiteSpace(text)) return "";
            string result = text.Trim();
            if (options.RemoveFillers)
            {
                result = Regex.Replace(result, @"\b(ııı+|eee+|şey|hani|yani)\b", "", RegexOptions.IgnoreCase);
                result = Regex.Replace(result, @"[ ]{2,}", " ");
            }
            if (options.ImprovePunctuation)
            {
                result = ImprovePunctuation(result);
            }
            if (options.ParagraphMode)
            {
                result = Regex.Replace(result, @"(?<=[.!?])\s+(?=\[?\d{0,2}:?\d{2}|[A-ZÇĞİÖŞÜ])", Environment.NewLine + Environment.NewLine);
            }
            return result.Trim();
        }

        private static string ImprovePunctuation(string text)
        {
            string[] lines = text.Replace("\r\n", "\n").Split('\n');
            for (int i = 0; i < lines.Length; i++)
            {
                string line = lines[i].Trim();
                if (line.Length == 0)
                {
                    lines[i] = line;
                    continue;
                }
                char last = line[line.Length - 1];
                if (last != '.' && last != '!' && last != '?' && last != ':' && last != ';')
                {
                    line += ".";
                }
                lines[i] = line;
            }
            return String.Join(Environment.NewLine, lines);
        }
    }
}
