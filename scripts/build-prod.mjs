import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { minify } from 'html-minifier-terser'

const root = process.cwd()
const sourcePath = path.join(root, 'src', 'index.html')
const scriptPath = path.join(root, 'src', 'main.js')
const corePath = path.join(root, 'src', 'runtime', 'core.js')
const outputPath = path.join(root, 'index.html')

const html = await readFile(sourcePath, 'utf8')
const script = await readFile(scriptPath, 'utf8')
const core = await readFile(corePath, 'utf8')
const inlineScript = script.includes("from './runtime/core.js'")
  ? `${core.replace('export function bootVisualizer()', 'function bootVisualizer()')}\nbootVisualizer()\n`
  : script
const htmlForProd = html
  .replace('<script type="module" src="./main.js"></script>', `<script>\n${inlineScript}\n</script>`)
  .replace(/\.\.\/pics\//g, 'pics/')

const output = await minify(htmlForProd, {
  collapseBooleanAttributes: true,
  collapseWhitespace: true,
  minifyCSS: true,
  minifyJS: true,
  removeAttributeQuotes: false,
  removeComments: true,
  removeOptionalTags: false,
})

await writeFile(outputPath, `${output}\n`)
