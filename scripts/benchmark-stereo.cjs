// Controlled real-speech waveform test, serial native inference only.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { run, errorRate, normalization, prompts } = require('./benchmark-whisper.cjs');
const { readStereoRms, stereoCancellationChannel } = require('../dist-electron/main/audio-preparation.js');
const { parseSrtSegments } = require('../dist-electron/main/transcription.js');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'build', 'whisper-benchmarks', `stereo-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const ffmpeg = path.join(root, 'Tools', 'ffmpeg', 'ffmpeg.exe');
const source = path.join(root, 'build', 'real-media-tests', 'input', 'tr_tr.wav');
const other = path.join(root, 'build', 'real-media-tests', 'input', 'de_de.wav');
const reference = fs.readFileSync(path.join(path.dirname(source), 'tr_tr.trans.txt'), 'utf8').split(/\r?\n/)[0].replace(/^\S+\s+/, '');
const report = { startedAt: new Date().toISOString(), source, reference, note: 'Controlled transformations of one natural Turkish utterance. Alternating-channel control also uses a natural German utterance. No general real-world accuracy claim.', cases: [], inference: [] };
const save = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function prepare(input, file, prefix = '') {
  await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', input, '-map', '0:a:0', '-vn', '-sn', '-dn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-sample_fmt', 's16', '-af', `${prefix}${normalization}`, file]);
}
async function infer(name, file) {
  const dir = path.join(output, name);
  fs.mkdirSync(dir);
  fs.copyFileSync(file, path.join(dir, 'input.wav'));
  fs.symlinkSync(path.join(root, 'Tools', 'models'), path.join(dir, 'model'), 'junction');
  let result;
  try { result = await run(path.join(root, 'Tools', 'whisper', 'whisper-cli.exe'), ['-m', 'model/ggml-large-v2-q5_0.bin', '-f', 'input.wav', '-of', 'transcript', '-otxt', '-osrt', '-l', 'tr', '-t', '8', '-bs', '6', '-bo', '6', '--prompt', prompts.tr, '--carry-initial-prompt'], dir); }
  finally { fs.rmSync(path.join(dir, 'model'), { recursive: true, force: true }); }
  fs.writeFileSync(path.join(dir, 'process.log'), result.stdout + '\n' + result.stderr);
  const transcript = parseSrtSegments(fs.readFileSync(path.join(dir, 'transcript.srt'), 'utf8')).map(segment => segment.text).join(' ');
  const score = { name, transcript, seconds: result.seconds, wordErrors: errorRate(reference, transcript, 'tr') };
  report.inference.push(score); save();
  console.log(`STEREO_INFERENCE|${name}|wer=${score.wordErrors.wer * 100}%|transcript=${transcript}`);
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const fixtures = [];
  for (const [id, filter] of [
    ['in-phase', 'pan=stereo|c0=c0|c1=c0'],
    ['anti-phase', 'pan=stereo|c0=c0|c1=-1*c0'],
    ['right-stronger-anti-phase', 'pan=stereo|c0=0.95*c0|c1=-1*c0']
  ]) {
    const file = path.join(output, `${id}.wav`);
    await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', source, '-af', filter, '-c:a', 'pcm_f32le', file]);
    fixtures.push({ id, file });
  }
  const alternating = path.join(output, 'alternating-voices.wav');
  await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', source, '-i', other, '-filter_complex', '[0:a]pan=stereo|c0=c0|c1=0*c0[l];[1:a]pan=stereo|c0=0*c0|c1=c0[r];[l][r]concat=n=2:v=0:a=1[out]', '-map', '[out]', '-c:a', 'pcm_f32le', alternating]);
  fixtures.push({ id: 'alternating-voices', file: alternating });
  for (const fixture of fixtures) {
    const analyzed = await run(ffmpeg, ['-hide_banner', '-nostdin', '-i', fixture.file, '-map', '0:a:0', '-vn', '-sn', '-dn', '-af', 'pan=3c|c0=c0|c1=c1|c2=0.5*c0+0.5*c1,astats=metadata=0:reset=0', '-f', 'null', '-']);
    fs.writeFileSync(path.join(output, `${fixture.id}-analysis.log`), analyzed.stderr);
    const levels = readStereoRms(analyzed.stderr), decision = stereoCancellationChannel(levels);
    const baseline = path.join(output, `${fixture.id}-baseline.wav`), guarded = path.join(output, `${fixture.id}-guarded.wav`);
    await prepare(fixture.file, baseline);
    await prepare(fixture.file, guarded, decision ? `pan=mono|c0=c${decision.channel},` : '');
    const record = { ...fixture, levels: Object.fromEntries(Object.entries(levels).map(([key, value]) => [key, Number.isFinite(value) ? value : String(value)])), decision: decision ? { ...decision, cancellationDb: Number.isFinite(decision.cancellationDb) ? decision.cancellationDb : String(decision.cancellationDb) } : null, unchangedWithoutGuard: !decision ? hash(baseline) === hash(guarded) : null };
    report.cases.push(record); save();
    console.log(`STEREO_CONTROL|${fixture.id}|selected=${decision?.channel ?? 'normal-mix'}|unchanged=${record.unchangedWithoutGuard}`);
    if (!decision && !record.unchangedWithoutGuard) throw new Error(`Ordinary stereo mix changed: ${fixture.id}`);
    if (fixture.id === 'anti-phase') { await infer('anti-phase-baseline', baseline); await infer('anti-phase-guarded', guarded); }
  }
  report.status = 'complete'; report.finishedAt = new Date().toISOString(); save();
  console.log(`STEREO_BENCH_COMPLETE|${output}`);
})().catch(error => { report.status = 'failed'; report.error = error.stack || error.message; save(); console.error(error.stack || error.message); process.exitCode = 1; });
