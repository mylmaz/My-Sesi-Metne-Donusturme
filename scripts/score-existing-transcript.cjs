// Scores an already-recognized real result; never starts Electron or Whisper.
// node scripts/score-existing-transcript.cjs <evidence.json> [fixture-id] [output.json]
const fs = require('node:fs');
const path = require('node:path');
const { errorRate, coverage } = require('./benchmark-whisper.cjs');
const root = path.resolve(__dirname, '..');
const evidenceFile = process.argv[2];
if (!evidenceFile) throw new Error('Kullanım: node scripts/score-existing-transcript.cjs <evidence.json> [long-tr-180] [output.json]');
const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
// The installed UI runner deliberately preserves the genuine model result here
// BEFORE it constructs a separately labelled multi-page export stress fixture.
const completed = evidence.completed || evidence.result;
if (!completed || completed.status !== 'Tamamlandı') throw new Error('Kanıtta gerçek tamamlanmış model sonucu bulunamadı.');
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'build', 'real-media-tests', 'quality-fixtures', 'fixtures', 'manifest.json'), 'utf8'));
const fixture = fixtures.find(item => item.id === (process.argv[3] || 'long-tr-180'));
if (!fixture || !fixture.reference) throw new Error('Bağımsız referans içeren test kaydı bulunamadı.');
const segments = Array.isArray(completed.segments) ? completed.segments : [];
const text = segments.length ? segments.map(segment => segment.text).join(' ') : (completed.rawTranscript || completed.transcript).replace(/^\[\d+:\d{2}:\d{2}(?:[,.]\d+)?\]\s*/gm, '');
const score = {
  scoredAt: new Date().toISOString(), method: 'Post-analysis only; original completed model result; no fresh inference and no export-stress repetitions',
  evidence: path.relative(root, path.resolve(evidenceFile)), fixture: fixture.id, fixtureSeconds: fixture.seconds, fixtureSha256: fixture.sha256,
  quality: completed.quality, requestedLanguage: completed.language, detectedLanguage: completed.detectedLanguage,
  transcript: text, wordErrors: errorRate(fixture.reference, text, fixture.language),
  expectedUtteranceWindows: segments.length ? coverage(fixture.windows, segments) : null,
  limitations: [
    'Case/punctuation normalized orthographic WER; edit deletions are not proof of acoustic omissions.',
    'Construction windows contain internal silence; time coverage is not frame-level annotated speech or forced alignment.',
    'A controlled repeated natural utterance is not an independent natural three-minute conversation.'
  ]
};
if (fixture.language === 'tr') score.numberFormNormalizedWordErrors = errorRate(fixture.reference.replace(/\b17\b/g, 'on yedi'), text.replace(/\b17\b/g, 'on yedi'), 'tr');
const target = path.resolve(process.argv[4] || path.join(path.dirname(evidenceFile), 'quality-score.json'));
fs.writeFileSync(target, JSON.stringify(score, null, 2));
console.log(`EXISTING_TRANSCRIPT_SCORE|wer=${(score.wordErrors.wer * 100).toFixed(2)}%|words=${score.wordErrors.hypothesisWords}/${score.wordErrors.referenceWords}|fullyUncovered=${score.expectedUtteranceWindows?.filter(window => window.completelyUncovered).length ?? 'not-available'}|file=${target}`);
