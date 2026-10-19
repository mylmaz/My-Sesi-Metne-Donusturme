export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

function srtSeconds(value: string): number | undefined {
  const match = /^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/.exec(value);
  if (!match) return undefined;
  const [, hours, minutes, seconds, fraction] = match;
  if (Number(minutes) >= 60 || Number(seconds) >= 60) return undefined;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(fraction.padEnd(3, "0")) / 1000;
}

export function parseSrtSegments(content: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  for (const block of content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const lines = block.split("\n").map(line => line.trim());
    const timingIndex = lines.findIndex(line => /^\d+:\d{2}:\d{2}[,.]\d{1,3}\s*-->/.test(line));
    if (timingIndex < 0) continue;
    const timing = /^(\S+)\s*-->\s*(\S+)/.exec(lines[timingIndex]);
    if (!timing) continue;
    const start = srtSeconds(timing[1]);
    const end = srtSeconds(timing[2]);
    // Only the pre-timing line is an SRT index. A numeric spoken segment such
    // as "2026" after the timing line is actual transcription and must remain.
    const text = lines.slice(timingIndex + 1).filter(Boolean).join(" ");
    if (start === undefined || end === undefined || end < start || !text) continue;
    segments.push({ start, end, text });
  }
  return segments;
}

export function renderTranscript(segments: TranscriptSegment[], timestamps: boolean): string {
  return segments.map(segment => {
    if (!timestamps) return segment.text;
    const seconds = Math.floor(segment.start);
    const stamp = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map(part => String(part).padStart(2, "0")).join(":");
    return `[${stamp}] ${segment.text}`;
  }).join("\n");
}
