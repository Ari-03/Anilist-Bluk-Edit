import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { chromium } from '@playwright/test'

const budgetKiB = Number(process.env.FIRST_LOAD_BUDGET_KIB ?? 180)
const budgetBytes = budgetKiB * 1024
const port = Number(process.env.FIRST_LOAD_BUDGET_PORT ?? 32_941)
const origin = `http://127.0.0.1:${port}`
const nextBin = fileURLToPath(
  new URL('../node_modules/next/dist/bin/next', import.meta.url),
)

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitForServer(process) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (process.exitCode !== null) {
      throw new Error(`The production server exited with code ${process.exitCode}.`)
    }
    try {
      const response = await fetch(`${origin}/site.webmanifest`)
      if (response.status < 500) return
    } catch {
      // The server is still opening its socket.
    }
    await delay(100)
  }
  throw new Error('The production server did not become ready in time.')
}

async function seedLinkedAccount(page) {
  await page.goto(`${origin}/site.webmanifest`)
  await page.evaluate(async (tokenExpiresAt) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('anilist-bulk-edit', 1)
      request.onupgradeneeded = () => {
        const database = request.result
        database.createObjectStore('accounts', { keyPath: 'id' })
        const preferences = database.createObjectStore('preferences', {
          keyPath: 'key',
        })
        preferences.createIndex('by-account', 'accountId')
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('accounts', 'readwrite')
    transaction.objectStore('accounts').put({
      id: 7,
      name: 'Bundle fixture',
      avatarUrl: null,
      accessToken: 'bundle-fixture-token',
      tokenExpiresAt,
      linkedAt: 1,
      lastUsedAt: 2,
      state: 'ready',
    })
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  }, Date.now() + 86_400_000)
}

async function measureLinkedBoot() {
  const server = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const serverOutput = []
  server.stdout.on('data', (chunk) => serverOutput.push(chunk.toString()))
  server.stderr.on('data', (chunk) => serverOutput.push(chunk.toString()))

  let browser
  try {
    await waitForServer(server)
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await seedLinkedAccount(page)

    const scriptBodies = new Map()
    page.on('response', (response) => {
      const url = new URL(response.url())
      if (
        url.origin === origin &&
        url.pathname.startsWith('/_next/static/') &&
        url.pathname.endsWith('.js') &&
        !scriptBodies.has(url.pathname)
      ) {
        scriptBodies.set(url.pathname, response.body())
      }
    })
    await page.route('https://graphql.anilist.co/**', async (route) => {
      const body = route.request().postDataJSON()
      if (body.query.includes('MediaListWorkspace')) {
        await route.fulfill({
          json: {
            data: {
              MediaListCollection: {
                lists: [
                  {
                    entries: [
                      {
                        id: 11,
                        mediaId: 101,
                        status: 'CURRENT',
                        score: 7,
                        progress: 1,
                        private: false,
                        hiddenFromStatusLists: false,
                        notes: '',
                        customLists: {},
                        updatedAt: 1,
                        media: {
                          id: 101,
                          title: { userPreferred: 'Bundle fixture entry' },
                          type: 'ANIME',
                          format: 'TV',
                          episodes: 12,
                          countryOfOrigin: 'JP',
                          genres: [],
                          coverImage: { color: '#0369a1' },
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        })
        return
      }
      if (body.query.includes('MediaListOptionsCatalog')) {
        await route.fulfill({
          json: {
            data: {
              Viewer: {
                mediaListOptions: {
                  animeList: { customLists: [] },
                  mangaList: { customLists: [] },
                },
              },
            },
          },
        })
        return
      }
      await route.fulfill({ json: { data: {} } })
    })

    await page.goto(origin)
    await page.getByRole('article').waitFor({ timeout: 15_000 })
    await page.waitForLoadState('networkidle')
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => resolve())),
    )

    const files = await Promise.all(
      [...scriptBodies].map(async ([file, bodyPromise]) => ({
        file: file.replace('/_next/', ''),
        bytes: gzipSync(await bodyPromise).byteLength,
      })),
    )
    files.sort((left, right) => right.bytes - left.bytes)
    return files
  } catch (error) {
    const output = serverOutput.join('').trim()
    if (output) console.error(output)
    throw error
  } finally {
    await browser?.close()
    if (server.exitCode === null) {
      server.kill('SIGTERM')
      await Promise.race([
        new Promise((resolve) => server.once('exit', resolve)),
        delay(2_000),
      ])
    }
  }
}

let files
try {
  files = await measureLinkedBoot()
} catch (error) {
  console.error(
    'Could not measure the production linked-account boot. Run `npm run build` ' +
      'and install Playwright Chromium first.',
  )
  throw error
}

const totalBytes = files.reduce((total, file) => total + file.bytes, 0)
const totalKiB = totalBytes / 1024

console.log(
  `Linked-account boot JavaScript: ${totalKiB.toFixed(1)} KiB gzip ` +
    `(${files.length} unique same-origin files; budget ${budgetKiB} KiB).`,
)
for (const { file, bytes } of files) {
  console.log(`  ${(bytes / 1024).toFixed(1).padStart(6)} KiB  ${file}`)
}

if (totalBytes > budgetBytes) {
  throw new Error(
    `Linked-account boot JavaScript exceeds the ${budgetKiB} KiB gzip budget by ` +
      `${((totalBytes - budgetBytes) / 1024).toFixed(1)} KiB.`,
  )
}
