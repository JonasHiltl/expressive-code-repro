import { defineConfig } from 'astro/config';
import cloudflare from "@astrojs/cloudflare";
import starlight from '@astrojs/starlight';
import { pluginShiki } from './src/shiki-plugin';

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: 'Docs',
      expressiveCode: {
        shiki: false,
        plugins: [
          pluginShiki()
        ]
      },
    }),
  ],
  output: "server",
  adapter: cloudflare({
    imageService: "passthrough"
  }),
  markdown: {
    shikiConfig: {
      langs: ["javascript", "yaml", "go", "sh"]
    }
  },
});