import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { minify } from 'html-minifier-terser'

const root = process.cwd()
const sourcePath = path.join(root, 'src', 'index.html')
const outputPath = path.join(root, 'index.html')

const html = await readFile(sourcePath, 'utf8')
const htmlForProd = html.replace(/\.\.\/pics\//g, 'pics/')

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
