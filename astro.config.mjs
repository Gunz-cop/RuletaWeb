import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { adsenseReadySlugs } from './src/data/adsenseEditorial.ts';

const adsenseReadyBlogUrls = new Set(
  adsenseReadySlugs.map((slug) => `https://decidelo.app/blog/${slug}`),
);

export default defineConfig({
  site: 'https://decidelo.app',
  output: 'static',
  trailingSlash: 'never',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/blog/') || page === 'https://decidelo.app/blog' || adsenseReadyBlogUrls.has(page),
    }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      cssMinify: true,
    },
  },
});
