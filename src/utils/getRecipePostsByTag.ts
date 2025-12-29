import type { CollectionEntry } from "astro:content";
import getSortedPosts from "./getSortedRecipePosts";

import { slugifyAll } from "./slugify";

const getPostsByTag = (posts: CollectionEntry<"recipe">[], tag: string) =>
  getSortedPosts(
    posts.filter(post => slugifyAll(post.data.tags).includes(tag))
  );

export default getPostsByTag;
