import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSearchIntent, normalizeSearchText, planSearchQueries } from '../src/lib/web-intelligence.ts';

test('search commands are removed from the subject', () => {
  const intent = analyzeSearchIntent('Keress rá a neten aktívan ki most Magyarország miniszterelnöke');
  assert.equal(intent.search_required, true);
  assert.match(intent.subject, /Magyarország/);
  assert.doesNotMatch(intent.subject, /aktívan$/i);
});

test('follow-up searches inherit conversational context', () => {
  const intent = analyzeSearchIntent('Keress rá aktívan ki az', ['Ki Magyarország jelenlegi miniszterelnöke?']);
  assert.equal(intent.search_required, true);
  assert.match(intent.subject, /Ki Magyarország/);
  assert.doesNotMatch(intent.subject, /aktívan/i);
});

test('definition requests do not become forced web searches', () => {
  const intent = analyzeSearchIntent('aktívan jelentése');
  assert.equal(intent.search_required, false);
});

test('arbitrary current domains generate planned queries', () => {
  const intent = analyzeSearchIntent('Keress rá mi tortent OpenAI al ma');
  const plan = planSearchQueries(intent);
  assert.equal(intent.search_required, true);
  assert.match(plan.primary_query, /OpenAI/i);
  assert.ok(plan.alternative_queries.length > 0);
});

test('normalization tolerates explicit commands and spacing', () => {
  assert.equal(normalizeSearchText('nézz utána   OpenAI legújabb modell'), 'OpenAI legújabb modell');
});

test('current product and software questions search without subject hacks', () => {
  for (const query of ['Nézz utána mennyi az iPhone ára Magyarországon', 'Melyik Python verzió a legfrissebb?']) {
    assert.equal(analyzeSearchIntent(query).search_required, true);
  }
});

test('stable definitions remain eligible for model knowledge', () => {
  assert.equal(analyzeSearchIntent('Mi az a fotoszintézis?').search_required, false);
});

test('unknown domains still route to general research', () => {
  const intent = analyzeSearchIntent('Keress rá erre a furcsa új témára');
  assert.equal(intent.search_required, true);
  assert.equal(intent.intent_type, 'current_information');
});

test('mixed Hungarian and English is searchable', () => {
  const intent = analyzeSearchIntent('search latest OpenAI model ma');
  assert.equal(intent.search_required, true);
  assert.match(planSearchQueries(intent).primary_query, /OpenAI/i);
});

test('explicit verification forces search for arbitrary claims', () => {
  assert.equal(analyzeSearchIntent('Ellenőrizd online ezt a statisztikát').search_required, true);
});

test('entities are preserved during planning', () => {
  const intent = analyzeSearchIntent('Keress rá a Neurix Lyra 3 verziójára');
  assert.match(planSearchQueries(intent).primary_query, /Neurix.*Lyra/i);
});
