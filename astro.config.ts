import { defineConfig, envField } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import remarkToc from "remark-toc";
import remarkCollapse from "remark-collapse";
import { SITE } from "./src/config";

import expressiveCode from "astro-expressive-code";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";

import react from "@astrojs/react";

import mdx from "@astrojs/mdx";

// https://astro.build/config
export default defineConfig({
  site: SITE.website,
  integrations: [
    sitemap({
      filter: page => SITE.showArchives || !page.endsWith("/archives"),
    }),
    expressiveCode({
      // You can set configuration options here
      themes: ["material-theme-darker", "github-light"],
      styleOverrides: {
        // You can also override styles
        borderRadius: "0.5rem",
        frames: {},
      },
      defaultProps: {
        // Enable word wrap by default
        wrap: true,
        // Disable wrapped line indentation for terminal languages
        overridesByLang: {
          "bash,ps,sh": { preserveIndent: false },
        },
      },
      plugins: [pluginLineNumbers()],
    }),
    react(),
    mdx(),
  ],
  markdown: {
    remarkPlugins: [remarkToc, [remarkCollapse, { test: "Table of contents" }]],
  },
  vite: {
    // eslint-disable-next-line
    // @ts-ignore
    // This will be fixed in Astro 6 with Vite 7 support
    // See: https://github.com/withastro/astro/issues/14030
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ["@resvg/resvg-js"],
    },
  },
  image: {
    responsiveStyles: true,
    layout: "constrained",
  },
  env: {
    schema: {
      PUBLIC_GOOGLE_SITE_VERIFICATION: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),
    },
  },
  experimental: {
    preserveScriptOrder: true,
  },
});
