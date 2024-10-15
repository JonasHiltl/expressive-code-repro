I'm using `expressive-code` through [Astro Starlight](https://starlight.astro.build/de/).
You can find the config in the `astro.config.mjs` file.

I copied the `shiki-plugin` and made some adjustements, mostly in the `highlighter.ts` file to use the `createHighlighterCore` function with hard coded languages and themes. This should theoretically create a fine-grained bundle based on the shiki docs.


You can inspect the bundle size by running.
```
npm run build
npm run preview
```

This won't be more than 2MB but still ~ 660KB. You will also find that every bundled language of shiki is included even though I used the fine-grained approach shiki describes in their docs.