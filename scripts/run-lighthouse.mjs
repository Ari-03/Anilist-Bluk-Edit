import { access, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const reportsDirectory = resolve(projectRoot, '.lighthouseci')
const cliPath = resolve(projectRoot, 'node_modules/@lhci/cli/src/cli.js')

async function findAvailablePort() {
  const server = createServer()

  return new Promise((resolvePort, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Could not reserve a local port for Lighthouse.'))
        return
      }

      server.close((error) => {
        if (error) reject(error)
        else resolvePort(address.port)
      })
    })
  })
}

async function run() {
  await access(resolve(projectRoot, '.next/BUILD_ID')).catch(() => {
    throw new Error('No production build found. Run `npm run build` first.')
  })

  const chromePath = process.env.CHROME_PATH || chromium.executablePath()
  await access(chromePath).catch(() => {
    throw new Error(
      'Playwright Chromium is not installed. Run `npx playwright install chromium` first.',
    )
  })

  const port = await findAvailablePort()
  await rm(reportsDirectory, { recursive: true, force: true })

  const child = spawn(
    process.execPath,
    [cliPath, 'autorun', '--config=./lighthouserc.cjs'],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        CHROME_PATH: chromePath,
        LHCI_PORT: String(port),
      },
      stdio: 'inherit',
    },
  )

  return new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Lighthouse was terminated by ${signal}.`))
        return
      }

      resolveExit(code ?? 1)
    })
  })
}

let exitCode = 1
try {
  exitCode = await run()
} finally {
  await rm(reportsDirectory, { recursive: true, force: true })
}

process.exitCode = exitCode
