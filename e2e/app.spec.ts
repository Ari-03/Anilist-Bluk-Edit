import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const future = Date.now() + 365 * 24 * 60 * 60 * 1_000
const rateHeaders = {
  'X-RateLimit-Limit': '10000',
  'X-RateLimit-Remaining': '9999',
}

async function seedAccounts(page: Page) {
  await page.evaluate(
    async ({ tokenExpiresAt }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('anilist-bulk-edit', 1)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result)
      })
      const transaction = database.transaction('accounts', 'readwrite')
      const accounts = transaction.objectStore('accounts')
      accounts.put({
        id: 7,
        name: 'Account A',
        avatarUrl: null,
        accessToken: 'token-a',
        tokenExpiresAt,
        linkedAt: 1,
        lastUsedAt: 20,
        state: 'ready',
      })
      accounts.put({
        id: 8,
        name: 'Account B',
        avatarUrl: null,
        accessToken: 'token-b',
        tokenExpiresAt,
        linkedAt: 2,
        lastUsedAt: 10,
        state: 'ready',
      })
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })
      database.close()
    },
    { tokenExpiresAt: future },
  )
}

function mediaEntry(accountId: number, id: number, title: string) {
  return {
    id,
    userId: accountId,
    mediaId: id + 1_000,
    status: 'CURRENT',
    score: 7,
    progress: 3,
    private: false,
    hiddenFromStatusLists: false,
    notes: '',
    customLists: { Favorites: true },
    updatedAt: 100,
    media: {
      id: id + 1_000,
      title: { userPreferred: title },
      type: 'ANIME',
      format: 'TV',
      startDate: { year: 2024, month: 1, day: 1 },
      seasonYear: 2024,
      episodes: 12,
      countryOfOrigin: 'JP',
      genres: ['Drama'],
      coverImage: { color: '#0369a1' },
    },
  }
}

async function mockAniList(page: Page) {
  let collectionReads = 0
  const entries = {
    7: [mediaEntry(7, 101, 'Account A Show')],
    8: [mediaEntry(8, 201, 'Account B Show')],
  } as const

  await page.route('https://graphql.anilist.co/', async (route) => {
    const request = route.request()
    const body = request.postDataJSON() as {
      query: string
      variables?: Record<string, unknown>
    }
    const accountId = request.headers().authorization === 'Bearer token-b' ? 8 : 7

    if (body.query.includes('MediaListWorkspace')) {
      collectionReads += 1
      await route.fulfill({
        headers: rateHeaders,
        json: {
          data: {
            MediaListCollection: {
              lists: [{ entries: entries[accountId as 7 | 8] }],
            },
          },
        },
      })
      return
    }

    if (body.query.includes('MediaListOptionsCatalog')) {
      await route.fulfill({
        headers: rateHeaders,
        json: {
          data: {
            Viewer: {
              mediaListOptions: {
                animeList: { customLists: ['Favorites'] },
                mangaList: { customLists: ['Reading queue'] },
              },
            },
          },
        },
      })
      return
    }

    if (body.query.includes('BulkUpdateMediaListEntries')) {
      const ids = body.variables?.ids as number[]
      const updated = ids.map((id) => ({
        ...entries[accountId as 7 | 8].find((entry) => entry.id === id),
        status: body.variables?.status ?? 'CURRENT',
        score: body.variables?.score ?? 7,
        progress: body.variables?.progress ?? 3,
        updatedAt: 200,
      }))
      await route.fulfill({
        headers: rateHeaders,
        json: { data: { UpdateMediaListEntries: updated } },
      })
      return
    }

    await route.fulfill({ headers: rateHeaders, json: { data: {} } })
  })

  return { collectionReads: () => collectionReads }
}

test('onboarding discloses local token storage and remains accessible on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'AniList Bulk Edit' })).toBeVisible()
  await expect(
    page.getByText(/tokens are stored locally in this browser/i),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /inspect the source code/i })).toBeVisible()
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll')

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  expect(results.violations).toEqual([])
})

test('accounts stay isolated and a confirmed bulk edit does not reload the collection', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'AniList Bulk Edit' })).toBeVisible()
  await seedAccounts(page)
  const api = await mockAniList(page)
  await page.reload()

  await expect.poll(api.collectionReads, { timeout: 15_000 }).toBeGreaterThan(0)
  await expect(page.getByText('Account A Show')).toBeVisible({ timeout: 15_000 })
  await page.getByLabel('Active AniList account').selectOption('8')
  await expect(page.getByText('Account B Show')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Account A Show')).toHaveCount(0)

  await page.getByLabel('Active AniList account').selectOption('7')
  await expect(page.getByText('Account A Show')).toBeVisible({ timeout: 15_000 })
  const readsBeforeEdit = api.collectionReads()

  await page.getByRole('button', { name: 'Bulk edit' }).click()
  await page.getByRole('checkbox', { name: 'Select Account A Show' }).click()
  await page.getByRole('searchbox', { name: 'Search titles' }).fill('no match')
  await expect(page.getByText('0 selected', { exact: true })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search titles' }).fill('')
  await expect(
    page.getByRole('checkbox', { name: 'Select Account A Show' }),
  ).not.toBeChecked()
  await page.getByRole('checkbox', { name: 'Select Account A Show' }).click()
  await page.getByRole('button', { name: 'Edit selected' }).click()
  await page.getByRole('checkbox', { name: 'Change status', exact: true }).check()
  await page.getByRole('combobox', { name: 'Status value' }).selectOption('COMPLETED')
  await page.getByRole('button', { name: 'Apply changes to 1 entry' }).click()

  await expect(
    page
      .getByRole('article')
      .filter({ hasText: 'Account A Show' })
      .getByText('Completed', { exact: true }),
  ).toBeVisible({ timeout: 15_000 })
  expect(api.collectionReads()).toBe(readsBeforeEdit)
})

test('a ready account cannot hide a legacy token migration choice', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'AniList Bulk Edit' })).toBeVisible()
  await seedAccounts(page)
  await page.evaluate(() => {
    localStorage.setItem('anilist_access_token', 'legacy-private-token')
  })
  await mockAniList(page)
  await page.reload()

  await expect(page.getByRole('heading', { name: 'Old local sign-in found' })).toBeVisible()
  await expect(page.getByText('Account A Show')).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('anilist_access_token')))
    .toBe('legacy-private-token')

  await page.getByRole('button', { name: 'Delete old sign-in' }).click()
  await expect(page.getByText('Account A Show')).toBeVisible({ timeout: 15_000 })
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('anilist_access_token')))
    .toBeNull()
})
