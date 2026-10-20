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

// Russian typography for the page copy: no short word left hanging at a line end.
// Works on text between tags only (attributes, scripts, styles and SVG are left alone).
const NBSP = ' ';
const SHORT = 'в|во|на|с|со|к|ко|у|о|об|обо|и|а|но|да|по|за|из|изо|от|до|для|без|не|ни|при|под|над|про|что|как|или|то|это|их|его|её|ее|мы|вы|он|она|они|я|все|всё|так|уже';
const afterShort = new RegExp(`(^|[\\s${NBSP}(«„"])(${SHORT}) `, 'gi');
const typographText = (t) => {
  let out = t.replace(/&nbsp;/g, NBSP);
  // a short word binds to the next one (run twice so chains like «и в» both bind)
  for (let i = 0; i < 2; i++) out = out.replace(afterShort, `$1$2${NBSP}`);
  out = out
    .replace(/ (же|ли|бы)(?=[\s,.!?:;»]|$)/gi, `${NBSP}$1`) // particles stay with the word before
    .replace(/ (—|–)/g, `${NBSP}$1`)                      // a dash never starts a line
    .replace(/(\d) (?=\d{3}(?!\d))/g, `$1${NBSP}`)        // 300 000
    .replace(/(\d) (?=[%₽″°]|[А-Яа-яЁё])/g, `$1${NBSP}`);  // 12 месяцев, 300 000 ₽, 1 июля
  return out;
};
const typograph = () => ({
  name: 'typograph',
  transformIndexHtml(html) {
    let skip = 0;
    return html.split(/(<[^>]+>)/).map((part) => {
      if (part.startsWith('<')) {
        if (/^<(script|style|svg)\b/i.test(part) && !part.endsWith('/>')) skip++;
        else if (/^<\/(script|style|svg)>/i.test(part)) skip = Math.max(0, skip - 1);
        return part;
      }
      return skip ? part : typographText(part);
    }).join('');
  },
});

export default defineConfig({
  base: './',
  plugins: [inlineIcons(), typograph()],
  server: { host: true, port: 5174 },
  build: { target: 'es2020', assetsInlineLimit: 0 },
});
