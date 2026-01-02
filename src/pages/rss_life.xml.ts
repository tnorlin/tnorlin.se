import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { SITE } from "@/config";
import getSortedPosts from "@/utils/getSortedAny";

export async function GET() {
  const blog = await getCollection(
    "blog",
    ({ data }) => !data.draft && data.category == "life"
  );
  const sortedBlogPosts = getSortedPosts(blog).sort(
    (a, b) =>
      new Date(b.data.pubDatetime).getTime() -
      new Date(a.data.pubDatetime).getTime()
  );
  return rss({
    stylesheet: "/rss/styles.xsl",
    title: "tnorlin.se - The everyday life feed",
    description: SITE.desc,
    site: SITE.website,
    trailingSlash: false,
    items: sortedBlogPosts.map(post => ({
      link: `/posts/${post.id}/`,
      // Note: this will not process components or JSX expressions in MDX files.
      title: post.data.title,
      pubDate: new Date(post.data.modDatetime ?? post.data.pubDatetime),
      description: post.data.description,
    })),
  });
}
