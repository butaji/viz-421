import { readFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, test } from 'vitest'

const root = process.cwd()
const indexPath = path.join(root, 'src', 'index.html')

async function readIndex() {
  return readFile(indexPath, 'utf8')
}

function extractInlineScript(html) {
  const match = html.match(/<script>([\s\S]*)<\/script>/)
  if (!match) throw new Error('Inline script not found in index.html')
  return match[1]
}

describe('index.html', () => {
  test('keeps the main visualizer shell', async () => {
    const html = await readIndex()
    expect(html).toContain('<canvas id="scene"></canvas>')
    expect(html).toContain('id="toggle-audio"')
    expect(html).toContain('Dot Road Audio Visualizer')
  })

  test('contains valid inline JavaScript syntax', async () => {
    const html = await readIndex()
    const script = extractInlineScript(html)
    expect(() => new vm.Script(script)).not.toThrow()
  })

  test('uses the src entry file for editing', async () => {
    const html = await readIndex()
    expect(html).toContain('<!doctype html>')
  })
})
