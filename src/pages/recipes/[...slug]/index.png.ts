import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import { getRecipePath } from "@/utils/getRecipePath";
import { generateOgImageForRecipe } from "@/utils/generateOgImages";
import { SITE } from "@/config";

export async function getStaticPaths() {
  if (!SITE.dynamicOgImage) {
    return [];
  }

  const posts = await getCollection("recipe").then(p =>
    p.filter(({ data }) => !data.draft && !data.ogImage)
  );

  return posts.map(post => ({
    params: { slug: getRecipePath(post.id, post.filePath, false) },
    props: post,
  }));
}

export const GET: APIRoute = async ({ props }) => {
  if (!SITE.dynamicOgImage) {
    return new Response(null, {
      status: 404,
      statusText: "Not found",
    });
  }

  const buffer = await generateOgImageForRecipe(props as CollectionEntry<"recipe">);
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "image/png" },
  });
};
