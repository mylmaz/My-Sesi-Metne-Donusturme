const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');
const { test } = require('node:test');

// Compile the pure renderer module in memory; no browser, build output or app
// state is involved in checking locale formatting and legacy transcript parsing.
const file = path.join(__dirname, 'presentation.ts');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const loaded = new Module(file, module);
loaded._compile(compiled, file);
const { progressValue, formatProgress, seekTime, timestampSeconds, transcriptLines, createRerunJob } = loaded.exports;

test('Turkish progress uses bounded shared labels without early completion', () => {
  for (const value of [99.999999, 100, 120, Number.MAX_VALUE]) {
    assert.equal(progressValue(value, 'İşleniyor'), 99.99);
    assert.equal(formatProgress(value, 'İşleniyor'), '99,99%');
  }
  assert.equal(formatProgress(12.3456, 'İşleniyor'), '12,35%');
  assert.equal(formatProgress(0, 'İşleniyor'), '0%');
  assert.equal(formatProgress(25, 'İşleniyor'), '25%');
  assert.equal(formatProgress(63.940000000000005, 'İşleniyor'), '63,94%');
  assert.equal(formatProgress(87.04, 'İşleniyor'), '87,04%');
  assert.equal(formatProgress(0, 'Tamamlandı'), '100%');
  assert.equal(progressValue(100, 'Hata'), 99.99);
  for (const value of [NaN, Infinity, -Infinity, undefined, null, '43', -10]) assert.equal(formatProgress(value, 'İşleniyor'), '0%');
});

test('timestamps retain hour/minute boundaries and fractional source precision', () => {
  assert.equal(timestampSeconds('00:25'), 25);
  assert.equal(timestampSeconds('01:25'), 85);
  assert.equal(timestampSeconds('00:01:25'), 85);
  assert.equal(timestampSeconds('00:01:25,250'), 85.25);
  assert.equal(timestampSeconds('01:02:03.450'), 3723.45);
  assert.equal(timestampSeconds('02:03,125'), 123.125);
  assert.equal(timestampSeconds('80:10'), 4810);
  for (const invalid of ['00:60:00', '00:01:60', 'metin', '-01:00', '1:2', '00:00:01.1234']) assert.equal(timestampSeconds(invalid), undefined);
  const source = '[00:00:00] İlk satır\n  [00:01:02]  İkinci satır\nZaman damgasız metin';
  const lines = transcriptLines(source);
  assert.deepEqual(lines.map(line => line.seconds), [0, 62, undefined]);
  assert.equal(lines.map(line => line.timestamp ? `${line.leading}${line.timestamp}${line.separator}${line.text}` : line.text).join('\n'), source);
  const precise = transcriptLines('[00:00:01] Merhaba', [{ start: 1.725, end: 3, text: 'Merhaba' }]);
  assert.equal(precise[0].seconds, 1.725);
  assert.equal(transcriptLines('[00:00:01] Merhaba', [{ start: NaN, end: 3, text: 'Merhaba' }])[0].seconds, 1);
  assert.equal(transcriptLines('[00:60:01] Eski kayıt')[0].timestamp, undefined);
});

test('seek positions never leave the real media duration', () => {
  assert.equal(seekTime(120, 90), 90);
  assert.equal(seekTime(5.625, 90), 5.625);
  assert.equal(seekTime(-5, 90), 0);
  assert.equal(seekTime(20, NaN), 20);
  for (const invalid of [NaN, Infinity, undefined, '12']) assert.equal(seekTime(invalid, 90), 0);
});

test('reruns keep the source and current choices without carrying old results', () => {
  const original = { id: 'old', sourcePath: 'C:\\ses.wav', sourceType: 'file', name: 'Kayıt.wav', quality: 'Hızlı', language: 'Türkçe',
    status: 'Tamamlandı', progress: 100, stage: 'Tamamlandı', remaining: '-', transcript: 'Eski metin', rawTranscript: 'Eski ham metin',
    segments: [{ start: 1.25, end: 3, text: 'Eski metin' }], detectedLanguage: 'tr', outputFiles: { pdf: 'C:\\eski.pdf' },
    error: 'Eski hata', warning: 'Eski uyarı', completedAt: '2020-01-01', createdAt: '2020-01-01' };
  const snapshot = structuredClone(original);
  const rerun = createRerunJob(original, { defaultQuality: 'Yüksek Doğruluk', defaultLanguage: 'Almanca' });
  assert.notEqual(rerun.id, original.id);
  assert.equal(rerun.sourcePath, original.sourcePath);
  assert.equal(rerun.quality, 'Yüksek Doğruluk');
  assert.equal(rerun.language, 'Almanca');
  assert.equal(rerun.status, 'Bekliyor');
  assert.equal(rerun.progress, 0);
  assert.equal(rerun.transcript, '');
  assert.deepEqual(rerun.outputFiles, {});
  for (const property of ['rawTranscript', 'segments', 'detectedLanguage', 'error', 'warning', 'completedAt']) assert.equal(rerun[property], undefined);
  assert.deepEqual(original, snapshot);
});
