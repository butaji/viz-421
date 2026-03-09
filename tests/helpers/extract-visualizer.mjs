import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = process.cwd()
const sourcePath = path.join(root, 'src', 'index.html')
const prodPath = path.join(root, 'index.html')

async function readSource() {
  return readFile(sourcePath, 'utf8')
}

function extractInlineScript(html) {
  const match = html.match(/<script>([\s\S]*)<\/script>/)
  if (!match) throw new Error('Inline script not found in src/index.html')
  return match[1]
}

function findFunction(script, name) {
  const index = script.indexOf(`function ${name}(`)
  if (index === -1) throw new Error(`Function ${name} not found`)
  const bodyStart = script.indexOf('{', index)
  const bodyEnd = findBalanced(script, bodyStart, '{', '}')
  return script.slice(index, bodyEnd + 1)
}

function findConst(script, name) {
  const index = script.indexOf(`const ${name} =`)
  if (index === -1) throw new Error(`Const ${name} not found`)
  const valueStart = script.indexOf('=', index) + 1
  const openIndex = script.slice(valueStart).search(/[\[{]/) + valueStart
  const openChar = script[openIndex]
  const closeChar = openChar === '{' ? '}' : ']'
  const closeIndex = findBalanced(script, openIndex, openChar, closeChar)
  return `${script.slice(index, closeIndex + 1)};`
}

function findBalanced(source, start, openChar, closeChar) {
  let depth = 0
  let quote = ''
  for (let i = start; i < source.length; i++) {
    const char = source[i]
    const prev = source[i - 1]
    if (quote) {
      if (char === quote && prev !== '\\') quote = ''
      continue
    }
    if (char === '"' || char === '\'' || char === '`') {
      quote = char
      continue
    }
    if (char === openChar) depth++
    if (char === closeChar) {
      depth--
      if (!depth) return i
    }
  }
  throw new Error('Unbalanced source block')
}

export async function loadVisualizerEnvironment(functionNames, constNames = [], extras = {}) {
  const html = await readSource()
  const script = extractInlineScript(html)
  const snippets = [
    ...constNames.map((name) => findConst(script, name)),
    ...functionNames.map((name) => findFunction(script, name)),
  ]
  const exportNames = [...constNames, ...functionNames].join(', ')
  const context = {
    Math,
    Uint8Array,
    Uint16Array,
    Float32Array,
    console,
    ...extras,
  }
  vm.runInNewContext(`${snippets.join('\n\n')}\nglobalThis.__testExports = { ${exportNames} };`, context)
  return Object.assign(context, context.__testExports)
}

export async function buildOutputContainsProdPaths() {
  await execFileAsync('node', ['scripts/build-prod.mjs'], { cwd: root })
  const html = await readFile(prodPath, 'utf8')
  return html.includes('pics/p1.png') && !html.includes('../pics/')
}
