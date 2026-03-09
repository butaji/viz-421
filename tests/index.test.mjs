import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const root = process.cwd()
const indexPath = path.join(root, 'src', 'index.html')
const mainPath = path.join(root, 'src', 'main.js')

async function readIndex() {
  return readFile(indexPath, 'utf8')
}

async function readMain() {
  return readFile(mainPath, 'utf8')
}

async function readCore() {
  return readFile(path.join(root, 'src', 'runtime', 'core.js'), 'utf8')
}

async function readConfig() {
  return readFile(path.join(root, 'src', 'runtime', 'config.js'), 'utf8')
}

describe('index.html', () => {
  test('keeps the main visualizer shell', async () => {
    const html = await readIndex()
    expect(html).toContain('<canvas id="scene"></canvas>')
    expect(html).toContain('id="toggle-audio"')
    expect(html).toContain('Dot Road Audio Visualizer')
  })

  test('loads the development runtime from a module entry', async () => {
    const html = await readIndex()
    expect(html).toContain('<script type="module" src="./main.js"></script>')
  })

  test('uses the src entry file for editing', async () => {
    const html = await readIndex()
    expect(html).toContain('<!doctype html>')
  })

  test('keeps the dev entry thin and module-oriented', async () => {
    const main = await readMain()
    expect(main).toContain("from './runtime/core.js'")
  })

  test('core imports shared runtime modules', async () => {
    const core = await readCore()
    expect(core).toContain("from './config.js'")
    expect(core).toContain("from './math.js'")
    expect(core).toContain("from './color.js'")
  })

  test('registers two view modes after mode cleanup', async () => {
    const config = await readConfig()
    expect(config).not.toContain("id: 'spacefall'")
    expect(config).not.toContain("id: 'tunnel'")
    expect(config).toContain("id: 'sphere'")
    expect(config).not.toContain("id: 'cube'")
  })
})
