import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { getPath } from "@/utils/getPath";
import getSortedPosts from "@/utils/getSortedAny";
import { SITE } from "@/config";

export async function GET() {
  const blog = await getCollection("blog");

  const sortedBlogPosts = getSortedPosts(blog).sort(
    (a, b) =>
      new Date(b.data.pubDatetime).getTime() -
      new Date(a.data.pubDatetime).getTime()
  );
  return rss({
    title: SITE.title,
    description: SITE.desc,
    site: SITE.website,
    items: sortedBlogPosts.map(({ data, id, filePath }) => ({
      link: getPath(id, filePath),
      title: "[" + data.category + "]: " + data.title,
      description: data.description,
      pubDate: new Date(data.modDatetime ?? data.pubDatetime),
    })),
  });
}
