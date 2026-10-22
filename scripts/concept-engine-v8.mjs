
/**
 * HAD IT GONE — Concept Engine v5
 *
 * Deterministic article-connection discovery with sentence-level evidence.
 * No external API. Never modifies source content or content-graph.json.
 *
 * Run from the project root:
 *   node scripts/concept-engine-v8.mjs
 *
 * Output:
 *   src/data/concept-engine-v5-report.json
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';

import {
  basename,
  dirname,
  extname,
  join,
  relative,
} from 'node:path';

import { fileURLToPath } from 'node:url';   
import { parse as parseYaml } from 'yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_ROOT = join(ROOT, 'src', 'content');
const REGISTRY_FILE = join(ROOT, 'src', 'data', 'entities.yaml');
const OUTPUT_FILE = join(
  ROOT,
  'src',
  'data',
  'concept-engine-v8-report.json'
);

const SECTORS = ['history', 'science', 'space', 'society'];

const MIN_TOKEN_LENGTH = 3;
const MAX_LEXICAL_EVIDENCE = 10;
const MAX_QUOTES_PER_ARTICLE = 3;
const MAX_QUOTE_LENGTH = 280;
const MAX_SUGGESTIONS = 120;

const STOPWORDS = new Set(`
a an the and or but if then than of in on at by for from to with without
into over under between among through across after before during within
about against as is are was were be been being it its this that these
those their they them he she his her we our you your not no do does did
can could may might will would should have has had also more most such
same other another very only much many some any each both all own per
via what when where who why how there here now later earlier even still
war wars history historical world worlds century centuries thing things
way ways time times one two first second new old great major important
possible different people man men years year made make became become
known called use used result results perhaps however therefore because
`.trim().split(/\s+/));

const GENERIC_TERMS = new Set(`
war wars empire empires power history historical world worlds country
countries state states people society civilization civilizations europe
european ancient modern army armies battle battles conflict conflicts
political politics military change changes result results impact effects
system systems global humanity human
`.trim().split(/\s+/));

/*
 * Matching patterns are review signals, not proof of a relationship.
 * A mechanism is shared only when a matching phrase occurs in a sentence
 * in BOTH articles.
 */
const MECHANISM_PATTERNS = [
  {
    type: 'political-succession',
    label: 'succession or transfer of political authority',
    re: /\b(succession|successor|heir to the throne|inherit(?:ed|s|ing)? the throne|dynastic succession|line of succession|abdicated|abdication|regime change)\b/i,
  },
  {
    type: 'trade-route-control',
    label: 'trade routes or control of commercial access',
    re: /\b(trade route|trading route|control of (?:the )?(?:trade|routes|straits|ports)|maritime trade|shipping lane|commercial access|trade blockade|blockade of (?:the )?(?:port|ports|coast))\b/i,
  },
  {
    type: 'military-campaign',
    label: 'a campaign, invasion, siege, or battlefield outcome',
    re: /\b(military campaign|campaign in|invasion of|invaded by|siege of|decisive battle|battle of|defeated at|victory at|retreated from|occupation of)\b/i,
  },
  {
    type: 'knowledge-institutions',
    label: 'preservation or transmission of knowledge through institutions',
    re: /\b(preservation of knowledge|preserved knowledge|transmission of knowledge|scholarly institution|cent(?:re|er) of learning|library of|loss of manuscripts|preserved manuscripts|scientific learning)\b/i,
  },
  {
    type: 'technology-diffusion',
    label: 'invention, adoption, or diffusion of technology',
    re: /\b(technology spread|spread of technology|diffusion of technology|adoption of (?:the )?(?:technology|invention)|invented independently|industrial production|technological breakthrough|development of the engine)\b/i,
  },
  {
    type: 'environmental-habitability',
    label: 'environmental conditions affecting habitability or survival',
    re: /\b(planetary habitability|habitable conditions|surface temperature|atmospheric pressure|liquid water on|loss of atmosphere|climate conditions|environmental conditions for life|mass extinction)\b/i,
  },
  {
    type: 'diplomacy-treaties',
    label: 'diplomatic settlement, treaty, or alliance formation',
    re: /\b(peace treaty|signed a treaty|treaty with|military alliance|formed an alliance|diplomatic recognition|peace negotiations|negotiated settlement|alliance between)\b/i,
  },
  {
    type: 'migration-settlement',
    label: 'migration, colonization, or population settlement',
    re: /\b(migration of|migrated to|settlement of|settled in|population movement|waves of migration|colonial settlement|resettlement of|diaspora of)\b/i,
  },
  {
    type: 'religious-cultural-change',
    label: 'religious conversion or institutional cultural change',
    re: /\b(religious conversion|converted to|spread of christianity|spread of islam|religious institution|cultural assimilation|language shift|adoption of a new religion)\b/i,
  },
];

function walk(dir) {
  if (!existsSync(dir)) return [];

  const files = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (extname(entry).toLowerCase() === '.md') {
      files.push(full);
    }
  }

  return files.sort();
}

function readFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (!match) return { data: {}, body: content };

  try {
    return {
      data: parseYaml(match[1]) ?? {},
      body: content.slice(match[0].length),
    };
  } catch (error) {
    console.warn(`Could not parse frontmatter: ${error.message}`);

    return {
      data: {},
      body: content.slice(match[0].length),
    };
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanMarkdown(value) {
  return String(value ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}>.*$/gm, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/[*_~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentences(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'(])/u)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length >= 35);
}

function tokenize(value) {
  return unique(
    normalize(value)
      .split(' ')
      .filter(token =>
        token.length >= MIN_TOKEN_LENGTH &&
        !STOPWORDS.has(token) &&
        !/^\d+$/.test(token)
      )
  );
}

function makeArticleId(frontmatter, file) {
  return String(frontmatter.id ?? basename(file, extname(file)));
}

function readEntityRegistry() {
  if (!existsSync(REGISTRY_FILE)) {
    console.warn('Entity registry not found; entity matching is disabled.');
    return [];
  }

  const parsed = parseYaml(readFileSync(REGISTRY_FILE, 'utf8'));
  const records = Array.isArray(parsed) ? parsed : asArray(parsed?.entities);

  return records
    .filter(entity => entity?.id)
    .map(entity => ({
      id: String(entity.id),
      name: String(entity.name ?? entity.title ?? entity.label ?? entity.id),
      aliases: asArray(entity.aliases).map(String),
    }));
}

function buildEntityTerms(entities) {
  return entities
    .flatMap(entity =>
      [entity.name, ...entity.aliases]
        .filter(Boolean)
        .map(term => ({
          entityId: entity.id,
          entityName: entity.name,
          term,
          normalized: normalize(term),
        }))
    )
    .filter(item => item.normalized.length >= 3)
    .sort((a, b) => b.normalized.length - a.normalized.length);
}

function findEntityMentions(text, entityTerms) {
  const found = new Map();

  for (const term of entityTerms) {
    const pattern = new RegExp(`(^| )${escapeRegExp(term.normalized)}( |$)`);

    if (pattern.test(text) && !found.has(term.entityId)) {
      found.set(term.entityId, {
        entityId: term.entityId,
        name: term.entityName,
        matchedTerm: term.term,
        method: 'literal-name-or-alias-match',
      });
    }
  }

  return [...found.values()];
}

function extractConcepts(frontmatter, body, path) {
  const concepts = new Map();

  const add = (label, source) => {
    const normalized = normalize(label);

    if (
      !normalized ||
      normalized.length < 3 ||
      normalized.split(' ').length > 7
    ) {
      return;
    }

    if (!concepts.has(normalized)) {
      concepts.set(normalized, {
        label: String(label).trim(),
        normalized,
        sources: [],
        articles: [],
      });
    }

    const item = concepts.get(normalized);

    if (!item.sources.includes(source)) item.sources.push(source);
    if (!item.articles.includes(path)) item.articles.push(path);
  };

  for (const tag of asArray(frontmatter.tags)) {
    if (typeof tag === 'string') {
      add(tag.replace(/[-_]/g, ' '), 'frontmatter:tag');
    }
  }

  for (const topic of asArray(frontmatter.topics ?? frontmatter.topic)) {
    if (typeof topic === 'string') {
      add(topic.replace(/[-_]/g, ' '), 'frontmatter:topic');
    }
  }

  // v5 deliberately excludes headings: generic editorial headings
  // produced too many low-value standalone concepts in v4.

  return [...concepts.values()];
}

function readArticles() {
  const entityIndex = readEntityRegistry();
  const entityTerms = buildEntityTerms(entityIndex);
  const articles = [];

  for (const sector of SECTORS) {
    const sectorRoot = join(CONTENT_ROOT, sector);

    for (const file of walk(sectorRoot)) {
      const raw = readFileSync(file, 'utf8');
      const { data: fm, body } = readFrontmatter(raw);

      const path = relative(ROOT, file).replace(/\\/g, '/');
      const id = makeArticleId(fm, file);
      const title = String(fm.title ?? id);
      const description = String(fm.description ?? '');
      const cleanBody = cleanMarkdown(body);

      const searchable = normalize([title, description, cleanBody].join(' '));

      const tags = unique(
        asArray(fm.tags)
          .filter(value => typeof value === 'string')
          .map(normalize)
          .filter(Boolean)
      );

      const topics = unique(
        asArray(fm.topics ?? fm.topic)
          .filter(value => typeof value === 'string')
          .map(normalize)
          .filter(Boolean)
      );

      const explicitEntityIds = unique(
        asArray(fm.entities)
          .map(value => typeof value === 'string' ? value : value?.id)
          .filter(Boolean)
          .map(String)
      );

      const tokens = tokenize([title, description, cleanBody].join(' '));

      articles.push({
        id,
        sector,
        title,
        path,
        description,
        tags,
        topics,
        explicitEntityIds,
        matchedEntities: findEntityMentions(searchable, entityTerms),
        candidateConcepts: extractConcepts(fm, body, path),
        tokens,
        searchable,
        sentences: splitSentences(cleanBody),
      });
    }
  }

  return { articles, entityIndex };
}

function intersection(a, b) {
  const setB = new Set(b);
  return a.filter(value => setB.has(value));
}

function lexicalEvidence(a, b, documentFrequency, articleCount) {
  const common = intersection(a.tokens, b.tokens)
    .filter(token => !GENERIC_TERMS.has(token));

  const ranked = common
    .map(term => ({
      term,
      idf: Math.log(
        1 + articleCount / (1 + (documentFrequency.get(term) ?? 0))
      ),
    }))
    .sort((x, y) => y.idf - x.idf || x.term.localeCompare(y.term));

  const selected = ranked.slice(0, MAX_LEXICAL_EVIDENCE);

  return {
    terms: selected.map(item => item.term),
    weight: selected.reduce((sum, item) => sum + item.idf, 0),
  };
}

function buildDocumentFrequency(articles) {
  const df = new Map();

  for (const article of articles) {
    for (const token of article.tokens) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }

  return df;
}

function getMechanismEvidence(article, mechanismType) {
  const pattern = MECHANISM_PATTERNS.find(item => item.type === mechanismType);

  if (!pattern) return [];

  return article.sentences
    .filter(sentence => pattern.re.test(sentence))
    .slice(0, MAX_QUOTES_PER_ARTICLE)
    .map(sentence => ({
      text: sentence.slice(0, MAX_QUOTE_LENGTH),
      matchedTerms: [],
      mechanismSignals: [mechanismType],
      evidenceKind: 'sentence-level-mechanism-keyword',
    }));
}

function mechanismEvidence(a, b) {
  const aByType = new Map();
  const bByType = new Map();

  for (const pattern of MECHANISM_PATTERNS) {
    const aQuotes = getMechanismEvidence(a, pattern.type);
    const bQuotes = getMechanismEvidence(b, pattern.type);

    if (aQuotes.length) aByType.set(pattern.type, aQuotes);
    if (bQuotes.length) bByType.set(pattern.type, bQuotes);
  }

  const shared = MECHANISM_PATTERNS
    .filter(pattern => aByType.has(pattern.type) && bByType.has(pattern.type))
    .map(pattern => ({
      type: pattern.type,
      label: pattern.label,
      evidenceA: aByType.get(pattern.type),
      evidenceB: bByType.get(pattern.type),
      evidenceStatus: 'keyword-supported-in-both-articles-not-semantically-verified',
    }));

  return {
    sharedMechanisms: shared,
    articleA: MECHANISM_PATTERNS
      .filter(pattern => aByType.has(pattern.type))
      .map(pattern => ({ type: pattern.type, label: pattern.label })),
    articleB: MECHANISM_PATTERNS
      .filter(pattern => bByType.has(pattern.type))
      .map(pattern => ({ type: pattern.type, label: pattern.label })),
    note: 'A shared category means a matching phrase occurs in at least one sentence in each article. It does not establish that the passages describe the same causal process.',
  };
}


function classifyConnection({
  sharedMechanisms,
  lexical,
  evidenceSpecificity,
}) {
  // A mechanism is only a review candidate, never a verified link.
  if (
    sharedMechanisms.length > 0 &&
    evidenceSpecificity >= 2
  ) {
    return 'mechanism-review-candidate';
  }

  // Lexical overlap remains a discovery lead, not a conceptual claim.
  if (lexical.terms.length >= 5) {
    return 'lexical-similarity-only';
  }

  return null;
}

function buildArticleConnections(articles) {
  const df = buildDocumentFrequency(articles);
  const suggestions = [];

  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const a = articles[i];
      const b = articles[j];

      const sharedEntityRecords = a.matchedEntities.filter(entity =>
        b.matchedEntities.some(other => other.entityId === entity.entityId)
      );

      const sharedEntities = sharedEntityRecords.map(entity => entity.entityId);
      const sharedTopics = intersection(a.topics, b.topics);
      const sharedTags = intersection(a.tags, b.tags);
      const lexical = lexicalEvidence(a, b, df, articles.length);
      const mechanisms = mechanismEvidence(a, b);

      const sharedMechanismTypes = mechanisms.sharedMechanisms.map(item => item.type);

      const evidenceA = unique(
        sharedMechanismTypes.flatMap(type =>
          getMechanismEvidence(a, type).map(quote => quote.text)
        )
      )
        .slice(0, MAX_QUOTES_PER_ARTICLE)
        .map(text => ({
          text,
          matchedTerms: [],
          mechanismSignals: MECHANISM_PATTERNS
            .filter(pattern => pattern.re.test(text))
            .map(pattern => pattern.type),
          evidenceKind: 'sentence-level-mechanism-keyword',
        }));

      const evidenceB = unique(
        sharedMechanismTypes.flatMap(type =>
          getMechanismEvidence(b, type).map(quote => quote.text)
        )
      )
        .slice(0, MAX_QUOTES_PER_ARTICLE)
        .map(text => ({
          text,
          matchedTerms: [],
          mechanismSignals: MECHANISM_PATTERNS
            .filter(pattern => pattern.re.test(text))
            .map(pattern => pattern.type),
          evidenceKind: 'sentence-level-mechanism-keyword',
        }));
      
      // Ranking score only. It is not a probability or truth score.
        // Generic mechanism matches are weak signals, not proof of a conceptual link.
        const evidenceTokensA = new Set(
        evidenceA.flatMap(item => tokenize(item.text))
        );

        const evidenceTokensB = new Set(
        evidenceB.flatMap(item => tokenize(item.text))
        );

        const sharedEvidenceTerms = intersection(
        [...evidenceTokensA],
        [...evidenceTokensB]
        ).filter(term => !GENERIC_TERMS.has(term));

        const evidenceSpecificity = Math.min(sharedEvidenceTerms.length, 4);

        const quality = classifyConnection({
        sharedEntities,
        sharedMechanisms: mechanisms.sharedMechanisms,
        lexical,
        evidenceSpecificity,
        });

        if (!quality) continue;
        
      
    const score =
        (quality === 'mechanism-review-candidate' ? 2 : 0) +
        Math.min(evidenceSpecificity, 4) * 0.75 +
        Math.min(lexical.weight, 4) * 0.1 +
        (evidenceA.length && evidenceB.length ? 0.5 : 0) +
        Math.min(sharedMechanismTypes.length, 2) * 0.25;

      const reviewQuestions = [
        'Do the quoted passages describe the same process, rather than merely using related vocabulary?',
        'Can an editor explain the conceptual link in one specific sentence without relying on shared names or metadata?',
      ];

      if (sharedEntities.length) {
        reviewQuestions.push(
          'Are the shared entities central to both scenarios, rather than incidental mentions?'
        );
      }

      if (quality === 'lexical-similarity-only') {
        reviewQuestions.push(
          'Is there a concrete shared concept beyond overlapping words? If not, reject the suggestion.'
        );
      }

      suggestions.push({
        from: {
          id: a.id,
          sector: a.sector,
          title: a.title,
          path: a.path,
        },
        to: {
          id: b.id,
          sector: b.sector,
          title: b.title,
          path: b.path,
        },
        score: Number(score.toFixed(2)),
        reviewClass: quality,
        proposedRelation: mechanisms.sharedMechanisms.length
          ? 'sentence-level-mechanism-hypothesis'
          : 'lexical-similarity',
        evidence: {
          sharedEntities: sharedEntityRecords.map(entity => ({
            id: entity.entityId,
            name: entity.name,
          })),
          sharedTopics,
          sharedTags,
          sharedLexicalTerms: lexical.terms,
          sharedEvidenceTerms,
          evidenceSpecificity,
          textEvidence: {
            fromArticle: evidenceA,
            toArticle: evidenceB,
          },
          mechanismSignals: mechanisms,
          explanation: mechanisms.sharedMechanisms.length
            ? [
                'Both articles contain at least one sentence matching the same specific keyword-pattern category. The quotes make the signal inspectable; an editor must still verify that the process is genuinely comparable.',
              ]
            : [
                'Only lexical overlap was detected. This is not evidence of a conceptual or causal relationship.',
              ],
        },
        reviewQuestions,
        editorialReview: {
          outcome: 'unreviewed',
          allowedOutcomes: ['accept', 'reject', 'needs-review'],
          reviewerNote: '',
        },
        relationshipType: 'EDITORIAL_CONCEPTUAL_CANDIDATE',
        status: 'suggested-not-verified',
        reviewRequired: true,
      });
    }
  }
  
    const rank = {
        'mechanism-review-candidate': 0,
        'lexical-similarity-only': 1,
    };

  suggestions.sort((a, b) =>
    rank[a.reviewClass] - rank[b.reviewClass] ||
    b.score - a.score ||
    a.from.title.localeCompare(b.from.title)
  );

  return suggestions.slice(0, MAX_SUGGESTIONS);
}

function buildConceptReport(articles, entityIndex) {
  const conceptMap = new Map();

  for (const article of articles) {
    for (const candidate of article.candidateConcepts) {
      const key = candidate.normalized;

      if (!conceptMap.has(key)) {
        conceptMap.set(key, {
          label: candidate.label,
          normalized: key,
          sources: [],
          articles: [],
        });
      }

      const target = conceptMap.get(key);

      for (const source of candidate.sources) {
        if (!target.sources.includes(source)) target.sources.push(source);
      }

      if (!target.articles.includes(article.path)) {
        target.articles.push(article.path);
      }
    }
  }

  const existingEntityNames = new Set(
    entityIndex
      .flatMap(entity => [entity.name, ...entity.aliases])
      .map(normalize)
  );

  return [...conceptMap.values()]
    .map(concept => ({
      ...concept,
      matchesExistingEntity: existingEntityNames.has(concept.normalized),
      kind: existingEntityNames.has(concept.normalized)
        ? 'existing-entity'
        : 'metadata-concept',
      reviewPriority: concept.articles.length >= 3
        ? 'high'
        : concept.articles.length === 2
          ? 'medium'
          : 'low',
    }))
    .sort((a, b) =>
      b.articles.length - a.articles.length ||
      a.label.localeCompare(b.label)
    );
}

function main() {
  if (!existsSync(CONTENT_ROOT)) {
    throw new Error(`Content directory not found: ${CONTENT_ROOT}`);
  }

  const { articles, entityIndex } = readArticles();
  const candidateConcepts = buildConceptReport(articles, entityIndex);
  const articleLinkSuggestions = buildArticleConnections(articles);

  const counts = {};

  for (const suggestion of articleLinkSuggestions) {
    counts[suggestion.reviewClass] =
      (counts[suggestion.reviewClass] ?? 0) + 1;
  }

  const report = {
    schemaVersion: 8,
    generatedAt: new Date().toISOString(),
    mode: 'deterministic-comparison-review-v8',
    limitations: [
      'This engine uses deterministic keyword, entity, and metadata heuristics; it does not understand article meaning as a human or semantic model would.',
      'A shared mechanism category means matching phrases occur in sentences in both articles; it does not prove that they describe the same process.',
      'Quoted passages are selected by keyword-pattern matches and may not support a meaningful conceptual relationship; editorial review is mandatory.',
      'Shared entities, tags, and topics are context only and cannot independently qualify a conceptual connection.',
      'Lexical-only suggestions are low-priority review leads, not conceptual links.',
      'Literal entity matching may miss inflected forms, spelling variants, and ambiguous names.',
      'Scores rank review priority and are not probabilities, confidence values, or truth scores.',
      'Editorial review outcomes are placeholders for a human benchmark; they are not automatically inferred.',
      'No source content, entity registry, or content-graph file is modified.',
    ],
    stats: {
      articlesAnalyzed: articles.length,
      registeredEntities: entityIndex.length,
      entityArticlesMatched: articles.filter(
        article => article.matchedEntities.length > 0
      ).length,
      entityMatchCount: articles.reduce(
        (total, article) => total + article.matchedEntities.length,
        0
      ),
      candidateConcepts: candidateConcepts.length,
      articleLinkSuggestions: articleLinkSuggestions.length,
      reviewClassCounts: counts,
      editorialReviewOutcomes: {
        accept: 0,
        reject: 0,
        needsReview: 0,
        unreviewed: articleLinkSuggestions.length,
      },
    },
    reports: {
      conceptCandidates: candidateConcepts,
      articleConnections: articleLinkSuggestions,
      reviewQueue: articleLinkSuggestions,
    },
    candidateConcepts,
    articles: articles.map(({ tokens, searchable, sentences, ...article }) => article),
    articleLinkSuggestions,
  };

  writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(report, null, 2) + '\n',
    'utf8'
  );

  console.log('\nHAD IT GONE Concept Engine v8 report complete.');
  console.log(`Articles analyzed: ${report.stats.articlesAnalyzed}`);
  console.log(`Registered entities: ${report.stats.registeredEntities}`);
  console.log(`Entity matches: ${report.stats.entityMatchCount}`);
  console.log(`Candidate concepts: ${report.stats.candidateConcepts}`);
  console.log(`Article link suggestions: ${report.stats.articleLinkSuggestions}`);

  for (const [name, count] of Object.entries(counts).sort(
    (a, b) => a[0].localeCompare(b[0])
  )) {
    console.log(`  ${name}: ${count}`);
  }

  console.log(`Output: ${relative(ROOT, OUTPUT_FILE)}`);
}

main();