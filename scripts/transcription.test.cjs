const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseSrtSegments, renderTranscript } = require('../dist-electron/main/transcription.js');
const { readStereoRms, stereoCancellationChannel } = require('../dist-electron/main/audio-preparation.js');

test('numeric spoken text survives SRT index parsing and millisecond timestamps remain exact', () => {
  const segments = parseSrtSegments('1\r\n00:00:01,230 --> 00:00:02,980\r\n2026\r\n\r\n2\r\n00:00:03,450 --> 00:00:05,010\r\n17\r\nkişi konuştu.\r\n');
  assert.deepEqual(segments, [
    { start: 1.23, end: 2.98, text: '2026' },
    { start: 3.45, end: 5.01, text: '17 kişi konuştu.' }
  ]);
  assert.equal(renderTranscript(segments, true), '[00:00:01] 2026\n[00:00:03] 17 kişi konuştu.');
  assert.equal(renderTranscript(segments, false), '2026\n17 kişi konuştu.');
});

test('raw segment case, accents and punctuation are preserved without automatic correction', () => {
  const [segment] = parseSrtSegments('\uFEFF1\n00:00:00.125 --> 00:00:01.875\niPhone 3.14, ç ğ ı İ ö ş ü; Größe 2026.\n');
  assert.equal(segment.start, 0.125);
  assert.equal(segment.end, 1.875);
  assert.equal(segment.text, 'iPhone 3.14, ç ğ ı İ ö ş ü; Größe 2026.');
});

test('malformed timestamps and negative intervals do not create invented segments', () => {
  assert.deepEqual(parseSrtSegments('1\n00:70:00,000 --> 00:70:01,000\nbad\n\n2\n00:00:03,000 --> 00:00:02,000\nbackwards\n\n3\nnot a time\n2026\n'), []);
});

test('only severe measured anti-phase cancellation selects the stronger channel', () => {
  const result = stereoCancellationChannel({ leftDb: -25, rightDb: -25, mixedDb: -Infinity });
  assert.equal(result.channel, 0);
  assert.equal(result.correlation, -1);
  const left = 10 ** (-25.2 / 10), right = 10 ** (-25 / 10);
  const mixedDb = 10 * Math.log10((Math.sqrt(left) - Math.sqrt(right)) ** 2 / 4);
  assert.equal(stereoCancellationChannel({ leftDb: -25.2, rightDb: -25, mixedDb }).channel, 1);
});

test('in-phase, independent/alternating channels, silence and incomplete analysis retain normal mono mixing', () => {
  for (const levels of [
    { leftDb: -25, rightDb: -25, mixedDb: -25 },
    { leftDb: -25, rightDb: -25, mixedDb: -28.01029995664 },
    { leftDb: -90, rightDb: -90, mixedDb: -Infinity },
    undefined
  ]) assert.equal(stereoCancellationChannel(levels), undefined);
  assert.equal(readStereoRms('partial diagnostic output'), undefined);
});
