export type Quality = "Hızlı" | "Dengeli" | "Yüksek Doğruluk";
export type Language = "Otomatik" | "Türkçe" | "Kürtçe" | "İngilizce";
export type JobStatus = "Bekliyor" | "İşleniyor" | "Tamamlandı" | "Hata" | "İptal Edildi" | "Durduruldu";

export interface AppSettings {
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

export interface MediaFile {
  path: string;
  name: string;
  format: string;
  sizeText: string;
  duration: string;
  durationSeconds: number;
}

export interface YouTubeInfo {
  url: string;
  title: string;
  duration: string;
  durationSeconds?: number;
  previewPath?: string;
  format?: string;
  sizeText?: string;
  channel: string;
  thumbnail: string;
}

export interface JobRecord {
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
  outputFiles: {
    pdf?: string;
    docx?: string;
    txt?: string;
  };
  createdAt: string;
  completedAt?: string;
  error?: string;
  thumbnail?: string;
  channel?: string;
}

export interface ExportPayload {
  type: "pdf" | "docx" | "txt";
  job: JobRecord;
  settings: AppSettings;
}

export interface DesktopApi {
  chooseMediaFiles(): Promise<MediaFile[]>;
  inspectMediaFiles(paths: string[]): Promise<MediaFile[]>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  resetSettings(): Promise<AppSettings>;
  getHistory(): Promise<JobRecord[]>;
  saveHistory(jobs: JobRecord[]): Promise<boolean>;
  getYouTubeInfo(url: string): Promise<YouTubeInfo>;
  prepareYouTubeAudio(url: string, jobId?: string): Promise<MediaFile>;
  transcribe(job: JobRecord, settings: AppSettings): Promise<JobRecord>;
  cancelTranscription(jobId: string): Promise<boolean>;
  exportFile(payload: ExportPayload): Promise<{ path: string }>;
  revealPath(path: string): Promise<boolean>;
  openDiagnostics(): Promise<boolean>;
  onProgress(callback: (payload: { id: string; progress: number; stage: string; remaining: string }) => void): () => void;
}

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}
