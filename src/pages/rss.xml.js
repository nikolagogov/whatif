
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { sortPosts, getPostDate } from '../lib/sorting.js';

export async function GET(context) {
  const history = await getCollection('history');
  const science = await getCollection('science');
  const space = await getCollection('space');
  const society = await getCollection('society');

  const posts = sortPosts([
    ...history,
    ...science,
    ...space,
    ...society,
  ]);

  return rss({
    title: 'Had It Gone',
    description: 'What If the World Took Another Path?',
    site: context.site,
    items: posts.map((post) => {
      const pubDate = getPostDate(post.collection, post.id);

      return {
        title: post.data.title,
        description: post.data.description,
        ...(pubDate ? { pubDate } : {}),
        link: `/${post.collection}/${post.id}/`,
      };
    }),
    customData: `<language>en-us</language>`,
  });
}