import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { getPath } from "@/utils/getPath";
import getSortedPosts from "@/utils/getSortedPosts";
import getSortedRecipePosts from "@/utils/getSortedRecipePosts";
import getSortedLifePosts from "@/utils/getSortedLifePosts";
import { SITE } from "@/config";

export async function GET() {
  const blog = await getCollection("blog");
  const recipe = await getCollection("recipe");
  const life = await getCollection("life");

  const sortedBlogPosts = getSortedPosts(blog);
  const sortedRecipePosts = getSortedRecipePosts(recipe);
  const sortedLifePosts = getSortedLifePosts(life);
  const sortedAllPosts = [...sortedBlogPosts, ...sortedRecipePosts, ...sortedLifePosts].sort((a, b) => new Date(b.data.pubDatetime).getTime() - new Date(a.data.pubDatetime).getTime());
  return rss({
    title: SITE.title,
    description: SITE.desc,
    site: SITE.website,
    items: sortedAllPosts.map(({ data, id, filePath }) => ({
      link: getPath(id, filePath),
      title: "[" + data.category + "]: " + data.title,
      description: data.description,
      pubDate: new Date(data.modDatetime ?? data.pubDatetime),
    })),
  });
}
