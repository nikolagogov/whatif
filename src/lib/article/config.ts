/**
 * Canonical configuration for the site's article sectors and their topics.
 * Keep presentation metadata and topic membership in this one place so
 * Sector and Topic pages cannot drift apart.
 */

export type ConfiguredArticleSector = 'history' | 'science' | 'space' | 'society';

export const ARTICLE_SECTOR_CONFIG = {
  history: {
    title: 'History',
    emoji: '🏛️',
    intro: 'Empires, wars, and decisions that could have gone another way.',
    image: '/images/sectors/history.jpg',
    archiveLabel: 'The History Archive',
    exploreTitle: 'Explore History',
    topics: [
      {
        slug: 'ancient-world',
        emoji: '🏛️',
        icon: 'temple',
        title: 'Ancient World',
        subtitle: 'Alexander, Alexandria, and the ancient Mediterranean.',
        image: '/images/topics/ancient-world.jpg',
      },
      {
        slug: 'empires',
        emoji: '👑',
        icon: 'crown',
        title: 'Empires',
        subtitle: 'Rome, Persia, and empires that might have followed.',
        image: '/images/topics/empires.jpg',
      },
      {
        slug: 'wars',
        emoji: '⚔️',
        icon: 'swords',
        title: 'Wars & Conflicts',
        subtitle: 'Battles and crises that changed the course of history.',
        image: '/images/topics/wars.jpg',
      },
    ],
  },
  science: {
    title: 'Science',
    emoji: '🧪',
    intro: 'Evolution, biology, and discoveries that could have changed the natural world.',
    image: '/images/sectors/science.jpg',
    archiveLabel: 'The Science Archive',
    exploreTitle: 'Explore Science',
    topics: [
      {
        slug: 'evolution',
        emoji: '🦕',
        icon: 'fossil',
        title: 'Evolution & Deep Time',
        subtitle: 'Deep time and the paths life might have taken.',
        image: '/images/topics/evolution.jpg',
      },
      {
        slug: 'biology',
        emoji: '🧬',
        icon: 'dna',
        title: 'Biology & Life',
        subtitle: 'Life, cells, and the rules of the natural world.',
        image: '/images/topics/biology.jpg',
      },
      {
        slug: 'discoveries',
        emoji: '🔬',
        icon: 'microscope',
        title: 'Discoveries & Inventions',
        subtitle: 'Inventions and insights that arrived early — or never.',
        image: '/images/topics/discoveries.jpg',
      },
      {
        slug: 'earth',
        emoji: '🌍',
        icon: 'globe',
        title: 'Earth & Environment',
        subtitle: 'The planet as it was — and as it might have been.',
        image: '/images/topics/earth.jpg',
      },
      {
        slug: 'human-body',
        emoji: '🧠',
        icon: 'brain',
        title: 'Human Body & Mind',
        subtitle: 'The body and mind as they could have evolved.',
        image: '/images/topics/human-body.jpg',
      },
    ],
  },
  space: {
    title: 'Space',
    emoji: '🌌',
    intro: 'Altered worlds and different paths through the universe.',
    image: '/images/sectors/space.jpg',
    archiveLabel: 'The Space Archive',
    exploreTitle: 'Explore Space',
    topics: [
      {
        slug: 'mars-worlds',
        emoji: '🔴',
        icon: 'planet',
        title: 'Mars & Its Lost Oceans',
        subtitle: 'The Red Planet and the oceans it might have kept.',
        cardDescription: 'A world that might have remained blue, warm, and habitable.',
        image: '/images/topics/mars-worlds.jpg',
      },
      {
        slug: 'earth-moon',
        emoji: '🌙',
        icon: 'moon',
        title: 'Earth & Moon',
        subtitle: 'Our own planet and the worlds closest to it.',
        image: '/images/topics/earth-moon.jpg',
      },
      {
        slug: 'planets',
        emoji: '🪐',
        icon: 'orbit',
        title: 'Planets & Moons',
        subtitle: 'Worlds that might have taken a different shape.',
        image: '/images/topics/planets.jpg',
      },
      {
        slug: 'cosmic-events',
        emoji: '☄️',
        icon: 'comet',
        title: 'Cosmic Events',
        subtitle: 'Impacts, collisions, and other turning points.',
        image: '/images/topics/cosmic-events.jpg',
      },
      {
        slug: 'universe',
        emoji: '✨',
        icon: 'star',
        title: 'Stars & Universe',
        subtitle: 'The cosmos at scales we can barely imagine.',
        image: '/images/topics/universe.jpg',
      },
    ],
  },
  society: {
    title: 'Society',
    emoji: '🌍',
    intro: 'Systems, technologies, and cultures that might have shaped a different world.',
    image: '/images/sectors/society.jpg',
    archiveLabel: 'The Society Archive',
    exploreTitle: 'Explore Society',
    topics: [
      {
        slug: 'technology',
        emoji: '💡',
        icon: 'bulb',
        title: 'Technology & Innovation',
        subtitle: 'Inventions and systems that might have changed us.',
        image: '/images/topics/technology.jpg',
      },
      {
        slug: 'politics',
        emoji: '🏛️',
        icon: 'parliament',
        title: 'Politics & Power',
        subtitle: 'Power, governance, and different social orders.',
        image: '/images/topics/politics.jpg',
      },
      {
        slug: 'culture',
        emoji: '🎭',
        icon: 'theater',
        title: 'Culture & Ideas',
        subtitle: 'Ideas, beliefs, and the paths they might have taken.',
        image: '/images/topics/culture.jpg',
      },
      {
        slug: 'economics',
        emoji: '💰',
        icon: 'coins',
        title: 'Economics & Trade',
        subtitle: 'Trade, wealth, and alternative economic worlds.',
        image: '/images/topics/economics.jpg',
      },
      {
        slug: 'civilization',
        emoji: '🏙️',
        icon: 'city',
        title: 'Civilization & Collapse',
        subtitle: 'Rise, fall, and the roads not taken.',
        image: '/images/topics/civilization.jpg',
      },
    ],
  },
} as const;

export const ARTICLE_SECTORS = Object.keys(
  ARTICLE_SECTOR_CONFIG
) as ConfiguredArticleSector[];

export type ArticleTopicConfig =
  (typeof ARTICLE_SECTOR_CONFIG)[ConfiguredArticleSector]['topics'][number];

export function isConfiguredArticleSector(
  sector: string
): sector is ConfiguredArticleSector {
  return Object.prototype.hasOwnProperty.call(ARTICLE_SECTOR_CONFIG, sector);
}

export function getArticleSectorConfig(sector: string) {
  return isConfiguredArticleSector(sector)
    ? ARTICLE_SECTOR_CONFIG[sector]
    : undefined;
}

export function getArticleTopicConfig(sector: string, topic: string) {
  const sectorConfig = getArticleSectorConfig(sector);
  return sectorConfig?.topics.find((item) => item.slug === topic);
}

export function getArticleSectorTitle(sector: ConfiguredArticleSector): string {
  return ARTICLE_SECTOR_CONFIG[sector].title;
}
