import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const iconsDir = fileURLToPath(new URL('./src/icons/', import.meta.url));

// Inlines <!--icon:name--> placeholders with the SVG source, so the logo and
// icons paint with the first HTML byte and inherit currentColor.
const inlineIcons = () => ({
  name: 'inline-icons',
  transformIndexHtml(html) {
    return html.replace(/<!--icon:([\w-]+)-->/g, (_, name) =>
      readFileSync(iconsDir + name + '.svg', 'utf8').replace(/<svg ([^>]*?)viewBox="0 0 ([\d.]+) ([\d.]+)"/, (_m, attrs, w, h) =>
        // intrinsic size from the viewBox, so an unstyled first paint can't blow the logo up to full width
        `<svg aria-hidden="true" focusable="false" width="${Math.round(w)}" height="${Math.round(h)}" ${attrs}viewBox="0 0 ${w} ${h}"`)
    );
  },
});

export default defineConfig({
  base: './',
  plugins: [inlineIcons()],
  server: { host: true, port: 5174 },
  build: { target: 'es2020', assetsInlineLimit: 0 },
});
