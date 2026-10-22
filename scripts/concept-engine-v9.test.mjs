import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyConnection,
  computeScore,
  buildReport,
} from './concept-engine-v9.mjs';

test('scenario metadata takes priority and returns a comparison candidate', () => {
  assert.equal(
    classifyConnection({
      scenarioComparison: { eligible: true },
      mechanismEvidenceCandidates: [],
    }),
    'scenario-comparison-candidate',
  );
});

test('one mechanism evidence candidate enters the review queue', () => {
  assert.equal(
    classifyConnection({
      scenarioComparison: { eligible: false },
      mechanismEvidenceCandidates: [{ type: 'military-campaign', sharedTerms: ['campaign'] }],
    }),
    'mechanism-review-candidate',
  );
});

test('a shared pattern without shared specific evidence does not qualify', () => {
  assert.equal(
    classifyConnection({
      scenarioComparison: { eligible: false },
      mechanismEvidenceCandidates: [],
    }),
    null,
  );
});

test('lexical overlap alone does not qualify as an article connection', () => {
  assert.equal(
    classifyConnection({
      scenarioComparison: { eligible: false },
      mechanismEvidenceCandidates: [],
    }),
    null,
  );
});

test('score is a ranking value and gives scenario candidates the configured base', () => {
  assert.equal(
    computeScore({
      reviewClass: 'scenario-comparison-candidate',
      sharedEvidenceTerms: [],
      independentEvidenceSignals: [],
      hasEvidenceInBothArticles: false,
    }),
    2,
  );
});

test('generated suggestions remain unpublished and unapproved', () => {
  const base = {
    sector: 'history',
    description: '',
    tags: [],
    topics: ['alternate history'],
    explicitEntityIds: [],
    matchedEntities: [],
    candidateConcepts: [],
    tokens: [],
    searchable: '',
    sentences: [],
    entityIds: ['shared-entity'],
  };
  const articles = [
    {
      ...base,
      id: 'scenario-a',
      title: 'Scenario A',
      path: 'src/content/history/scenario-a.md',
      worldId: 'shared-world',
      divergenceId: 'divergence-a',
    },
    {
      ...base,
      id: 'scenario-b',
      title: 'Scenario B',
      path: 'src/content/history/scenario-b.md',
      worldId: 'shared-world',
      divergenceId: 'divergence-b',
    },
  ];

  const report = buildReport(articles, []);
  assert.equal(report.schemaVersion, 10);
  assert.equal(report.reports.approvedConnections.length, 0);
  assert.ok(report.reports.articleConnections.length >= 1);
  for (const suggestion of report.reports.articleConnections) {
    assert.equal(suggestion.publication.status, 'not-published');
    assert.equal(suggestion.publication.publishedInGraphAt, null);
    assert.equal(suggestion.editorialReview.outcome, 'unreviewed');
  }
});