// Stage 6.6 only: configuration for the read-only SDI adoption shadow.
export default {
  siteId: "ruleta-web",
  siteUrl: "https://decidelo.app",
  source: {
    distDir: "./dist",
    sitemapPath: "./dist/sitemap-0.xml",
    fallbackToHtmlScan: true,
  },
  normalization: {
    trailingSlash: "never",
  },
  statePath: "./.sdi/state.json",
  reportPath: "./.sdi/last-run.json",
};
