import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { minify } from 'html-minifier-terser'

const root = process.cwd()
const sourcePath = path.join(root, 'src', 'index.html')
const runtimePaths = [
  path.join(root, 'src', 'runtime', 'config.js'),
  path.join(root, 'src', 'runtime', 'math.js'),
  path.join(root, 'src', 'runtime', 'color.js'),
  path.join(root, 'src', 'runtime', 'core.js'),
  path.join(root, 'src', 'main.js'),
]
const outputPath = path.join(root, 'index.html')

function inlineModuleSource(source) {
  return source.replace(/^import .*$/gm, '').replace(/export\s+/g, '').trim()
}

const html = await readFile(sourcePath, 'utf8')
const runtimeParts = await Promise.all(runtimePaths.map((filePath) => readFile(filePath, 'utf8')))
const inlineScript = runtimeParts.map(inlineModuleSource).join('\n\n')
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
