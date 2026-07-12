'use strict'

const configuredPages = new WeakSet()

const fixtureHeaders = (origin) => ({
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Expose-Headers':
    'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After',
  'Content-Type': 'application/json',
  'X-RateLimit-Limit': '10000',
  'X-RateLimit-Remaining': '9999',
})

function graphQlFixture(query) {
  if (query.includes('MediaListWorkspace')) {
    return {
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
                    title: { userPreferred: 'Lighthouse fixture entry' },
                    type: 'ANIME',
                    format: 'TV',
                    episodes: 12,
                    countryOfOrigin: 'JP',
                    genres: ['Drama'],
                    coverImage: { color: '#0369a1' },
                  },
                },
              ],
            },
          ],
        },
      },
    }
  }
  if (query.includes('MediaListOptionsCatalog')) {
    return {
      data: {
        Viewer: {
          mediaListOptions: {
            animeList: { customLists: [] },
            mangaList: { customLists: [] },
          },
        },
      },
    }
  }
  return { data: {} }
}

async function configurePage(page, origin) {
  if (configuredPages.has(page)) return
  configuredPages.add(page)
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    void (async () => {
      if (!request.url().startsWith('https://graphql.anilist.co')) {
        await request.continue()
        return
      }
      const headers = fixtureHeaders(origin)
      if (request.method() === 'OPTIONS') {
        await request.respond({ status: 204, headers })
        return
      }
      let query = ''
      try {
        query = JSON.parse(request.postData() ?? '{}').query ?? ''
      } catch {
        // An unreadable fixture request receives an empty GraphQL result.
      }
      await request.respond({
        status: 200,
        headers,
        body: JSON.stringify(graphQlFixture(query)),
      })
    })().catch(() => {
      if (!request.isInterceptResolutionHandled()) void request.abort()
    })
  })
}

async function seedLinkedAccount(page, origin) {
  await page.goto(`${origin}/site.webmanifest`, { waitUntil: 'domcontentloaded' })
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
      name: 'Lighthouse fixture',
      avatarUrl: null,
      accessToken: 'lighthouse-fixture-token',
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

module.exports = async (browser, context) => {
  const origin = new URL(context.url).origin
  browser.on('targetcreated', (target) => {
    void target
      .page()
      .then((page) => (page ? configurePage(page, origin) : undefined))
  })
  const page = await browser.newPage()
  await configurePage(page, origin)
  await seedLinkedAccount(page, origin)
  await page.goto(context.url, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[aria-label="Media list results"] article', {
    timeout: 15_000,
  })
}
