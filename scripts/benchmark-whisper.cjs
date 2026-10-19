// Offline, sequential real-model benchmark. Fixtures and full evidence stay in
// ignored build/whisper-benchmarks; no model, thresholds or production settings
// are changed by this script. Build TypeScript first: npm run build.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { parseSrtSegments } = require('../dist-electron/main/transcription.js');
const root = path.resolve(__dirname, '..');
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const rescoreFile = option('rescore');
const output = path.resolve(rescoreFile ? path.dirname(rescoreFile) : option('output') || path.join(root, 'build', 'whisper-benchmarks', new Date().toISOString().replace(/[:.]/g, '-')));
const selectedCases = option('cases')?.split(',');
const selectedVariants = (option('variants') || 'baseline,no-prompt').split(',');
const tools = path.join(root, 'Tools');
const model = path.join(tools, 'models', 'ggml-large-v2-q5_0.bin');
const ffmpeg = path.join(tools, 'ffmpeg', 'ffmpeg.exe');
const ffprobe = path.join(tools, 'ffmpeg', 'ffprobe.exe');
const whisper = path.join(tools, 'whisper', 'whisper-cli.exe');
const input = path.join(root, 'build', 'real-media-tests', 'input');
const threads = Math.max(2, Math.min(8, os.cpus().length - 1));
const normalization = 'aresample=async=1:first_pts=0,loudnorm=I=-18:LRA=11:TP=-1.5';
const prompts = {
  en: 'Speech recording. Transcribe faithfully. Do not invent unclear parts.',
  de: 'Deutsche Sprachaufnahme. Gesprochene Wörter originalgetreu transkribieren. Unverständliche Stellen nicht erfinden.',
  tr: 'Türkçe konuşma kaydı. Konuşulan kelimeleri olduğu gibi yaz. Türkçe karakterleri doğru kullan. Anlaşılmayan bölümleri uydurma.'
};
const variants = {
  baseline: { prompt: true, extra: [] },
  'no-prompt': { prompt: false, extra: [] },
  'no-context': { prompt: false, extra: ['--max-context', '0'] }
};
const report = {
  startedAt: new Date().toISOString(), model: 'Whisper Large-v2 q5_0', whisperVersion: '1.9.2', threads,
  audioPreparation: { sampleRate: 16000, channels: 1, codec: 'pcm_s16le', filter: normalization },
  decoding: { beamSize: 6, bestOf: 6, temperature: 'upstream default 0 with 0.2 fallback', noSpeechThreshold: 'upstream default 0.6', vad: false },
  sourceNotes: {
    english: 'Existing en_us.wav is known-text SAPI speech; transformed recordings remain synthetic, not a natural-speech evaluation set.',
    turkishGerman: 'Existing tr_tr.wav and de_de.wav natural-speech samples; FIRST reference line *_0000 only.',
    nasa: 'Existing official NASA recording. If nasa-reference.en.vtt exists, uploader-provided English subtitles supply an independent reference after removing speaker labels and non-speech notes. They are not manually re-audited. Otherwise WER is deliberately omitted.',
    wer: 'Case/punctuation normalized Levenshtein WER; digit versus spelled-out number differences remain orthographic errors. Deletions are alignment edits, not proof of acoustic omission.',
    coverage: 'Known construction windows bound complete utterances and include their internal silence. Uncovered seconds are timing diagnostics, not independently annotated frame-level speech or forced alignment.'
  },
  sources: ['https://github.com/ggml-org/whisper.cpp/blob/v1.9.2/examples/cli/cli.cpp', 'https://github.com/openai/whisper/blob/v20250625/whisper/transcribe.py'],
  fixtures: [], results: []
};
function save() { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
function run(exe, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(exe, args, { cwd, windowsHide: true });
    let stdout = '', stderr = '';
    const timeout = setTimeout(() => child.kill(), 20 * 60 * 1000);
    child.stdout.on('data', data => { stdout += data.toString('utf8'); });
    child.stderr.on('data', data => { stderr += data.toString('utf8'); });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', status => {
      clearTimeout(timeout);
      if (status !== 0) reject(new Error(`${path.basename(exe)} exit ${status}: ${stderr || stdout}`));
      else resolve({ stdout, stderr, seconds: (Date.now() - started) / 1000 });
    });
  });
}
async function duration(file) {
  const result = await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nokey=1:noprint_wrappers=1', file]);
  return Number(result.stdout.trim());
}
async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const data of fs.createReadStream(file)) hash.update(data);
  return hash.digest('hex');
}
function tokens(text, language) {
  return text.normalize('NFKC').toLocaleLowerCase(language === 'tr' ? 'tr-TR' : 'en-US').replace(/['’]/g, '').match(/[\p{L}\p{N}]+/gu) || [];
}
function errorRate(reference, transcript, language) {
  if (reference === null) return null;
  const expected = tokens(reference, language), actual = tokens(transcript, language);
  let row = Array.from({ length: actual.length + 1 }, (_, i) => ({ cost: i, substitutions: 0, deletions: 0, insertions: i }));
  for (let i = 1; i <= expected.length; i++) {
    const next = [{ cost: i, substitutions: 0, deletions: i, insertions: 0 }];
    for (let j = 1; j <= actual.length; j++) {
      if (expected[i - 1] === actual[j - 1]) next[j] = { ...row[j - 1] };
      else {
        const candidates = [
          { ...row[j - 1], cost: row[j - 1].cost + 1, substitutions: row[j - 1].substitutions + 1 },
          { ...row[j], cost: row[j].cost + 1, deletions: row[j].deletions + 1 },
          { ...next[j - 1], cost: next[j - 1].cost + 1, insertions: next[j - 1].insertions + 1 }
        ];
        next[j] = candidates.sort((a, b) => a.cost - b.cost)[0];
      }
    }
    row = next;
  }
  return { referenceWords: expected.length, hypothesisWords: actual.length, ...row[actual.length], wer: expected.length ? row[actual.length].cost / expected.length : null };
}
function coverage(windows, segments) {
  return windows.map(window => {
    const intersections = segments.map(segment => [Math.max(window.start, segment.start), Math.min(window.end, segment.end)])
      .filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
    let covered = 0, end = window.start;
    for (const [start, finish] of intersections) { covered += Math.max(0, finish - Math.max(start, end)); end = Math.max(end, finish); }
    return { ...window, completelyUncovered: intersections.length === 0, uncoveredBoundingSeconds: Math.max(0, window.end - window.start - covered) };
  });
}
function captionReference(file) {
  if (!fs.existsSync(file)) return null;
  const segments = parseSrtSegments(fs.readFileSync(file, 'utf8')).map(segment => ({
    ...segment,
    text: segment.text.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').replace(/<[^>]*>/g, '').replace(/^\s*-\s*/, '').replace(/\s+/g, ' ').trim()
  })).filter(segment => /[\p{L}\p{N}]/u.test(segment.text));
  return { text: segments.map(segment => segment.text).join(' '), windows: segments.map(({ start, end }) => ({ start, end })), source: 'https://www.youtube.com/watch?v=1UaBgr_sq9A (uploader English captions; no automatic-caption track)' };
}
async function fixtures() {
  const directory = path.join(output, 'fixtures');
  fs.mkdirSync(directory, { recursive: true });
  const en = path.join(input, 'en_us.wav'), tr = path.join(input, 'tr_tr.wav'), de = path.join(input, 'de_de.wav');
  for (const file of [en, tr, de]) if (!fs.existsSync(file)) throw new Error(`Real test input missing: ${file}`);
  const enText = 'Hello. This is a local speech transcription test. The program converts audio into text without an internet connection.';
  const trText = fs.readFileSync(path.join(input, 'tr_tr.trans.txt'), 'utf8').split(/\r?\n/)[0].replace(/^\S+\s+/, '');
  const deText = fs.readFileSync(path.join(input, 'de_de.trans.txt'), 'utf8').split(/\r?\n/)[0].replace(/^\S+\s+/, '');
  const enSeconds = await duration(en), trSeconds = await duration(tr), deSeconds = await duration(de);
  const cases = [
    { id: 'clear-en', file: en, language: 'en', reference: enText, windows: [{ start: 0, end: enSeconds }] },
    { id: 'clear-tr', file: tr, language: 'tr', reference: trText, windows: [{ start: 0, end: trSeconds }] },
    { id: 'clear-de', file: de, language: 'de', reference: deText, windows: [{ start: 0, end: deSeconds }] }
  ];
  for (const [id, filter, speed] of [['quiet-tr', 'volume=0.015848931924611134', 1], ['fast-tr', 'atempo=1.6', 1.6]]) {
    const file = path.join(directory, `${id}.wav`);
    await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', tr, '-af', filter, '-c:a', 'pcm_f32le', file]);
    cases.push({ id, file, language: 'tr', reference: trText, transform: filter, windows: [{ start: 0, end: trSeconds / speed }] });
  }
  for (const [id, repeats, pause] of [['pauses-en', 2, 14], ['long-en', 6, 2.25], ['long-tr-180', 13, 1]]) {
    const source = id === 'long-tr-180' ? tr : en;
    const sourceSeconds = id === 'long-tr-180' ? trSeconds : enSeconds;
    const reference = id === 'long-tr-180' ? trText : enText;
    const padded = path.join(directory, `${id}-padded.wav`);
    await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', source, '-af', `apad=pad_dur=${pause}`, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', padded]);
    const list = path.join(directory, `${id}-concat.txt`);
    fs.writeFileSync(list, Array.from({ length: repeats }, () => `file '${padded.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
    const file = path.join(directory, `${id}.wav`);
    await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'pcm_s16le', file]);
    cases.push({ id, file, language: id === 'long-tr-180' ? 'tr' : 'en', reference: Array(repeats).fill(reference).join(' '), optional: id === 'long-tr-180', transform: `${repeats} complete utterances; ${pause}s trailing silence each`, windows: Array.from({ length: repeats }, (_, i) => ({ start: i * (sourceSeconds + pause), end: i * (sourceSeconds + pause) + sourceSeconds })) });
  }
  const nasa = path.join(root, 'build', 'real-media-tests', 'youtube', 'nasa-60-seconds.mp3');
  const caption = captionReference(path.join(path.dirname(nasa), 'nasa-reference.en.vtt'));
  if (fs.existsSync(nasa)) cases.push({ id: 'nasa-diagnostic', file: nasa, language: 'en', reference: caption?.text || null, referenceSource: caption?.source, windows: caption?.windows || [] });
  for (const item of cases) { item.seconds = await duration(item.file); item.sha256 = await sha256(item.file); }
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(cases, null, 2));
  return cases.filter(item => selectedCases ? selectedCases.includes(item.id) : !item.optional);
}
async function benchmark(item, variantId) {
  const variant = variants[variantId];
  if (!variant) throw new Error(`Unknown variant: ${variantId}`);
  const directory = path.join(output, `${item.id}-${variantId}`);
  fs.mkdirSync(directory, { recursive: true });
  const prepared = path.join(directory, 'input_16k.wav');
  await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-nostdin', '-probesize', '50M', '-analyzeduration', '100M', '-i', item.file, '-vn', '-sn', '-dn', '-map', '0:a:0', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-sample_fmt', 's16', '-af', normalization, '-f', 'wav', prepared]);
  const junction = path.join(directory, 'model');
  fs.symlinkSync(path.dirname(model), junction, process.platform === 'win32' ? 'junction' : 'dir');
  const args = ['-m', path.join('model', path.basename(model)), '-f', 'input_16k.wav', '-of', 'transcript', '-otxt', '-osrt', '-t', String(threads), '-bs', '6', '-bo', '6', '-l', item.language, '--print-progress', ...variant.extra];
  if (variant.prompt) args.push('--prompt', prompts[item.language], '--carry-initial-prompt');
  let processResult;
  try { processResult = await run(whisper, args, directory); }
  finally { fs.rmSync(junction, { recursive: true, force: true }); }
  fs.writeFileSync(path.join(directory, 'process.log'), `${processResult.stdout}\n${processResult.stderr}`, 'utf8');
  const srt = fs.readFileSync(path.join(directory, 'transcript.srt'), 'utf8');
  const segments = parseSrtSegments(srt), transcript = segments.map(segment => segment.text).join(' ');
  const result = { case: item.id, variant: variantId, seconds: processResult.seconds, realTimeFactor: processResult.seconds / item.seconds, args, transcript, segments, wordErrors: errorRate(item.reference, transcript, item.language), expectedUtteranceWindows: coverage(item.windows, segments) };
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2));
  report.results.push(result); save();
  console.log(`WHISPER_BENCH|${item.id}|${variantId}|seconds=${result.seconds.toFixed(1)}|wer=${result.wordErrors ? (100 * result.wordErrors.wer).toFixed(2) + '%' : 'no-independent-reference'}|deleted=${result.wordErrors?.deletions ?? 'n/a'}|uncovered=${result.expectedUtteranceWindows.filter(window => window.completelyUncovered).length}`);
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  if (rescoreFile) {
    Object.assign(report, JSON.parse(fs.readFileSync(path.resolve(rescoreFile), 'utf8')));
    const caption = captionReference(path.join(root, 'build', 'real-media-tests', 'youtube', 'nasa-reference.en.vtt'));
    for (const fixture of report.fixtures) {
      if (fixture.id === 'nasa-diagnostic' && caption) Object.assign(fixture, { reference: caption.text, referenceSource: caption.source, windows: caption.windows });
    }
    for (const result of report.results) {
      const fixture = report.fixtures.find(item => item.id === result.case);
      const prepared = path.join(output, `${result.case}-${result.variant}`, 'input_16k.wav');
      const audioInfo = JSON.parse((await run(ffprobe, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration', '-of', 'json', prepared])).stdout);
      result.preparedAudio = { ...audioInfo.streams[0], durationSeconds: Number(audioInfo.format.duration), sourceSeconds: fixture.seconds, durationDifferenceSeconds: Number(audioInfo.format.duration) - fixture.seconds };
      if (result.preparedAudio.sample_rate !== '16000' || result.preparedAudio.channels !== 1 || result.preparedAudio.codec_name !== 'pcm_s16le') throw new Error(`Unexpected prepared WAV format: ${prepared}`);
      result.wordErrors = errorRate(fixture.reference, result.transcript, fixture.language);
      result.expectedUtteranceWindows = coverage(fixture.windows, result.segments);
      if (fixture.language === 'tr') {
        // Secondary diagnostic only: the natural Turkish reference spells
        // "on yedi", while Whisper writes the equivalent numeral "17".
        result.numberFormNormalizedWordErrors = errorRate(fixture.reference.replace(/\b17\b/g, 'on yedi'), result.transcript.replace(/\b17\b/g, 'on yedi'), fixture.language);
      }
      fs.writeFileSync(path.join(output, `${result.case}-${result.variant}`, 'result.json'), JSON.stringify(result, null, 2));
    }
    report.rescoredAt = new Date().toISOString();
    report.sourceNotes.nasa = 'Independent uploader English captions downloaded from the separate subtitles.en track, not automatic captions. Speaker labels and non-speech notes removed; no manual re-audit. Existing decoder output rescored without inference.';
    report.sourceNotes.numberForms = 'Secondary Turkish metric expands only the known equivalent numeral 17 to the reference form on yedi. Strict WER remains unchanged and primary.';
    save();
    for (const result of report.results) console.log(`WHISPER_RESCORE|${result.case}|${result.variant}|wer=${result.wordErrors ? (result.wordErrors.wer * 100).toFixed(2) : 'n/a'}|deletions=${result.wordErrors?.deletions ?? 'n/a'}|insertions=${result.wordErrors?.insertions ?? 'n/a'}`);
    return;
  }
  report.modelSha256 = await sha256(model);
  report.help = (await run(whisper, ['--help'])).stderr;
  report.fixtures = await fixtures(); save();
  if (process.argv.includes('--prepare-only')) return;
  // Deliberately sequential: concurrent CPU inference changes throughput and
  // makes noisy comparisons harder to interpret.
  for (const item of report.fixtures) for (const variant of selectedVariants) await benchmark(item, variant);
  report.finishedAt = new Date().toISOString(); report.status = 'complete'; save();
  console.log(`WHISPER_BENCH_COMPLETE|${path.join(output, 'report.json')}`);
}
module.exports = { errorRate, coverage, captionReference, run, normalization, prompts };
if (require.main === module) main().catch(error => { report.status = 'failed'; report.error = error.stack || error.message; save(); console.error(error.stack || error.message); process.exitCode = 1; });
