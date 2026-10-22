/**
 * HAD IT GONE — Concept Engine v10
 *
 * Deterministic article-connection discovery with inspectable evidence.
 * Keyword matches are candidates for editorial review, never proof.
 * Does not modify source content or content-graph.json.
 *
 * Run from project root:
 *   node scripts/concept-engine-v9.mjs
 *
 * Output:
 *   src/data/concept-engine-v9-report.json
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_ROOT = join(ROOT, 'src', 'content');
const REGISTRY_FILE = join(ROOT, 'src', 'data', 'entities.yaml');
const OUTPUT_FILE = join(ROOT, 'src', 'data', 'concept-engine-v9-report.json');
const CONCEPT_MODEL_FILE = join(
  ROOT,
  'src',
  'data',
  'concept-model-v1-report.json',
);

const SECTORS = ['history', 'science', 'space', 'society'];
const MIN_TOKEN_LENGTH = 3;
const MAX_LEXICAL_EVIDENCE = 10;
const MAX_QUOTES_PER_ARTICLE = 3;
const MAX_QUOTE_LENGTH = 280;
const MAX_SUGGESTIONS = 120;

// Initial ranking weights only. These are not calibrated probabilities.
// Do not use this score to auto-publish connections.
export const SCORE_CONFIG = Object.freeze({
  scenarioComparisonBase: 2.0,
  mechanismReviewBase: 1.5,
  sharedEvidenceTerm: 0.4,
  independentEvidenceSignal: 0.25,
  bothArticlesHaveEvidence: 0.5,
  maxEvidenceTerms: 4,
  maxIndependentSignals: 2,
});

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

export const GENERIC_TERMS = new Set(`
war wars empire empires power history historical world worlds country
countries state states people society civilization civilizations europe
european ancient modern army armies battle battles conflict conflicts
political politics military change changes result results impact effects
system systems global humanity human siege victory
`.trim().split(/\s+/));

// Trigger words identify a mechanism family, but cannot count as evidence that
// two passages describe the same concrete process.
const MECHANISM_TRIGGER_TERMS = new Set(`
  succession successor heir throne inherit inherited inheritance abdicated
  abdication regime change trade route trading maritime shipping lane
  commercial access blockade port ports campaign invasion invaded siege
  battle defeated victory retreated occupation preservation preserved
  transmission scholarly institution learning library manuscripts scientific
  technology spread diffusion adoption invention invented independently
  industrial production technological breakthrough development engine
  habitability habitable temperature atmospheric pressure liquid water
  atmosphere climate environmental extinction treaty alliance diplomatic
  recognition negotiations negotiated settlement migration migrated settlement
  settled population movement waves colonization colonial resettlement diaspora
  conversion converted christianity islam religious assimilation language
`.trim().split(/\s+/));

export const MIN_SHARED_MECHANISM_ANCHORS = 2;

export const MECHANISM_PATTERNS = [
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

export function normalize(value) {
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

export function tokenize(value) {
  return unique(
    normalize(value).split(' ').filter(token =>
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

      const entityIds = unique([
        ...explicitEntityIds,
        ...asArray(fm.entities)
          .filter(value => value && typeof value === 'object')
          .map(value => value.id)
          .filter(Boolean)
          .map(String),
      ]);

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
        tokens: tokenize([title, description, cleanBody].join(' ')),
        searchable,
        sentences: splitSentences(cleanBody),
        worldId: String(fm.world?.id ?? ''),
        divergenceId: String(fm.divergence?.id ?? ''),
        entityIds,
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

export function getMechanismEvidence(article, mechanismType) {
  const pattern = MECHANISM_PATTERNS.find(
    item => item.type === mechanismType
  );

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

export function getEntityEvidence(article, entity) {
  const terms = unique([
    entity?.name,
    entity?.matchedTerm,
  ])
    .map(term => normalize(term))
    .filter(term => term.length >= 3);

  if (terms.length === 0) return [];

  return article.sentences
    .filter(sentence => {
      const normalizedSentence = ` ${normalize(sentence)} `;

      return terms.some(term =>
        normalizedSentence.includes(` ${term} `)
      );
    })
    .slice(0, MAX_QUOTES_PER_ARTICLE)
    .map(text => ({
      text: text.slice(0, MAX_QUOTE_LENGTH),
      entityId: entity.entityId,
      entityName: entity.name,
      evidenceKind: 'sentence-level-entity-mention',
      evidenceStatus: 'direct-text-match-not-semantic-verification',
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
    .filter(pattern =>
      aByType.has(pattern.type) && bByType.has(pattern.type)
    )
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

function buildMechanismMap(article, sharedMechanismTypes) {
  const map = new Map();

  for (const type of sharedMechanismTypes) {
    const quotes = getMechanismEvidence(article, type);

    const terms = new Set(
      quotes
        .flatMap(quote => tokenize(quote.text))
        .filter(term =>
          !GENERIC_TERMS.has(term) &&
          !MECHANISM_TRIGGER_TERMS.has(term)
        )
    );

    map.set(type, { quotes, terms });
  }

  return map;
}

function scenarioComparisonEvidence(a, b) {
  const sameWorld =
    Boolean(a.worldId) &&
    Boolean(b.worldId) &&
    a.worldId === b.worldId;

  const differentDivergences =
    Boolean(a.divergenceId) &&
    Boolean(b.divergenceId) &&
    a.divergenceId !== b.divergenceId;

  const sharedEntities = intersection(a.entityIds, b.entityIds);
  const sharedTopics = intersection(a.topics, b.topics);

  const eligible =
    sameWorld &&
    differentDivergences &&
    (sharedEntities.length > 0 || sharedTopics.length > 0);

  return {
    eligible,
    sameWorld,
    differentDivergences,
    sharedEntities,
    sharedTopics,
    evidenceStatus: eligible
      ? 'metadata-supported-comparison-candidate'
      : 'insufficient-metadata-for-scenario-comparison',
  };
}

export function classifyConnection({
  scenarioComparison,
  mechanismEvidenceCandidates = [],
}) {
  if (scenarioComparison?.eligible) {
    return 'scenario-comparison-candidate';
  }

  if (mechanismEvidenceCandidates.length >= 1) {
    return 'mechanism-review-candidate';
  }

  return null;
}

export function computeScore({
  reviewClass,
  sharedEvidenceTerms = [],
  independentEvidenceSignals = [],
  hasEvidenceInBothArticles = false,
}) {
  let score = 0;

  if (reviewClass === 'scenario-comparison-candidate') {
    score += SCORE_CONFIG.scenarioComparisonBase;
  } else if (reviewClass === 'mechanism-review-candidate') {
    score += SCORE_CONFIG.mechanismReviewBase;
  }

  score +=
    Math.min(
      sharedEvidenceTerms.length,
      SCORE_CONFIG.maxEvidenceTerms
    ) * SCORE_CONFIG.sharedEvidenceTerm;

  score +=
    Math.min(
      independentEvidenceSignals.length,
      SCORE_CONFIG.maxIndependentSignals
    ) * SCORE_CONFIG.independentEvidenceSignal;

  if (hasEvidenceInBothArticles) {
    score += SCORE_CONFIG.bothArticlesHaveEvidence;
  }

  return Number(score.toFixed(2));
}

function buildArticleConnections(articles) {
  const df = buildDocumentFrequency(articles);
  const suggestions = [];
  const discoveryLeads = [];

  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const a = articles[i];
      const b = articles[j];

      const sharedEntityRecords = a.matchedEntities.filter(entity =>
        b.matchedEntities.some(other => other.entityId === entity.entityId)
      );

      const entityEvidence = sharedEntityRecords.map(entity => ({
        entityId: entity.entityId,
        entityName: entity.name,
        articleA: getEntityEvidence(a, entity),
        articleB: getEntityEvidence(
          b,
          b.matchedEntities.find(
            item => item.entityId === entity.entityId
          ) ?? entity
        ),
      }));

      const entityEvidenceCoverage = entityEvidence.filter(item =>
        item.articleA.length > 0 && item.articleB.length > 0
      ).length;

      const sharedEntities = sharedEntityRecords.map(
        entity => entity.entityId
      );

      const sharedTopics = intersection(a.topics, b.topics);
      const sharedTags = intersection(a.tags, b.tags);
      const lexical = lexicalEvidence(a, b, df, articles.length);
      const mechanisms = mechanismEvidence(a, b);
      const scenarioComparison = scenarioComparisonEvidence(a, b);

      const sharedMechanismTypes = mechanisms.sharedMechanisms.map(
        item => item.type
      );

      const mechanismMapA = buildMechanismMap(a, sharedMechanismTypes);
      const mechanismMapB = buildMechanismMap(b, sharedMechanismTypes);

      const mechanismEvidenceCandidates = sharedMechanismTypes
        .map(type => {
          const aEntry = mechanismMapA.get(type);
          const bEntry = mechanismMapB.get(type);

          if (!aEntry || !bEntry) return null;

          const sharedTerms = intersection(
            [...aEntry.terms],
            [...bEntry.terms]
          );

          // The mechanism keyword itself is not an anchor. Require at least
          // two additional non-generic terms shared by the evidence passages.
          if (sharedTerms.length < MIN_SHARED_MECHANISM_ANCHORS) {
            return null;
          }

          return {
            type,
            sharedTerms,
            minimumSharedAnchors: MIN_SHARED_MECHANISM_ANCHORS,
            evidenceStatus:
              'multiple-shared-context-anchors-keyword-heuristic-not-semantic-verification',
          };
        })
        .filter(Boolean);

      const independentEvidenceSignals = mechanismEvidenceCandidates.filter(
        (candidate, idx, all) =>
          all.every((other, otherIdx) =>
            otherIdx === idx ||
            !candidate.sharedTerms.some(
              term => other.sharedTerms.includes(term)
            )
          )
      );

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

      const hasEvidenceInBothArticles =
        evidenceA.length > 0 && evidenceB.length > 0;

      const quality = classifyConnection({
        scenarioComparison,
        mechanismEvidenceCandidates,
      });

      if (!quality) {
        // Keep lexical leads separate from conceptual-link suggestions.
        if (lexical.terms.length >= 5) {
          discoveryLeads.push({
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
            reviewClass: 'lexical-overlap-only',
            sharedLexicalTerms: lexical.terms,
            mechanismSignals: {
              sharedMechanisms: mechanisms.sharedMechanisms,
              candidates: mechanismEvidenceCandidates.length,
              independent: independentEvidenceSignals.length,
            },
            reason: mechanismEvidenceCandidates.length
              ? 'Not promoted to the connection review queue; lexical and mechanism-pattern signals are retained for inspection.'
              : mechanisms.sharedMechanisms.length
                ? 'Shared mechanism-pattern category found, but no shared specific evidence terms; not proof of a conceptual or causal relationship.'
                : 'Lexical overlap only. Not evidence of a conceptual or causal relationship.',
          });
        }

        continue;
      }

      const score = computeScore({
        reviewClass: quality,
        sharedEvidenceTerms,
        independentEvidenceSignals,
        hasEvidenceInBothArticles,
      });

      const reviewQuestions = [
        'Do the quoted passages describe the same process, rather than merely using related vocabulary?',
        'Can an editor explain the conceptual link in one specific sentence without relying on shared names or metadata?',
      ];

      if (sharedEntities.length) {
        reviewQuestions.push(
          'Are the shared entities central to both scenarios, rather than incidental mentions?'
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
        score,
        reviewClass: quality,
        proposedRelation:
          quality === 'scenario-comparison-candidate'
            ? 'comparative-scenario'
            : 'sentence-level-mechanism-hypothesis',

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
          scenarioComparison,
          textEvidence: {
            fromArticle: evidenceA,
            toArticle: evidenceB,
          },
          mechanismSignals: {
            ...mechanisms,
            candidates: mechanismEvidenceCandidates.length,
            independent: independentEvidenceSignals.length,
            candidateDetails: mechanismEvidenceCandidates,
            independentEvidenceSignals,
            note: `Mechanism candidates require at least ${MIN_SHARED_MECHANISM_ANCHORS} shared non-generic context anchors after excluding mechanism trigger words. This reduces single-keyword matches but does not verify semantic equivalence.`,
          },
          explanation:
            quality === 'scenario-comparison-candidate'
              ? [
                  'Metadata identifies a possible comparison between divergences in the same world. The substantive comparability still requires review.',
                ]
              : [
                  'Both articles contain the same mechanism-pattern category and at least two shared non-generic context terms in evidence quotes. This reduces single-keyword false positives but is not semantic verification.',
                ],
        },

        entityEvidence,
        entityEvidenceCoverage,
        evidenceQuality: {
          sharedEntityCount: sharedEntityRecords.length,
          entitiesWithTextEvidenceInBothArticles: entityEvidenceCoverage,
          status: entityEvidenceCoverage > 0
            ? 'direct-text-evidence-available'
            : 'no-direct-shared-entity-text-evidence',
          semanticVerification: 'not-performed',
        },

        reviewQuestions,
        editorialReview: {
          outcome: 'unreviewed',
          allowedOutcomes: ['accept', 'reject', 'needs-review'],
          reviewerNote: '',
        },
        publication: {
          status: 'not-published',
          publishedInGraphAt: null,
        },
        relationshipType: 'EDITORIAL_CONCEPTUAL_CANDIDATE',
        status: 'suggested-not-verified',
        reviewRequired: true,
      });
    }
  }

  const rank = {
    'scenario-comparison-candidate': 0,
    'mechanism-review-candidate': 1,
  };

  suggestions.sort((a, b) =>
    rank[a.reviewClass] - rank[b.reviewClass] ||
    b.score - a.score ||
    a.from.title.localeCompare(b.from.title)
  );

  return {
    suggestions: suggestions.slice(0, MAX_SUGGESTIONS),
    discoveryLeads,
  };
}


function buildCategoricalConnections(articles, conceptModel) {
  const entitiesById = new Map(
    (conceptModel.entities ?? []).map(entity => [entity.id, entity]),
  );

    // Само категории, изрично дефинирани като подкатегории
    // в concept model, се приемат за конкретни.
    // Непознатите категории не стават автоматично specific.
    const specificCategoryIds = new Set(
      (conceptModel.relations ?? [])
        .filter(relation => relation.type === 'SUBCATEGORY_OF')
        .map(relation => relation.from),
    );  

  const connections = [];

  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const a = articles[i];
      const b = articles[j];

      const entitiesA = new Map(
        a.matchedEntities.map(entity => [entity.entityId, entity]),
      );
      const entitiesB = new Map(
        b.matchedEntities.map(entity => [entity.entityId, entity]),
      );

      const sharedEntityIds = [...entitiesA.keys()]
        .filter(id => entitiesB.has(id));

      const categoriesA = new Map();
      const categoriesB = new Map();

      function collectCategories(entityIds, target) {
        for (const id of entityIds) {
          const entity = entitiesById.get(id);
          if (!entity) continue;

          for (const category of entity.categories ?? []) {
            if (!target.has(category.id)) {
              target.set(category.id, []);
            }

            target.get(category.id).push({
              entityId: id,
              entityName: entity.name,
              categoryCode: category.code,
            });
          }
        }
      }

      collectCategories(entitiesA.keys(), categoriesA);
      collectCategories(entitiesB.keys(), categoriesB);

      const sharedCategories = [...categoriesA.keys()]
        .filter(id => categoriesB.has(id))
        .map(id => {
          const categoryA = categoriesA.get(id);
          const categoryB = categoriesB.get(id);
          const categoryCode = categoryA[0].categoryCode;

          return {
            categoryId: id,
            categoryCode,
            entitiesInArticleA: categoryA,
            entitiesInArticleB: categoryB,
            specificity: specificCategoryIds.has(id)
              ? 'specific'
              : 'broad',
          };
        });

      const sharedSpecificCategories = sharedCategories.filter(
        category => category.specificity === 'specific',
      );

      // Без обща същност или специфична категория няма
      // основание за запис в този контекстуален слой.
      if (
        sharedEntityIds.length === 0 &&
        sharedSpecificCategories.length === 0
      ) {
        continue;
      }

      const sharedEntities = sharedEntityIds.map(id => ({
        id,
        name:
          entitiesById.get(id)?.name ??
          entitiesA.get(id)?.name ??
          id,
      }));

      const relationType = sharedEntities.length > 0
        ? 'SHARED_ENTITY_CONTEXT'
        : 'SHARED_SPECIFIC_CATEGORY';

      connections.push({
        from: {
          id: a.id,
          title: a.title,
          path: a.path,
        },
        to: {
          id: b.id,
          title: b.title,
          path: b.path,
        },

        relationType,

        sharedEntities,
        sharedCategories,
        sharedSpecificCategories,

        connectionQuality: {
          type: 'contextual',
          verified: false,
          sharedEntityCount: sharedEntities.length,
          sharedSpecificCategoryCount:
            sharedSpecificCategories.length,
          broadCategoriesAreContextOnly: true,
          requiresEditorialReview: true,
        },

        interpretation: {
          meaning: sharedEntities.length > 0
            ? 'The articles mention at least one common registered entity. This is a discovery hint, not proof of a substantive relationship.'
            : 'The articles contain entities assigned to a shared specific category. This is a discovery hint, not proof of a substantive relationship.',
          doesNotEstablishHistoricalInteraction: true,
          doesNotEstablishCausality: true,
          doesNotEstablishConceptualEquivalence: true,
          evidenceBasis:
            'registered entity mentions and generated entity categories',
        },

        status: 'automatically-generated-unverified',

        publication: {
          status: 'not-published',
        },
      });
    }
  }

  return connections;
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
        if (!target.sources.includes(source)) {
          target.sources.push(source);
        }
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

export function buildReport(articles, entityIndex) {
  const candidateConcepts = buildConceptReport(articles, entityIndex);
  const { suggestions, discoveryLeads } = buildArticleConnections(articles);
  const counts = {};

  for (const suggestion of suggestions) {
    counts[suggestion.reviewClass] =
      (counts[suggestion.reviewClass] ?? 0) + 1;
  }

  const approvedConnections = suggestions.filter(
    item => item.editorialReview.outcome === 'accept'
  );

  return {
    schemaVersion: 10,
    generatedAt: new Date().toISOString(),
    mode: 'deterministic-scenario-comparison-review-v10',

    limitations: [
      'This engine uses deterministic keyword, entity, and metadata heuristics; it does not understand article meaning as a human or semantic model would.',
      'A shared mechanism category plus at least two non-generic context anchors is still a heuristic, not proof that passages describe the same causal process.',
      'Quoted passages are selected by keyword-pattern matches; a two-anchor gate reduces single-word false positives but cannot establish a meaningful conceptual relationship. Editorial review is mandatory.',
      'Scenario-comparison candidates are based on metadata and still require substantive review.',
      'Shared entities, tags, and topics are context only and cannot independently qualify a mechanism connection.',
      'Lexical-only leads are not conceptual links and are not included in articleConnections.',
      'Literal entity matching may miss inflected forms, spelling variants, and ambiguous names.',
      'Scores rank review priority; they are not probabilities, confidence values, or truth scores.',
      'The engine does not automatically approve or publish connections.',
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
      articleLinkSuggestions: suggestions.length,
      discoveryLeads: discoveryLeads.length,
      reviewClassCounts: counts,
      editorialReviewOutcomes: {
        accept: approvedConnections.length,
        reject: suggestions.filter(
          item => item.editorialReview.outcome === 'reject'
        ).length,
        needsReview: suggestions.filter(
          item => item.editorialReview.outcome === 'needs-review'
        ).length,
        unreviewed: suggestions.filter(
          item => item.editorialReview.outcome === 'unreviewed'
        ).length,
      },
    },

    reports: {
      conceptCandidates: candidateConcepts,
      articleConnections: suggestions,
      reviewQueue: suggestions,
      discoveryLeads,
      approvedConnections,
    },

    candidateConcepts,

    articles: articles.map(
      ({ tokens, searchable, sentences, ...article }) => article
    ),

    articleLinkSuggestions: suggestions,
  };
}

function main() {
  if (!existsSync(CONTENT_ROOT)) {
    throw new Error(`Content directory not found: ${CONTENT_ROOT}`);
  }

  const { articles, entityIndex } = readArticles();

  if (!existsSync(CONCEPT_MODEL_FILE)) {
    throw new Error(
      `Concept Model report not found: ${CONCEPT_MODEL_FILE}. Run scripts/concept-model-v1.mjs first.`
    );
  }

  const conceptModel = JSON.parse(
    readFileSync(CONCEPT_MODEL_FILE, 'utf8')
  );

  const report = buildReport(articles, entityIndex);

  report.reports.categoricalConnections = buildCategoricalConnections(
    articles,
    conceptModel
  );

  report.stats.categoricalConnections =
    report.reports.categoricalConnections.length;

  writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(report, null, 2) + '\n',
    'utf8'
  );

  console.log('\nHAD IT GONE Concept Engine v10 report complete.');
  console.log(`Articles analyzed: ${report.stats.articlesAnalyzed}`);
  console.log(`Registered entities: ${report.stats.registeredEntities}`);
  console.log(`Entity matches: ${report.stats.entityMatchCount}`);
  console.log(`Candidate concepts: ${report.stats.candidateConcepts}`);
  console.log(`Article link suggestions: ${report.stats.articleLinkSuggestions}`);
  console.log(`Discovery leads: ${report.stats.discoveryLeads}`);

  for (
    const [name, count] of Object.entries(report.stats.reviewClassCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
  ) {
    console.log(`  ${name}: ${count}`);
  }

  console.log(
    `Approved connections: ${report.reports.approvedConnections.length}`
  );
  console.log(`Categorical connections: ${report.stats.categoricalConnections}`);
  console.log(`Output: ${relative(ROOT, OUTPUT_FILE)}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}