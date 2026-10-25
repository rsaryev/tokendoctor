// Renders scripts/og-card.html to public/og.png at 2x (2400×1260) with a headless Chrome (CHROME overrides the path).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const here = (p) => fileURLToPath(new URL(p, import.meta.url))
execFileSync(chrome, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
  '--window-size=1200,630', '--force-device-scale-factor=2', '--virtual-time-budget=3000',
  `--screenshot=${here('../public/og.png')}`, `file://${here('./og-card.html')}`,
], { stdio: 'ignore' })
console.log('wrote public/og.png')
