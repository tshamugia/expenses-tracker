/**
 * Generate placeholder PWA icons for ExtraTracker.
 *
 * Rasterizes an inline SVG (a 💰 monogram on the brand primary background)
 * into the PNG sizes required for an installable PWA, written to public/icons/.
 *
 * Run with: node scripts/generate-pwa-icons.mjs
 * These are placeholders — swap in real branding by replacing the PNGs.
 */

import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'icons')

const PRIMARY = '#1a1f35' // brand primary (light theme)
const ACCENT = '#22c55e' // green accent ring
const GLYPH = '#ffffff' // high-contrast glyph

/**
 * Build an SVG for the icon: a bold white "$" on the brand background with a
 * green accent ring. Drawn as vector text (not an emoji) so it rasterizes with
 * reliable, high contrast across renderers.
 * @param {number} size  overall canvas size
 * @param {boolean} maskable  keep content inside the inner ~80% "safe zone"
 */
function iconSvg(size, maskable) {
  const radius = maskable ? 0 : Math.round(size * 0.22)
  const cx = size / 2
  const cy = size / 2
  // Maskable icons need a smaller content footprint to survive mask cropping.
  const ringR = size * (maskable ? 0.3 : 0.36)
  const ringW = Math.max(2, Math.round(size * 0.045))
  const fontSize = Math.round(size * (maskable ? 0.42 : 0.52))
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${PRIMARY}"/>
  <circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="${ACCENT}" stroke-width="${ringW}"/>
  <text x="50%" y="50%" dy="0.02em" dominant-baseline="central" text-anchor="middle"
        font-size="${fontSize}" font-weight="700" fill="${GLYPH}"
        font-family="'Segoe UI','Helvetica Neue',Arial,sans-serif">$</text>
</svg>`
}

async function render(svg, size, filename, flatten) {
  let pipeline = sharp(Buffer.from(svg)).resize(size, size)
  if (flatten) {
    pipeline = pipeline.flatten({ background: PRIMARY })
  }
  await pipeline.png().toFile(join(outDir, filename))
  console.log(`  ✓ ${filename}`)
}

async function main() {
  await mkdir(outDir, { recursive: true })
  console.log('Generating PWA icons →', outDir)

  await render(iconSvg(192, false), 192, 'icon-192.png', false)
  await render(iconSvg(512, false), 512, 'icon-512.png', false)
  await render(iconSvg(192, true), 192, 'icon-maskable-192.png', false)
  await render(iconSvg(512, true), 512, 'icon-maskable-512.png', false)
  // Apple touch icon must be opaque (no alpha) and 180×180.
  await render(iconSvg(180, false), 180, 'apple-touch-icon.png', true)

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
