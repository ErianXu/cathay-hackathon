const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTypes, planActivities, voiceErrorMessage } = require('../app.js');

test('recognizes simplified meal requests in spoken order', () => {
  assert.deepEqual(parseTypes('我想先洗澡，再吃饭，最后按摩', new Set()), ['shower', 'dining', 'massage']);
});

test('recognizes traditional and Cantonese meal wording', () => {
  assert.deepEqual(parseTypes('沖涼之後食飯', new Set()), ['shower', 'dining']);
  assert.deepEqual(parseTypes('我想食嘢', new Set()), ['dining']);
});

test('includes a meal selected through a quick action', () => {
  assert.deepEqual(parseTypes('', new Set(['dining'])), ['dining']);
  const { scheduled } = planActivities(['dining']);
  assert.deepEqual(scheduled.map((item) => item.type), ['dining', 'gate']);
  assert.equal(scheduled[0].start, '17:30');
  assert.equal(scheduled[0].end, '18:00');
});

test('reports a meal that cannot fit before boarding', () => {
  const { scheduled, omitted } = planActivities(['shower', 'massage', 'rest', 'work', 'dining']);
  assert.equal(scheduled.at(-1).type, 'gate');
  assert.ok(omitted.includes('dining'));
});

test('explains microphone and language failures', () => {
  assert.match(voiceErrorMessage('not-allowed'), /麥克風/);
  assert.match(voiceErrorMessage('language-not-supported'), /語言/);
});
