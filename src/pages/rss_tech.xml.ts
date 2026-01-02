import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import sanitizeHtml from 'sanitize-html';
import MarkdownIt from 'markdown-it';
import { SITE } from "@/config";
import IconRss from "@/assets/icons/IconRss.svg";
const parser = new MarkdownIt();
import getSortedPosts from "@/utils/getSortedAny";

export async function GET(context) {
  const blog = await getCollection(
    "blog",
    ({ data }) => !data.draft && data.category == "tech"
  );
  const sortedBlogPosts = getSortedPosts(blog).sort(
    (a, b) =>
      new Date(b.data.pubDatetime).getTime() -
      new Date(a.data.pubDatetime).getTime()
  );
  return rss({
    stylesheet: '/rss/styles.xsl',
    description: SITE.desc,
    site: SITE.website,
    title: 'tnorlin.se - Tech related feed',
    trailingSlash: false,
    items: sortedBlogPosts.map((post) => ({
      link: `/posts/${post.id}/`,
      // Note: this will not process components or JSX expressions in MDX files.
      content: sanitizeHtml(parser.render(post.body), {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img'])
      }),
      ...post.data,
    })),
  });
}
