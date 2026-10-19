const percentFormat = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });

export function progressValue(value: unknown, status: string): number {
  if (status === "Tamamlandı") return 100;
  const finite = typeof value === "number" && Number.isFinite(value) ? value : 0;
  // A progress event is not the completed transcript response. Keep the label
  // and bar below 100 until the actual job status confirms completion.
  return Math.min(99.99, Math.round(Math.max(0, finite) * 100) / 100);
}

export function formatProgress(value: unknown, status: string): string {
  return `${percentFormat.format(progressValue(value, status))}%`;
}

export function seekTime(seconds: unknown, duration?: number): number {
  const finite = typeof seconds === "number" && Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return Number.isFinite(duration) && duration! > 0 ? Math.min(finite, duration!) : finite;
}

export function timestampSeconds(value: string): number | undefined {
  if (!/^\d{1,3}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?$/.test(value)) return undefined;
  const parts = value.replace(",", ".").split(":").map(Number);
  const seconds = parts[parts.length - 1];
  const minutes = parts[parts.length - 2];
  if (seconds >= 60 || (parts.length === 3 && minutes >= 60)) return undefined;
  return parts.length === 3 ? parts[0] * 3600 + minutes * 60 + seconds : minutes * 60 + seconds;
}

export interface TranscriptLine {
  original: string;
  leading?: string;
  timestamp?: string;
  separator?: string;
  seconds?: number;
  text: string;
}

export function transcriptLines(transcript: string, segments?: { start: number; end: number; text: string }[]): TranscriptLine[] {
  const lines = transcript.split(/\r?\n/);
  return lines.map((line, index) => {
    const match = /^(\s*)\[([^\]]+)\]([\t ]*)(.*)$/.exec(line);
    const parsed = match ? timestampSeconds(match[2]) : undefined;
    if (!match || parsed === undefined) return { original: line, text: line };
    const segment = segments?.length === lines.length ? segments[index] : undefined;
    const precise = segment && Number.isFinite(segment.start) && segment.start >= 0 && Number.isFinite(segment.end) && segment.end >= segment.start
      ? segment.start : parsed;
    return { original: line, leading: match[1], timestamp: `[${match[2]}]`, separator: match[3], seconds: precise, text: match[4] };
  });
}
import type { AppSettings, JobRecord } from "./types";


export function createRerunJob(job: JobRecord, settings: AppSettings): JobRecord {
  const { transcript: _transcript, rawTranscript: _rawTranscript, segments: _segments, detectedLanguage: _detectedLanguage,
    outputFiles: _outputFiles, error: _error, warning: _warning, completedAt: _completedAt, ...source } = job;
  return {
    ...source,
    id: crypto.randomUUID(),
    quality: settings.defaultQuality,
    language: settings.defaultLanguage,
    status: "Bekliyor",
    progress: 0,
    stage: "Bekliyor",
    remaining: "Bekliyor",
    transcript: "",
    outputFiles: {},
    createdAt: new Date().toISOString()
  };
}
