/**
 * Compare the concept-engine report against a small human-reviewed benchmark.
 * Read-only: never changes content, the graph, or the source report.
 *
 * Usage:
 *   node scripts/concept-engine-benchmark.mjs
 *   node scripts/concept-engine-benchmark.mjs --report path/to/report.json --benchmark path/to/benchmark.json --out path/to/result.json
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1]
    : fallback;
}

const reportPath = path.resolve(
  argValue('--report', 'src/data/concept-engine-v5-report.json'),
);
const benchmarkPath = path.resolve(
  argValue('--benchmark', 'src/data/concept-engine-benchmark.json'),
);
const outputPath = path.resolve(
  argValue('--out', 'src/data/concept-engine-benchmark-results.json'),
);

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Could not parse ${label} at ${filePath}: ${error.message}`,
    );
  }
}

function pairKey(a, b) {
  return [String(a), String(b)].sort().join('::');
}

function safeRate(numerator, denominator) {
  return denominator
    ? Number((numerator / denominator).toFixed(4))
    : null;
}

const report = readJson(reportPath, 'Concept-engine report');
const benchmark = readJson(benchmarkPath, 'Benchmark');

const suggestions = report.articleLinkSuggestions;
const articles = report.articles;
const items = benchmark.items;

if (!Array.isArray(suggestions)) {
  throw new Error('Report has no articleLinkSuggestions array.');
}

if (!Array.isArray(articles)) {
  throw new Error('Report has no articles array; cannot validate article IDs.');
}

if (!Array.isArray(items) || items.length === 0) {
  throw new Error('Benchmark has no items.');
}

// Validate article IDs independently from whether a pair was suggested.
const reportArticleIds = new Set(
  articles
    .map((article) => article?.id)
    .filter((id) => id !== undefined && id !== null)
    .map(String),
);

const suggestionsByPair = new Map();

for (const suggestion of suggestions) {
  const a = suggestion?.from?.id;
  const b = suggestion?.to?.id;

  if (a === undefined || a === null || b === undefined || b === null) {
    continue;
  }

  const key = pairKey(a, b);
  const existing = suggestionsByPair.get(key);

  if (
    !existing ||
    Number(suggestion.score ?? 0) > Number(existing.score ?? 0)
  ) {
    suggestionsByPair.set(key, suggestion);
  }
}

const duplicateBenchmarkIds = new Set();
const seenIds = new Set();
const seenPairs = new Set();
const duplicatePairs = [];
const missingArticleIds = new Set();

const outcomes = {
  accept: 0,
  reject: 0,
  'needs-review': 0,
};

const rows = [];

for (const item of items) {
  const benchmarkId = item.id;

  if (benchmarkId === undefined || benchmarkId === null || benchmarkId === '') {
    throw new Error('A benchmark item has no id.');
  }

  if (seenIds.has(benchmarkId)) {
    duplicateBenchmarkIds.add(benchmarkId);
  }

  seenIds.add(benchmarkId);

  if (!['accept', 'reject', 'needs-review'].includes(item.outcome)) {
    throw new Error(
      `Invalid outcome for ${benchmarkId}: ${item.outcome}`,
    );
  }

  if (
    item.a === undefined ||
    item.a === null ||
    item.b === undefined ||
    item.b === null
  ) {
    throw new Error(`Benchmark item ${benchmarkId} has no article pair.`);
  }

  outcomes[item.outcome] += 1;

  // Check whether each article exists in the report's article registry.
  for (const articleId of [item.a, item.b]) {
    if (!reportArticleIds.has(String(articleId))) {
      missingArticleIds.add(String(articleId));
    }
  }

  const key = pairKey(item.a, item.b);

  if (seenPairs.has(key)) {
    duplicatePairs.push({
      id: benchmarkId,
      pair: key,
    });
  }

  seenPairs.add(key);

  const suggestion = suggestionsByPair.get(key);

  rows.push({
    benchmarkId,
    a: item.a,
    b: item.b,
    humanOutcome: item.outcome,
    relationshipType: item.relationshipType ?? null,
    rationale: item.rationale ?? '',
    foundInReport: Boolean(suggestion),
    score: suggestion?.score ?? null,
    reviewClass: suggestion?.reviewClass ?? null,
    proposedRelation: suggestion?.proposedRelation ?? null,
    rankByScore: null,
    rankByScoreAndClass: null,
  });
}

// Rank all unique suggestions, not only benchmark items.
const rankedByScore = [...suggestionsByPair.entries()].sort(
  (a, b) =>
    Number(b[1].score ?? 0) - Number(a[1].score ?? 0) ||
    a[0].localeCompare(b[0]),
);

const classWeight = (value) =>
  value === 'mechanism-review-candidate' ? 1 : 0;

const rankedByScoreAndClass = [...suggestionsByPair.entries()].sort(
  (a, b) =>
    classWeight(b[1].reviewClass) - classWeight(a[1].reviewClass) ||
    Number(b[1].score ?? 0) - Number(a[1].score ?? 0) ||
    a[0].localeCompare(b[0]),
);

const scoreRanks = new Map(
  rankedByScore.map(([key], index) => [key, index + 1]),
);

const combinedRanks = new Map(
  rankedByScoreAndClass.map(([key], index) => [key, index + 1]),
);

for (const row of rows) {
  const key = pairKey(row.a, row.b);
  row.rankByScore = scoreRanks.get(key) ?? null;
  row.rankByScoreAndClass = combinedRanks.get(key) ?? null;
}

// A missing suggestion is not the same thing as a missing article.
const missingFromReport = rows
  .filter((row) => !row.foundInReport)
  .map((row) => row.benchmarkId);

// Binary metrics use only found accept/reject pairs.
// needs-review items are excluded, not treated as negatives.
const decisive = rows.filter(
  (row) =>
    row.foundInReport &&
    row.humanOutcome !== 'needs-review',
);

const accepted = decisive.filter(
  (row) => row.humanOutcome === 'accept',
);

const rejected = decisive.filter(
  (row) => row.humanOutcome === 'reject',
);

const topK = (k) => {
  const top = rows
    .filter((row) => row.foundInReport)
    .sort((a, b) => a.rankByScore - b.rankByScore)
    .slice(0, k);

  const relevant = top.filter(
    (row) => row.humanOutcome === 'accept',
  ).length;

  const labeledTop = top.filter(
    (row) => row.humanOutcome !== 'needs-review',
  );

  return {
    k,
    reviewedItemsInTopK: top.length,
    acceptedInTopK: relevant,
    precisionAmongLabeledItems: safeRate(
      labeledTop.filter((row) => row.humanOutcome === 'accept').length,
      labeledTop.length,
    ),
  };
};

const averageRank = (subset) =>
  subset.length
    ? Number(
        (
          subset.reduce((sum, row) => sum + row.rankByScore, 0) /
          subset.length
        ).toFixed(2),
      )
    : null;

const result = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  mode: 'read-only-editorial-benchmark',
  inputs: {
    reportPath,
    reportSchemaVersion: report.schemaVersion ?? null,
    reportMode: report.mode ?? null,
    benchmarkPath,
    benchmarkSchemaVersion: benchmark.schemaVersion ?? null,
  },
  summary: {
    reportSuggestions: suggestions.length,
    uniqueSuggestionPairs: suggestionsByPair.size,
    benchmarkItems: items.length,
    outcomes,
    foundInReport: rows.filter((row) => row.foundInReport).length,
    missingFromReport,
    averageRankByScore: {
      accept: averageRank(
        rows.filter(
          (row) => row.humanOutcome === 'accept' && row.foundInReport,
        ),
      ),
      reject: averageRank(
        rows.filter(
          (row) => row.humanOutcome === 'reject' && row.foundInReport,
        ),
      ),
      needsReview: averageRank(
        rows.filter(
          (row) =>
            row.humanOutcome === 'needs-review' && row.foundInReport,
        ),
      ),
    },
    topK: [topK(5), topK(10), topK(20)],
    decisiveLabelCoverage: decisive.length,
    acceptedItems: accepted.length,
    rejectedItems: rejected.length,
    note:
      'All-pairs engines can emit every possible pair, so presence/recall is not a quality measure here. Compare ranking and human decisions. needs-review is excluded from binary metrics. Missing suggestions are reported separately from missing article IDs. The benchmark is small and initially hand-labeled.',
  },
  validation: {
    duplicateBenchmarkIds: [...duplicateBenchmarkIds],
    duplicatePairs,
    missingArticleIds: [...missingArticleIds],
    missingSuggestionPairs: missingFromReport,
  },
  items: rows,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });

fs.writeFileSync(
  outputPath,
  `${JSON.stringify(result, null, 2)}\n`,
  'utf8',
);

console.log('Concept-engine benchmark completed (read-only comparison).');
console.log(
  `Report suggestions: ${suggestions.length} (${suggestionsByPair.size} unique pairs)`,
);
console.log(
  `Benchmark items: ${items.length}; found in report: ${result.summary.foundInReport}`,
);
console.log(
  `Editorial labels: accept=${outcomes.accept}, reject=${outcomes.reject}, needs-review=${outcomes['needs-review']}`,
);
console.log(
  `Average rank by score: accept=${result.summary.averageRankByScore.accept ?? 'n/a'}, reject=${result.summary.averageRankByScore.reject ?? 'n/a'}, needs-review=${result.summary.averageRankByScore.needsReview ?? 'n/a'}`,
);
console.log(`Missing suggestions: ${missingFromReport.length}`);
console.log(`Missing article IDs: ${missingArticleIds.size}`);
console.log(`Results written to: ${outputPath}`);

if (
  duplicateBenchmarkIds.size ||
  duplicatePairs.length ||
  missingArticleIds.size
) {
  console.error(
    'Warning: benchmark validation found duplicate IDs/pairs or article IDs absent from the report.',
  );
  process.exitCode = 1;
} else if (missingFromReport.length) {
  console.warn(
    'Note: some benchmark pairs were not suggested by the engine. This is recorded separately and is not an article-ID validation error.',
  );
}
