import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import type { AppSettings, JobRecord, Language, MediaFile, Quality, YouTubeInfo } from "./types";

const assets = {
  background: new URL("./assets/app-background.png", import.meta.url).href,
  mic: new URL("./assets/sidebar-mic.png", import.meta.url).href,
  youtube: new URL("./assets/youtube.png", import.meta.url).href,
  file: new URL("./assets/file.png", import.meta.url).href,
  audio: new URL("./assets/audio-file.png", import.meta.url).href,
  pdf: new URL("./assets/pdf.png", import.meta.url).href,
  word: new URL("./assets/word.png", import.meta.url).href,
  txt: new URL("./assets/txt.png", import.meta.url).href,
  flagTr: new URL("./assets/flag-tr.png", import.meta.url).href,
  flagKu: new URL("./assets/flag-ku.png", import.meta.url).href,
  flagEn: new URL("./assets/flag-en.png", import.meta.url).href
};

type IconName =
  | "add"
  | "back10"
  | "bolt"
  | "check"
  | "clock"
  | "cloud"
  | "copy"
  | "download"
  | "file"
  | "forward10"
  | "gift"
  | "help"
  | "history"
  | "home"
  | "info"
  | "link"
  | "magic"
  | "pause"
  | "play"
  | "refresh"
  | "settings"
  | "sound"
  | "target"
  | "trash"
  | "warning"
  | "wave"
  | "scale";

const qualities: { label: Quality; detail: string; icon: IconName }[] = [
  { label: "Hızlı", detail: "Beam 4", icon: "bolt" },
  { label: "Dengeli", detail: "Beam 6", icon: "scale" },
  { label: "Yüksek Doğruluk", detail: "Beam 8", icon: "target" }
];

const languages: { label: Language; icon?: string; symbol?: IconName }[] = [
  { label: "Otomatik", symbol: "magic" },
  { label: "Türkçe", icon: assets.flagTr },
  { label: "Kürtçe", icon: assets.flagKu },
  { label: "İngilizce", icon: assets.flagEn }
];

const defaultSettings: AppSettings = {
  defaultQuality: "Dengeli",
  defaultLanguage: "Türkçe",
  timestamps: true,
  autoCorrect: true,
  soundEffects: true,
  animations: true,
  transparentTheme: true
};

type Page = "home" | "queue" | "result" | "settings" | "help";

function SvgIcon({ name, className = "" }: { name: IconName; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg className={`svg-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      {name === "home" && <path {...common} d="M3 11.5 12 4l9 7.5M5.5 10.5V20h13v-9.5M9.5 20v-5h5v5" />}
      {name === "history" && <path {...common} d="M4 12a8 8 0 1 0 2.4-5.7M4 5.5V10h4.5M12 8v5l3 1.8" />}
      {name === "settings" && <path {...common} d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6ZM4.4 14.6l-1-2.6 1-2.6 2.1-.5 1.1-1.8-.6-2 2.4-1.2 1.8 1.2h1.6l1.8-1.2L17 5.1l-.6 2 1.1 1.8 2.1.5 1 2.6-1 2.6-2.1.5-1.1 1.8.6 2-2.4 1.2-1.8-1.2h-1.6L9.4 20 7 18.9l.6-2-1.1-1.8-2.1-.5Z" />}
      {name === "help" && <path {...common} d="M9.2 9a3 3 0 1 1 5.3 1.9c-.9.8-1.8 1.3-2.1 2.6M12 17.8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />}
      {name === "cloud" && <path {...common} d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 10.5 3.8 3.8 0 0 1 17.5 18H7Zm5-9v7m0-7-3 3m3-3 3 3" />}
      {name === "add" && <path {...common} d="M12 5v14M5 12h14" />}
      {name === "link" && <path {...common} d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.2 1.2M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.2-1.2" />}
      {name === "copy" && <path {...common} d="M9 9h10v10H9zM5 15H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" />}
      {name === "info" && <path {...common} d="M12 16v-5M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />}
      {name === "magic" && <path {...common} d="m5 19 9-9M13 4l.7 2.1L16 7l-2.3.9L13 10l-.7-2.1L10 7l2.3-.9L13 4ZM19 12l.4 1.2 1.2.4-1.2.4-.4 1.2-.4-1.2-1.2-.4 1.2-.4L19 12ZM6 4l.5 1.5L8 6l-1.5.5L6 8l-.5-1.5L4 6l1.5-.5L6 4Z" />}
      {name === "gift" && <path {...common} d="M20 12v8H4v-8M3 8h18v4H3zM12 8v12M12 8H8.5a2 2 0 1 1 0-4C11 4 12 8 12 8Zm0 0h3.5a2 2 0 1 0 0-4C13 4 12 8 12 8Z" />}
      {name === "play" && <path fill="currentColor" d="M8 5.8v12.4c0 .8.9 1.3 1.6.8l9-6.2a1 1 0 0 0 0-1.6l-9-6.2A1 1 0 0 0 8 5.8Z" />}
      {name === "pause" && <path fill="currentColor" d="M7 5h3.2v14H7zm6.8 0H17v14h-3.2z" />}
      {name === "back10" && <><path {...common} d="M8 7H4V3" /><path {...common} d="M4.8 7.2A8 8 0 1 1 4 12" /><text x="8" y="15.5" fontSize="7" fontWeight="800" fill="currentColor">10</text></>}
      {name === "forward10" && <><path {...common} d="M16 7h4V3" /><path {...common} d="M19.2 7.2A8 8 0 1 0 20 12" /><text x="8" y="15.5" fontSize="7" fontWeight="800" fill="currentColor">10</text></>}
      {name === "sound" && <path {...common} d="M4 10v4h4l5 4V6l-5 4H4Zm13.5-1.5a5 5 0 0 1 0 7M20 6a9 9 0 0 1 0 12" />}
      {name === "bolt" && <path fill="currentColor" d="M13 2 5 13h6l-1 9 9-13h-6l1-7Z" />}
      {name === "scale" && <path {...common} d="M12 3v18M5 7h14M7 7l-4 7h8L7 7Zm10 0-4 7h8l-4-7Z" />}
      {name === "target" && <path {...common} d="M20 12a8 8 0 1 1-8-8M12 16a4 4 0 1 1 4-4M14 10l6-6m-1 0h-5v5" />}
      {name === "refresh" && <path {...common} d="M20 12a8 8 0 0 1-13.6 5.7M4 12A8 8 0 0 1 17.6 6.3M17 3v4h4M7 21v-4H3" />}
      {name === "trash" && <path {...common} d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7l1-3h4l1 3" />}
      {name === "file" && <path {...common} d="M6 3h8l4 4v14H6zM14 3v5h5" />}
      {name === "download" && <path {...common} d="M12 4v10m0 0 4-4m-4 4-4-4M5 20h14" />}
      {name === "check" && <path {...common} d="M20 6 9 17l-5-5" />}
      {name === "warning" && <path {...common} d="M12 4 2.8 20h18.4L12 4Zm0 5v5m0 3h.01" />}
      {name === "clock" && <path {...common} d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-5v5l3 2" />}
      {name === "wave" && <path {...common} d="M4 12v-2m4 7V7m4 12V5m4 10V9m4 3v-2" />}
    </svg>
  );
}

function LogoMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo-mark ${small ? "small" : ""}`} aria-hidden="true">
      <i /><i /><i /><i /><i />
    </span>
  );
}

function App() {
  const [page, setPage] = useState<Page>("home");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeInfo, setYoutubeInfo] = useState<YouTubeInfo | null>(null);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [notice, setNotice] = useState("Kullanıma hazır");

  useEffect(() => {
    window.desktopApi.getSettings().then(setSettings).catch(() => setSettings(defaultSettings));
    window.desktopApi.getHistory().then((items) => {
      setJobs(items);
      if (items[0]) setSelectedId(items[0].id);
    }).catch(() => undefined);
    return window.desktopApi.onProgress((payload) => {
      setJobs((current) => current.map((job) => job.id === payload.id ? {
        ...job,
        progress: payload.progress,
        stage: payload.stage,
        remaining: payload.remaining,
        status: payload.progress >= 100 ? "Tamamlandı" : "İşleniyor"
      } : job));
    });
  }, []);

  useEffect(() => {
    document.body.classList.toggle("transparent-off", !settings.transparentTheme);
    document.body.classList.toggle("no-motion", !settings.animations);
    void window.desktopApi.saveHistory(jobs);
  }, [jobs, settings.transparentTheme, settings.animations]);

  useEffect(() => {
    document.querySelector(".main-area")?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [page]);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedId) || jobs.find((job) => job.status === "Tamamlandı") || jobs[0], [jobs, selectedId]);
  const activeJob = useMemo(() => jobs.find((job) => job.status === "İşleniyor") || selectedJob, [jobs, selectedJob]);

  async function addFiles() {
    try {
      const files = await window.desktopApi.chooseMediaFiles();
      addMediaFiles(files);
    } catch {
      showNotice("Dosya okunamadı. Lütfen farklı bir dosya deneyin.");
    }
  }

  function addMediaFiles(files: MediaFile[]) {
    if (!files.length) return;
    const created = files.map((file) => newJobFromFile(file, settings));
    setJobs((current) => [...created, ...current]);
    setSelectedId(created[0].id);
    showNotice(`${created.length} dosya eklendi.`);
    playUiSound(settings, "added");
  }

  async function fetchYoutubeInfo() {
    if (youtubeLoading) return;
    setYoutubeLoading(true);
    try {
      const info = await window.desktopApi.getYouTubeInfo(youtubeUrl);
      setYoutubeInfo(info);
      showNotice("Video bilgisi alındı.");
    } catch (error) {
      showNotice(readError(error, "YouTube bağlantısı alınamadı. İnternet bağlantınızı kontrol edin."));
    } finally {
      setYoutubeLoading(false);
    }
  }

  async function addYoutubeAndRun() {
    if (youtubeLoading) return;
    setYoutubeLoading(true);
    try {
      const info = youtubeInfo || await window.desktopApi.getYouTubeInfo(youtubeUrl);
      setYoutubeInfo(info);
      const job = newJobFromYoutube(info, settings);
      setJobs((current) => [job, ...current]);
      setSelectedId(job.id);
      await runJob(job);
    } catch (error) {
      showNotice(readError(error, "YouTube bağlantısı alınamadı. İnternet bağlantınızı kontrol edin."));
    } finally {
      setYoutubeLoading(false);
    }
  }

  async function runAll() {
    const waiting = jobs.filter((job) => job.status === "Bekliyor" || job.status === "Hata" || job.status === "İptal Edildi" || job.status === "Durduruldu");
    if (!waiting.length) {
      showNotice("Dönüştürmek için önce dosya ekleyin.");
      return;
    }
    for (const job of waiting) {
      await runJob(job);
    }
  }

  async function runJob(job: JobRecord) {
    playUiSound(settings, "start");
    setPage("queue");
    setSelectedId(job.id);
    setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: "İşleniyor", stage: "Dosya hazırlanıyor", progress: 2, remaining: "Hesaplanıyor…" } : item));
    try {
      const completed = await window.desktopApi.transcribe(job, settings);
      setJobs((current) => current.map((item) => item.id === job.id ? completed : item));
      if (completed.status === "İptal Edildi") {
        showNotice("Dönüştürme iptal edildi.");
        return;
      }
      setSelectedId(completed.id);
      setPage("result");
      showNotice("Dönüştürme tamamlandı.");
      playUiSound(settings, "complete");
    } catch (error) {
      setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: "Hata", stage: "Bir sorun oluştu", error: readError(error, "Dönüştürme tamamlanamadı. Dosyayı yeniden deneyebilirsiniz.") } : item));
      showNotice(readError(error, "Dönüştürme tamamlanamadı. Dosyayı yeniden deneyebilirsiniz."));
      playUiSound(settings, "error");
    }
  }

  async function stopJob(job: JobRecord) {
    try {
      await window.desktopApi.cancelTranscription(job.id);
      setJobs((current) => current.map((item) => item.id === job.id ? {
        ...item,
        status: "İptal Edildi",
        stage: "İptal edildi",
        remaining: "-",
        error: undefined
      } : item));
      showNotice("Dönüştürme iptal ediliyor…");
    } catch (error) {
      showNotice(readError(error, "İşlem durdurulamadı."));
    }
  }

  async function exportCurrent(type: "pdf" | "docx" | "txt") {
    if (!selectedJob) return;
    try {
      const result = await window.desktopApi.exportFile({ type, job: selectedJob, settings });
      setJobs((current) => current.map((job) => job.id === selectedJob.id ? { ...job, outputFiles: { ...job.outputFiles, [type]: result.path } } : job));
      showNotice("Dosyanız hazır.");
    } catch {
      showNotice("Dosya kaydedilemedi. Lütfen tekrar deneyin.");
    }
  }

  async function saveSettings(next = settings) {
    const saved = await window.desktopApi.saveSettings(next);
    setSettings(saved);
    showNotice("Ayarlar kaydedildi.");
  }

  async function resetSettings() {
    const saved = await window.desktopApi.resetSettings();
    setSettings(saved);
    showNotice("Varsayılan ayarlar yüklendi.");
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice("Kullanıma hazır"), 4500);
  }

  return (
    <div className="app-shell" style={{ backgroundImage: `url(${assets.background})` }}>
      <Sidebar page={page} setPage={setPage} />
      <main className="main-area">
        <TopBar title={pageTitle(page)} subtitle={pageSubtitle(page)} notice={notice} />
        {page === "home" && (
          <HomePage
            settings={settings}
            setSettings={setSettings}
            youtubeUrl={youtubeUrl}
            setYoutubeUrl={setYoutubeUrl}
            youtubeInfo={youtubeInfo}
            youtubeLoading={youtubeLoading}
            addFiles={addFiles}
            addMediaFiles={addMediaFiles}
            fetchYoutubeInfo={fetchYoutubeInfo}
            addYoutubeAndRun={addYoutubeAndRun}
            runAll={runAll}
            activeJob={activeJob}
          />
        )}
        {page === "queue" && (
          <QueuePage
            jobs={jobs}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            activeJob={activeJob}
            addFiles={addFiles}
            runJob={runJob}
            clearDone={() => setJobs((current) => current.filter((job) => job.status !== "Tamamlandı"))}
            clearQueue={() => setJobs([])}
            stopJob={stopJob}
          />
        )}
        {page === "result" && (
          <ResultPage
            job={selectedJob}
            exportCurrent={exportCurrent}
            rerun={(job) => runJob({ ...job, id: crypto.randomUUID(), status: "Bekliyor", progress: 0, stage: "Bekliyor", transcript: "", outputFiles: {}, createdAt: new Date().toISOString() })}
          />
        )}
        {page === "settings" && (
          <SettingsPage settings={settings} setSettings={setSettings} saveSettings={saveSettings} resetSettings={resetSettings} />
        )}
        {page === "help" && <HelpPage />}
      </main>
    </div>
  );
}

function Sidebar({ page, setPage }: { page: Page; setPage: (page: Page) => void }) {
  const items: { key: Page; label: string; icon: IconName }[] = [
    { key: "home", label: "Anasayfa", icon: "home" },
    { key: "queue", label: "Geçmiş", icon: "history" },
    { key: "settings", label: "Ayarlar", icon: "settings" },
    { key: "help", label: "Yardım", icon: "help" }
  ];
  return (
    <aside className="sidebar glass-strong">
      <div className="brand">
        <LogoMark />
        <div>My Sesi Metne<br />Dönüştürme</div>
      </div>
      <nav>
        {items.map((item) => (
          <button key={item.key} className={`nav-item ${page === item.key ? "active" : ""}`} onClick={() => setPage(item.key)}>
            <SvgIcon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-visual" aria-hidden="true">
        <img className="sidebar-mic" src={assets.mic} alt="" />
      </div>
      <footer>
        <div>v1.0.0 <span className="green-dot" /> Güncel</div>
        <p>Yapan: Mustafa Yılmaz</p>
        <p>© 2026 Mustafa Yılmaz. Tüm hakları saklıdır.</p>
      </footer>
    </aside>
  );
}

function TopBar({ title, subtitle, notice }: { title: string; subtitle: string; notice: string }) {
  return (
    <header className="topbar">
      <div className="title-block">
        <LogoMark small />
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="badge free"><SvgIcon name="gift" /> Ücretsiz / Sınırsız</div>
      <div className="badge ready"><SvgIcon name="magic" /> {notice}</div>
    </header>
  );
}

function HomePage(props: {
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
  youtubeUrl: string;
  setYoutubeUrl: (url: string) => void;
  youtubeInfo: YouTubeInfo | null;
  youtubeLoading: boolean;
  addFiles: () => void;
  addMediaFiles: (files: MediaFile[]) => void;
  fetchYoutubeInfo: () => void;
  addYoutubeAndRun: () => void;
  runAll: () => void;
  activeJob?: JobRecord;
}) {
  const { settings, setSettings } = props;
  return (
    <section className="page home-page">
      <div
        className="drop-zone glass-card"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const files = Array.from(event.dataTransfer.files)
            .map((file) => ({ path: (file as File & { path?: string }).path || "", name: file.name, format: file.name.split(".").pop()?.toUpperCase() || "", sizeText: "", duration: "--:--", durationSeconds: 0 }))
            .filter((file) => file.path);
          props.addMediaFiles(files);
        }}
      >
        <SvgIcon name="cloud" className="upload-icon" />
        <h2>Ses veya video dosyanızı buraya sürükleyip bırakın</h2>
        <p>MP3, WAV, M4A, MP4, MOV, AVI, MKV ve daha fazlası desteklenir</p>
        <button className="primary-btn" onClick={props.addFiles}><SvgIcon name="add" /> Dosya Seç</button>
      </div>
      <div className="or-line"><span /> veya <span /></div>
      <div className="youtube-row glass-card">
        <div className="youtube-card">
          {props.youtubeInfo?.thumbnail ? <img className="thumbnail" src={props.youtubeInfo.thumbnail} alt="Video küçük resmi" /> : <div className="thumbnail empty"><img src={assets.youtube} alt="" /></div>}
          <h3>{props.youtubeInfo?.title || "Video bilgisi bekleniyor"}</h3>
          <p>{props.youtubeInfo?.channel || "Kanal: -"}</p>
          <p>Süre: {props.youtubeInfo?.duration || "-"}</p>
        </div>
        <div className="youtube-left">
          <label>YouTube bağlantısı yapıştırın</label>
          <div className="input-row">
            <SvgIcon name="link" />
            <input value={props.youtubeUrl} onChange={(event) => props.setYoutubeUrl(event.target.value)} placeholder="YouTube bağlantısı yapıştır (ör. https://www.youtube.com/watch?v=...)" />
            <button className="icon-btn" onClick={() => navigator.clipboard.readText().then(props.setYoutubeUrl).catch(() => undefined)}><SvgIcon name="copy" /></button>
          </div>
          <p className="hint"><SvgIcon name="info" /> YouTube bağlantıları için internet bağlantısı gereklidir. Yerel dosyalar çevrimdışı çalışır.</p>
          <div className="button-row">
            <button className="ghost-btn" disabled={props.youtubeLoading} onClick={props.fetchYoutubeInfo}>{props.youtubeLoading ? "Bilgi alınıyor…" : "Bilgi Getir"}</button>
            <button className="primary-btn" disabled={props.youtubeLoading} onClick={props.addYoutubeAndRun}><SvgIcon name="magic" /> {props.youtubeLoading ? "Bekleyin…" : "Dönüştür"}</button>
          </div>
        </div>
      </div>
      <AudioPlayer job={props.activeJob} />
      <div className="option-grid">
        <ChoiceCard title="Kalite" items={qualities} selected={settings.defaultQuality} onSelect={(value) => setSettings({ ...settings, defaultQuality: value as Quality })} />
        <LanguageCard selected={settings.defaultLanguage} onSelect={(value) => setSettings({ ...settings, defaultLanguage: value })} />
        <AdvancedCard settings={settings} setSettings={setSettings} />
      </div>
      <div className="convert-strip glass-card">
        <button className="big-convert" onClick={props.runAll}><SvgIcon name="magic" /> Dönüştür</button>
      </div>
    </section>
  );
}

function QueuePage(props: {
  jobs: JobRecord[];
  selectedId: string;
  setSelectedId: (id: string) => void;
  activeJob?: JobRecord;
  addFiles: () => void;
  runJob: (job: JobRecord) => void;
  clearDone: () => void;
  clearQueue: () => void;
  stopJob: (job: JobRecord) => void;
}) {
  const summary = {
    total: props.jobs.length,
    running: props.jobs.filter((job) => job.status === "İşleniyor").length,
    done: props.jobs.filter((job) => job.status === "Tamamlandı").length,
    waiting: props.jobs.filter((job) => job.status === "Bekliyor").length
  };
  return (
    <section className="page queue-layout">
      <div className="queue-main glass-card">
        <div className="section-head">
          <div><h2>Kuyruktaki Dosyalar</h2><p>Dosyalarınız sırayla işleniyor</p></div>
          <div className="button-row">
            <button className="primary-btn" onClick={props.addFiles}><SvgIcon name="add" /> Dosya Ekle</button>
            <button className="ghost-btn" onClick={props.clearQueue}>Kuyruğu Temizle</button>
            <button className="ghost-btn danger" onClick={props.clearDone}>Tamamlananları Temizle</button>
          </div>
        </div>
        <div className="queue-head"><span>Dosya Adı</span><span>Durum</span><span>Ayarlar</span><span>İlerleme</span><span>Kalan Süre</span><span>İşlemler</span></div>
        {props.jobs.length === 0 && <div className="empty-state">Henüz dosya eklenmedi. Başlamak için Dosya Seç düğmesine basın.</div>}
        {props.jobs.map((job) => (
          <div className={`job-row ${props.selectedId === job.id ? "selected" : ""}`} key={job.id} onClick={() => props.setSelectedId(job.id)}>
            <div className="file-cell"><img src={job.format === "MP4" || job.format === "MOV" || job.format === "AVI" || job.format === "MKV" ? assets.file : assets.audio} alt="" /><div><b title={job.name}>{job.name}</b><p>{job.format} • {job.duration} • {job.sizeText}</p></div></div>
            <StatusPill status={job.status} />
            <div className="small-lines"><span>{job.quality}</span><span>{job.language}</span></div>
            <div><b>{job.progress}%</b><div className="progress"><i style={{ width: `${job.progress}%` }} /></div></div>
            <div>{job.remaining}</div>
            <div className="row-actions">
              {job.status === "İşleniyor" ? <button className="icon-btn" onClick={(e) => { e.stopPropagation(); props.stopJob(job); }}><SvgIcon name="pause" /></button> : <button className="icon-btn" onClick={(e) => { e.stopPropagation(); props.runJob(job); }}><SvgIcon name="play" /></button>}
              <button className="icon-btn" onClick={(e) => { e.stopPropagation(); props.runJob({ ...job, id: crypto.randomUUID(), status: "Bekliyor", progress: 0, transcript: "", outputFiles: {}, createdAt: new Date().toISOString() }); }}><SvgIcon name="refresh" /></button>
            </div>
            {props.selectedId === job.id && <div className="job-detail">Aynı dosyayı farklı kalite veya dil ayarlarıyla yeniden dönüştürebilirsiniz.</div>}
          </div>
        ))}
        <div className="tip-card"><SvgIcon name="info" /> İpucu: Daha hızlı sonuçlar için “Hızlı”, daha yüksek doğruluk için “Yüksek Doğruluk” ayarını seçebilirsiniz.</div>
      </div>
      <aside className="queue-side">
        <div className="summary-grid glass-card">
          <Summary label="Toplam" value={summary.total} />
          <Summary label="İşleniyor" value={summary.running} />
          <Summary label="Tamamlandı" value={summary.done} />
          <Summary label="Bekliyor" value={summary.waiting} />
        </div>
        <div className="active-card glass-card">
          <h3>Aktif İşlem</h3>
          {props.activeJob ? (
            <>
              <b>{props.activeJob.name}</b>
              <p>{props.activeJob.status} • %{props.activeJob.progress}</p>
              <div className="progress large"><i style={{ width: `${props.activeJob.progress}%` }} /></div>
              <AudioPlayer job={props.activeJob} compact />
              <dl><dt>Kalite</dt><dd>{props.activeJob.quality}</dd><dt>Dil</dt><dd>{props.activeJob.language}</dd><dt>Kalan</dt><dd>{props.activeJob.remaining}</dd></dl>
              <button className="ghost-btn block" onClick={() => props.stopJob(props.activeJob!)}>İşlemeyi Durdur</button>
            </>
          ) : <p>Aktif dosya yok.</p>}
        </div>
      </aside>
    </section>
  );
}

function ResultPage({ job, exportCurrent, rerun }: { job?: JobRecord; exportCurrent: (type: "pdf" | "docx" | "txt") => void; rerun: (job: JobRecord) => void }) {
  if (!job) return <section className="page"><div className="glass-card empty-state">Henüz sonuç yok.</div></section>;
  return (
    <section className="page result-page">
      <div className="result-hero glass-card">
        <div className="file-badge"><img src={assets.audio} alt="" /></div>
        <div className="result-info">
          <h2>{job.name}</h2>
          <div className="meta-list"><span>Süre<br /><b>{job.duration}</b></span><span>Kalite<br /><b>{job.quality}</b></span><span>Dil<br /><b>{job.language}</b></span><span>Durum<br /><b>{job.status}</b></span></div>
        </div>
        <div className="download-buttons">
          <button onClick={() => exportCurrent("pdf")}><img src={assets.pdf} alt="" /> PDF İndir</button>
          <button onClick={() => exportCurrent("docx")}><img src={assets.word} alt="" /> Word İndir</button>
          <button onClick={() => exportCurrent("txt")}><img src={assets.txt} alt="" /> TXT İndir</button>
        </div>
      </div>
      <AudioPlayer job={job} />
      <div className="transcript-card glass-card">
        <div className="section-head"><h2>Döküm (Transkript)</h2><button className="ghost-btn" onClick={() => navigator.clipboard.writeText(job.transcript || "")}><SvgIcon name="copy" /> Tümünü Kopyala</button></div>
        <pre>{job.transcript || "Metin henüz hazır değil."}</pre>
      </div>
      <div className="bottom-grid">
        <div className="glass-card quality-card"><h3>Çıktı Kalitesi</h3><span>UTF-8</span><span>Türkçe karakter uyumlu</span><span>Zaman damgalı</span><p>Metin dosyası UTF-8 kodlamasıyla oluşturulur.</p></div>
        <div className="glass-card rerun-card"><h3>Yeniden Dönüştür</h3><p>Aynı dosyayı farklı kalite modlarıyla yeniden dönüştürebilirsiniz. Önceki sonuçlar silinmeden saklanır.</p><button className="big-convert" onClick={() => rerun(job)}><SvgIcon name="refresh" /> Aynı Dosyayı Yeniden Dönüştür</button></div>
      </div>
    </section>
  );
}

function SettingsPage({ settings, setSettings, saveSettings, resetSettings }: { settings: AppSettings; setSettings: (settings: AppSettings) => void; saveSettings: (settings?: AppSettings) => void; resetSettings: () => void }) {
  return (
    <section className="page settings-grid">
      <div className="glass-card settings-card"><h2><span>1</span> Dönüştürme</h2><ChoiceCard title="Varsayılan kalite" items={qualities} selected={settings.defaultQuality} onSelect={(value) => setSettings({ ...settings, defaultQuality: value as Quality })} /><LanguageCard selected={settings.defaultLanguage} onSelect={(value) => setSettings({ ...settings, defaultLanguage: value })} /><Toggle label="Zaman damgaları" checked={settings.timestamps} onChange={(checked) => setSettings({ ...settings, timestamps: checked })} /><Toggle label="Metni otomatik düzelt" checked={settings.autoCorrect} onChange={(checked) => setSettings({ ...settings, autoCorrect: checked })} /></div>
      <div className="glass-card settings-card"><h2><span>2</span> Görünüm</h2><Toggle label="Şeffaf tema" sub="Arka planı ve cam efektlerini etkinleştir" checked={settings.transparentTheme} onChange={(checked) => setSettings({ ...settings, transparentTheme: checked })} /><Toggle label="Animasyonlar" sub="Geçiş ve animasyon efektlerini etkinleştir" checked={settings.animations} onChange={(checked) => setSettings({ ...settings, animations: checked })} /></div>
      <div className="glass-card settings-card"><h2><span>3</span> Ses Efektleri</h2><Toggle label="Ses efektlerini etkinleştir" checked={settings.soundEffects} onChange={(checked) => setSettings({ ...settings, soundEffects: checked })} /><SoundRow settings={settings} label="Dosya eklendi" /><SoundRow settings={settings} label="Dönüştürme başladı" /><SoundRow settings={settings} label="Başarılı" /><SoundRow settings={settings} label="Hata" /></div>
      <div className="glass-card settings-card info-list"><h2><span>4</span> Bilgi</h2>{["Hızlı dönüştürme", "Gizlilik odaklı", "Tek kurulum", "Kolay kullanım"].map((item) => <p key={item}><SvgIcon name="check" /> <b>{item}</b></p>)}<small>Yapan: Mustafa Yılmaz<br />© 2026 Mustafa Yılmaz. Tüm hakları saklıdır.</small></div>
      <div className="settings-actions glass-card"><button className="ghost-btn" onClick={resetSettings}>Varsayılana Dön</button><button className="primary-btn" onClick={() => saveSettings(settings)}>Kaydet</button></div>
    </section>
  );
}

function HelpPage() {
  const cards = [
    ["Nasıl kullanılır?", "Dosya seç, kalite ve dil seç, Dönüştür düğmesine bas."],
    ["Desteklenen dosyalar", "MP3, WAV, M4A, MP4, MOV, AVI, MKV ve daha fazlası."],
    ["YouTube bağlantısı", "Bağlantıyı yapıştır, Bilgi Getir ile video bilgisini gör, sonra dönüştür."],
    ["Kalite seçenekleri", "Hızlı kısa işler için, Dengeli genel kullanım için, Yüksek Doğruluk daha ayrıntılı işler içindir."],
    ["PDF, Word, TXT", "Sonuç hazır olduğunda istediğiniz dosya türünü indirebilirsiniz."],
    ["Yeniden dönüştürme", "Aynı dosya tekrar işlendiğinde eski sonuçlar silinmez."],
    ["Ses oynatıcı", "Play, 10 saniye ileri/geri ve ses seviyesi kontrollerini kullanın."],
    ["Koyu tema", "Ayarlar ekranından tema ve ses efektlerini değiştirebilirsiniz."],
    ["Sık karşılaşılan sorunlar", "Dosya okunamazsa farklı dosya deneyin; YouTube için bağlantınızı kontrol edin."],
    ["Uygulama bilgisi", "My Sesi Metne Dönüştürme v1.0.0. Yapan: Mustafa Yılmaz. © 2026 Mustafa Yılmaz."]
  ];
  return <section className="page help-grid">{cards.map(([title, text]) => <div className="glass-card help-card" key={title}><SvgIcon name="info" /><h3>{title}</h3><p>{text}</p></div>)}</section>;
}

function AudioPlayer({ job, compact = false }: { job?: JobRecord; compact?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const src = job?.sourceType === "file" && job.sourcePath ? toFileUrl(job.sourcePath) : "";
  const total = duration || job?.durationSeconds || 0;
  const percent = total > 0 ? Math.min(100, (current / total) * 100) : 0;

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    if (audio.current) {
      audio.current.pause();
      audio.current.currentTime = 0;
    }
  }, [job?.id, job?.sourcePath]);

  return (
    <div className={`audio-player glass-card ${compact ? "compact" : ""} ${src ? "" : "disabled"}`}>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={() => {
          setDuration(audio.current?.duration || job?.durationSeconds || 0);
          if (audio.current) audio.current.volume = volume;
        }}
        onDurationChange={() => setDuration(audio.current?.duration || job?.durationSeconds || 0)}
        onTimeUpdate={() => setCurrent(audio.current?.currentTime || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(audio.current?.duration || 0);
        }}
        onError={() => {
          setPlaying(false);
          setCurrent(0);
        }}
      />
      <div className="audio-controls">
      <button className="round-play" disabled={!src} onClick={() => {
        if (!audio.current || !src) return;
        if (audio.current.paused) {
          void audio.current.play().catch(() => setPlaying(false));
        } else {
          audio.current.pause();
        }
      }}>{playing ? <SvgIcon name="pause" /> : <SvgIcon name="play" />}</button>
      <button className="mini-control" disabled={!src} onClick={() => { if (audio.current) audio.current.currentTime = Math.max(0, audio.current.currentTime - 10); }}><SvgIcon name="back10" /></button>
      <button className="mini-control" disabled={!src} onClick={() => { if (audio.current) audio.current.currentTime = Math.min(total || audio.current.duration || 0, audio.current.currentTime + 10); }}><SvgIcon name="forward10" /></button>
      </div>
      <div className="wave">
        <input
          className="seek-range"
          style={{ "--seek": `${percent}%` } as React.CSSProperties}
          aria-label="Ses ilerleme"
          type="range"
          min="0"
          max={Math.max(total, 1)}
          step="0.1"
          value={Math.min(current, Math.max(total, 1))}
          disabled={!src}
          onChange={(event) => {
            const next = Number(event.target.value);
            setCurrent(next);
            if (audio.current) audio.current.currentTime = next;
          }}
        />
      </div>
      <span className="audio-time">{src ? `${formatClock(current)} / ${total > 0 ? formatClock(total) : job?.duration || "--:--"}` : "Ses önizleme yalnızca yerel dosyada"}</span>
      <SvgIcon name="sound" className="sound-icon" />
      <input className="volume-range" aria-label="Ses seviyesi" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); if (audio.current) audio.current.volume = next; }} />
    </div>
  );
}

function ChoiceCard({ title, items, selected, onSelect }: { title: string; items: typeof qualities; selected: string; onSelect: (value: string) => void }) {
  return <div className="glass-card option-card"><h3>{title}</h3><div className="choice-row">{items.map((item) => <button key={item.label} className={selected === item.label ? "selected" : ""} onClick={() => onSelect(item.label)}><SvgIcon name={item.icon} /><b>{item.label}</b><small>({item.detail})</small></button>)}</div></div>;
}

function LanguageCard({ selected, onSelect }: { selected: Language; onSelect: (value: Language) => void }) {
  return <div className="glass-card option-card"><h3>Dil</h3><div className="choice-row languages">{languages.map((item) => <button key={item.label} className={selected === item.label ? "selected" : ""} onClick={() => onSelect(item.label)}>{item.icon ? <img src={item.icon} alt="" /> : <SvgIcon name={item.symbol!} />}<b>{item.label}</b></button>)}</div></div>;
}

function AdvancedCard({ settings, setSettings }: { settings: AppSettings; setSettings: (settings: AppSettings) => void }) {
  return <div className="glass-card advanced-card"><h3>Gelişmiş Ayarlar</h3><Toggle label="Zaman damgaları" checked={settings.timestamps} onChange={(checked) => setSettings({ ...settings, timestamps: checked })} /><Toggle label="Ses efektleri" checked={settings.soundEffects} onChange={(checked) => setSettings({ ...settings, soundEffects: checked })} /><Toggle label="Animasyonlar" checked={settings.animations} onChange={(checked) => setSettings({ ...settings, animations: checked })} /><Toggle label="Metni otomatik düzelt" checked={settings.autoCorrect} onChange={(checked) => setSettings({ ...settings, autoCorrect: checked })} /></div>;
}

function Toggle({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="toggle-row"><span><b>{label}</b>{sub && <small>{sub}</small>}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>;
}

function SoundRow({ settings, label }: { settings: AppSettings; label: string }) {
  return <div className="sound-row"><span>{label}</span><button className="ghost-btn" onClick={() => playUiSound(settings, label)}>Test Et</button><div className="mini-wave" /></div>;
}

function StatusPill({ status }: { status: string }) {
  const icon: IconName = status === "Tamamlandı" ? "check" : status === "Hata" ? "warning" : status === "Bekliyor" ? "clock" : "info";
  return <span className={`status-pill ${status.toLowerCase().replace("ı", "i")}`}><SvgIcon name={icon} /> {status}</span>;
}

function Summary({ value, label }: { value: number; label: string }) {
  return <div className="summary"><b>{value}</b><span>{label}</span></div>;
}

function pageTitle(page: Page) {
  if (page === "queue") return "Dönüştürme Kuyruğu";
  if (page === "settings") return "Ayarlar";
  if (page === "help") return "Yardım";
  return "My Sesi Metne Dönüştürme";
}

function pageSubtitle(page: Page) {
  if (page === "queue") return "Dosyalarınız işleniyor";
  if (page === "settings") return "Uygulamayı ihtiyaçlarınıza göre düzenleyin";
  if (page === "help") return "Uygulamayı kullanırken ihtiyacınız olan bilgiler";
  return "Ses ve videolarınızı hızlıca metne dönüştürün";
}

function newJobFromFile(file: MediaFile, settings: AppSettings): JobRecord {
  return {
    id: crypto.randomUUID(),
    sourcePath: file.path,
    sourceType: "file",
    name: file.name,
    format: file.format,
    sizeText: file.sizeText,
    duration: file.duration,
    durationSeconds: file.durationSeconds,
    quality: settings.defaultQuality,
    language: settings.defaultLanguage,
    status: "Bekliyor",
    stage: "Bekliyor",
    progress: 0,
    remaining: "Bekliyor",
    transcript: "",
    outputFiles: {},
    createdAt: new Date().toISOString()
  };
}

function newJobFromYoutube(info: YouTubeInfo, settings: AppSettings): JobRecord {
  return {
    id: crypto.randomUUID(),
    sourcePath: info.url,
    sourceType: "youtube",
    name: info.title,
    format: "YouTube",
    sizeText: "-",
    duration: info.duration,
    durationSeconds: 0,
    quality: settings.defaultQuality,
    language: settings.defaultLanguage,
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

function toFileUrl(filePath: string) {
  return `file:///${filePath.replace(/\\/g, "/").replace(/^\/+/, "")}`;
}

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function readError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function playUiSound(settings: AppSettings, _name: string) {
  if (!settings.soundEffects) return;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 660;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.2);
}

createRoot(document.getElementById("root")!).render(<App />);
