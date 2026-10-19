export type Quality = "Hızlı" | "Dengeli" | "Yüksek Doğruluk";
export type Language = "Otomatik" | "Türkçe" | "İngilizce" | "Almanca";
export type JobStatus = "Bekliyor" | "İşleniyor" | "Tamamlandı" | "Hata" | "İptal Edildi" | "Durduruldu";

export interface AppSettings {
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
  channel: string;
  thumbnail: string;
}

export interface JobRecord {
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
  detectedLanguage?: string;
  status: JobStatus;
  stage: string;
  progress: number;
  remaining: string;
  transcript: string;
  rawTranscript?: string;
  segments?: { start: number; end: number; text: string }[];
  outputFiles: {
    pdf?: string;
    docx?: string;
    txt?: string;
  };
  createdAt: string;
  completedAt?: string;
  error?: string;
  warning?: string;
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
  getPathForFile(file: File): string;
  inspectMediaFiles(paths: string[]): Promise<{ files: MediaFile[]; errors: string[] }>;
  prepareAudio(sourceType: "file" | "youtube", sourcePath: string): Promise<string>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  resetSettings(): Promise<AppSettings>;
  getHistory(): Promise<JobRecord[]>;
  saveHistory(jobs: JobRecord[]): Promise<boolean>;
  getYouTubeInfo(url: string): Promise<YouTubeInfo>;
  transcribe(job: JobRecord, settings: AppSettings): Promise<JobRecord>;
  cancelTranscription(jobId: string): Promise<boolean>;
  exportFile(payload: ExportPayload): Promise<{ path?: string; canceled?: boolean }>;
  revealPath(path: string): Promise<boolean>;
  playSound(name: string): Promise<boolean>;
  onProgress(callback: (payload: { id: string; progress: number; stage: string; remaining: string }) => void): () => void;
}

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}
