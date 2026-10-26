// Puts the rendered page into dist/index.html, so the text is in the HTML before any script runs
// (crawlers, link previews, visitors without JavaScript); the client then hydrates it.
import { readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const { render } = await import(`file://${root}dist-ssr/entry-server.js`)
const page = `${root}dist/index.html`
const html = await readFile(page, 'utf8')
const mount = '<div id="root"></div>'
if (!html.includes(mount)) throw new Error(`${mount} is missing from dist/index.html`)
await writeFile(page, html.replace(mount, `<div id="root">${render()}</div>`))
await rm(`${root}dist-ssr`, { recursive: true, force: true })
console.log('prerendered dist/index.html')
