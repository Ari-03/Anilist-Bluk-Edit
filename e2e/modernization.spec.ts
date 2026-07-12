import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

declare global {
  interface Window {
    __longTaskDurations: number[]
    __longTaskObserver?: PerformanceObserver
    __statusExitSamples: Array<{ top: number; opacity: number }>
    __statusExitRecordingDone: boolean
  }
}

const future = Date.now() + 365 * 24 * 60 * 60 * 1_000
const rateHeaders = {
  'Access-Control-Expose-Headers':
    'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After',
  'X-RateLimit-Limit': '10000',
  'X-RateLimit-Remaining': '9999',
}

test.describe.configure({ mode: 'serial' })

interface FixtureEntry {
  id: number
  userId: number
  mediaId: number
  status: string
  score: number
  progress: number
  private: boolean
  hiddenFromStatusLists: boolean
  notes: string
  customLists: Record<string, boolean>
  updatedAt: number
  media: {
    id: number
    title: { userPreferred: string }
    type: 'ANIME'
    format: 'TV'
    startDate: { year: number; month: number; day: number }
    seasonYear: number
    episodes: number
    countryOfOrigin: string
    genres: string[]
    coverImage: { color: string }
  }
}

interface GraphQLBody {
  query: string
  variables?: Record<string, unknown>
}

interface MockOptions {
  onSharedMutation?: (request: {
    route: Route
    body: GraphQLBody
    ids: number[]
    call: number
    entriesById: ReadonlyMap<number, FixtureEntry>
  }) => Promise<void>
}

function entry(id: number, title: string, score = 7): FixtureEntry {
  return {
    id,
    userId: 7,
    mediaId: id + 10_000,
    status: 'CURRENT',
    score,
    progress: 3,
    private: false,
    hiddenFromStatusLists: false,
    notes: '',
    customLists: { Favorites: true },
    updatedAt: 100,
    media: {
      id: id + 10_000,
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

async function seedAccount(page: Page) {
  await page.evaluate(
    async ({ tokenExpiresAt }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('anilist-bulk-edit', 1)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result)
      })
      const transaction = database.transaction('accounts', 'readwrite')
      transaction.objectStore('accounts').put({
        id: 7,
        name: 'Test account',
        avatarUrl: null,
        accessToken: 'mock-token',
        tokenExpiresAt,
        linkedAt: 1,
        lastUsedAt: 20,
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

function patchedEntry(
  current: FixtureEntry,
  variables: Record<string, unknown> | undefined,
) {
  return {
    ...current,
    status: variables?.status ?? current.status,
    score: variables?.score ?? current.score,
    progress: variables?.progress ?? current.progress,
    private: variables?.private ?? current.private,
    hiddenFromStatusLists:
      variables?.hiddenFromStatusLists ?? current.hiddenFromStatusLists,
    notes: variables?.notes ?? current.notes,
    updatedAt: 200,
  }
}

async function installAniListMock(
  page: Page,
  entries: readonly FixtureEntry[],
  options: MockOptions = {},
) {
  let collectionReads = 0
  let mutationCalls = 0
  const entriesById = new Map(entries.map((item) => [item.id, item]))

  await page.route('https://graphql.anilist.co/', async (route) => {
    const body = route.request().postDataJSON() as GraphQLBody

    if (body.query.includes('MediaListWorkspace')) {
      collectionReads += 1
      await route.fulfill({
        headers: rateHeaders,
        json: {
          data: { MediaListCollection: { lists: [{ entries }] } },
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
                mangaList: { customLists: [] },
              },
            },
          },
        },
      })
      return
    }

    if (body.query.includes('query ReadMediaListEntries(')) {
      const variables = body.variables ?? {}
      const data = Object.fromEntries(
        Object.entries(variables)
          .filter(([name, value]) => name.startsWith('entryId') && typeof value === 'number')
          .map(([name, value]) => [
            `entry${name.slice('entryId'.length)}`,
            entriesById.get(value as number) ?? null,
          ]),
      )
      await route.fulfill({ headers: rateHeaders, json: { data } })
      return
    }

    if (body.query.includes('BulkUpdateMediaListEntries')) {
      mutationCalls += 1
      const ids = (body.variables?.ids ?? []) as number[]
      if (options.onSharedMutation) {
        await options.onSharedMutation({
          route,
          body,
          ids,
          call: mutationCalls,
          entriesById,
        })
        return
      }
      await route.fulfill({
        headers: rateHeaders,
        json: {
          data: {
            UpdateMediaListEntries: ids.map((id) =>
              patchedEntry(entriesById.get(id)!, body.variables),
            ),
          },
        },
      })
      return
    }

    await route.fulfill({ headers: rateHeaders, json: { data: {} } })
  })

  return {
    collectionReads: () => collectionReads,
    mutationCalls: () => mutationCalls,
  }
}

async function openWorkspace(
  page: Page,
  entries: readonly FixtureEntry[],
  options?: MockOptions,
) {
  await page.goto('/site.webmanifest')
  await page.evaluate(async () => {
    localStorage.clear()
    sessionStorage.clear()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('anilist-bulk-edit')
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Fixture database is blocked.'))
    })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'AniList Bulk Edit' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Link with AniList' })).toBeEnabled()
  await seedAccount(page)
  const api = await installAniListMock(page, entries, options)
  await page.reload()
  await expect(page.getByText(entries[0]!.media.title.userPreferred)).toBeVisible({
    timeout: 15_000,
  })
  return api
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  expect(results.violations).toEqual([])
}

test('partial mutation keeps only failed and unattempted entries selected and retains edits', async (
  { page },
  testInfo,
) => {
  test.skip(testInfo.project.name !== 'chromium', 'One deterministic desktop run is sufficient.')

  const entries = Array.from({ length: 101 }, (_, index) =>
    entry(index + 1, `Partial fixture ${String(index + 1).padStart(3, '0')}`),
  )
  await openWorkspace(page, entries, {
    onSharedMutation: async ({ route, body, ids, call, entriesById }) => {
      if (call === 1) {
        await route.fulfill({
          headers: rateHeaders,
          json: {
            data: {
              UpdateMediaListEntries: ids.map((id) =>
                patchedEntry(entriesById.get(id)!, body.variables),
              ),
            },
          },
        })
        return
      }

      await route.fulfill({
        status: 429,
        headers: rateHeaders,
        json: { errors: [{ message: 'Mocked rate limit.' }] },
      })
    },
  })

  await page.getByRole('button', { name: 'Bulk edit' }).click()
  await page.getByRole('button', { name: 'Select all 101 filtered entries' }).click()
  await expect(page.getByText('101 selected')).toBeVisible()
  await page.getByRole('button', { name: 'Edit selected' }).click()
  await page.getByRole('checkbox', { name: 'Change notes' }).check()
  await page.getByRole('textbox', { name: 'Notes value' }).fill('Retain this mocked edit')
  await page.getByRole('button', { name: 'Apply changes to 101 entries' }).click()

  await expect(page.getByText('50 entries confirmed. 50 failed and 1 unattempted.')).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByRole('heading', { name: 'Edit 51 selected entries' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Change notes' })).toBeChecked()
  await expect(page.getByRole('textbox', { name: 'Notes value' })).toHaveValue(
    'Retain this mocked edit',
  )

  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByText('51 selected', { exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Select Partial fixture 001' })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Deselect Partial fixture 051' })).toBeChecked()
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByRole('checkbox', { name: 'Deselect Partial fixture 101' })).toBeChecked()
  await page.getByRole('button', { name: 'Edit selected' }).click()
  await expect(page.getByRole('heading', { name: 'Edit 51 selected entries' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Change notes' })).toBeChecked()
  await expect(page.getByRole('textbox', { name: 'Notes value' })).toHaveValue(
    'Retain this mocked edit',
  )
})

test('an unknown bulk result cannot become a fresh edit or delete', async (
  { page },
  testInfo,
) => {
  test.skip(testInfo.project.name !== 'chromium', 'One deterministic desktop run is sufficient.')

  const api = await openWorkspace(page, [entry(1, 'Ambiguous fixture')], {
    onSharedMutation: async ({ route }) => {
      await route.fulfill({
        headers: rateHeaders,
        json: {
          data: { UpdateMediaListEntries: [] },
          errors: [
            {
              message: 'Resolver outcome is uncertain.',
              path: ['UpdateMediaListEntries'],
            },
          ],
        },
      })
    },
  })

  await page.getByRole('button', { name: 'Bulk edit' }).click()
  await page.getByRole('checkbox', { name: 'Select Ambiguous fixture' }).click()
  await page.getByRole('button', { name: 'Edit selected' }).click()
  await page.getByRole('checkbox', { name: 'Change score' }).check()
  await page.getByRole('spinbutton', { name: 'Score value' }).fill('9')
  await page.getByRole('button', { name: 'Apply changes to 1 entry' }).click()

  await expect(
    page.getByRole('button', { name: 'Verify 1 uncertain entry' }),
  ).toBeVisible({ timeout: 15_000 })
  expect(api.mutationCalls()).toBe(1)

  await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Apply changes to 1 entry' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', {
      name: 'Uncertain results require verification before closing',
    }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Verify 1 uncertain entry' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Delete selected' }).evaluate((button) => {
    (button as HTMLButtonElement).click()
  })
  await expect(
    page.getByRole('button', { name: 'Confirm deletion of 1 entry' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Verify 1 uncertain entry' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Edit selected' }).evaluate((button) => {
    (button as HTMLButtonElement).click()
  })
  await expect(
    page.getByRole('button', { name: 'Verify 1 uncertain entry' }),
  ).toBeVisible()
  expect(api.mutationCalls()).toBe(1)
})

test('main workspace, account actions, bulk editor, and delete confirmation pass axe', async (
  { page },
  testInfo,
) => {
  test.skip(testInfo.project.name !== 'chromium', 'Desktop accessibility is scanned once.')
  await openWorkspace(page, [entry(1, 'Accessible fixture'), entry(2, 'Second fixture')])

  await expectNoAxeViolations(page)
  await page.getByLabel('Account actions').click()
  await expect(page.getByText('Add or reconnect account')).toBeVisible()
  await expectNoAxeViolations(page)
  await page.getByLabel('Account actions').click()

  await page.getByRole('button', { name: 'Bulk edit' }).click()
  await page.getByRole('checkbox', { name: 'Select Accessible fixture' }).click()
  await page.getByRole('button', { name: 'Edit selected' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoAxeViolations(page)

  await page.getByRole('button', { name: 'Delete 1 selected entry' }).click()
  await expect(
    page.getByRole('heading', { name: 'Delete 1 entry from Test account?' }),
  ).toBeVisible()
  await expectNoAxeViolations(page)
})

test('mobile workspace is usable and accessible at 320 and 375 pixels', async (
  { page },
  testInfo,
) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'This is the dedicated mobile project.')
  await page.setViewportSize({ width: 320, height: 720 })
  await openWorkspace(page, [entry(1, 'Mobile fixture'), entry(2, 'Mobile second fixture')])

  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 720 })
    await expect(page.getByLabel('Active AniList account')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Refresh active list' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Use dark theme' })).toBeVisible()
    await expect(page.getByLabel('Account actions')).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      )
      .toBe(true)
    await expectNoAxeViolations(page)

    await page.getByRole('button', { name: 'Open filters and sorting' }).click()
    await expect(page.getByRole('dialog', { name: 'Filters and sorting' })).toBeVisible()
    await expectNoAxeViolations(page)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Filters and sorting' })).toHaveCount(0)
  }
})

test('bulk selection actions stay below the persistent header while scrolling', async (
  { page },
  testInfo,
) => {
  test.skip(testInfo.project.name !== 'chromium', 'Responsive geometry is sampled once in Chromium.')
  const entries = Array.from({ length: 30 }, (_, index) =>
    entry(index + 1, `Sticky fixture ${String(index + 1).padStart(2, '0')}`),
  )
  await openWorkspace(page, entries)
  await page.getByRole('button', { name: 'Bulk edit' }).click()

  const sampledHeaderHeights: number[] = []
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 375, height: 812 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport)
    await page.evaluate(() => window.scrollTo({ top: 1_200, behavior: 'instant' }))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

    const header = page.getByRole('banner')
    const actions = page.getByRole('region', { name: 'Bulk selection actions' })
    await expect(actions).toBeVisible()
    const [headerBox, actionBox] = await Promise.all([
      header.boundingBox(),
      actions.boundingBox(),
    ])
    if (!headerBox || !actionBox) throw new Error('Sticky shell geometry is unavailable.')
    sampledHeaderHeights.push(headerBox.height)

    expect(
      actionBox.y,
      `Action bar at ${viewport.width}px must clear header bottom ${headerBox.y + headerBox.height}px.`,
    ).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1)
    expect(actionBox.y).toBeGreaterThanOrEqual(0)
    expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(viewport.height + 1)

    for (const control of await actions.getByRole('button').all()) {
      const controlBox = await control.boundingBox()
      if (!controlBox) throw new Error('A bulk action control has no geometry.')
      expect(controlBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1)
      expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(viewport.height + 1)
    }
  }

  expect(sampledHeaderHeights[2]).toBeGreaterThan(sampledHeaderHeights[0] ?? 0)
})

test('a status-filter exit fades from the card old coordinates before empty state', async (
  { page },
  testInfo,
) => {
  test.skip(testInfo.project.name !== 'chromium', 'Motion coordinates are sampled once in Chromium.')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await openWorkspace(page, [entry(1, 'Status exit fixture')])
  await expect(page.getByText(/Last synced/u).first()).toBeVisible()
  await page.getByRole('checkbox', { name: 'Watching', exact: true }).click()
  await expect(page.locator('[data-motion-ready="true"]')).toBeVisible()

  const article = page.locator('article').filter({ hasText: 'Status exit fixture' })
  if (!(await article.boundingBox())) {
    throw new Error('The status-exit fixture has no starting coordinates.')
  }

  await page.getByRole('button', { name: 'Edit Status exit fixture' }).click()
  await page
    .getByRole('checkbox', { name: 'Change status', exact: true })
    .click()
  await page.getByRole('combobox', { name: 'Status value' }).selectOption('COMPLETED')
  const exitBaseline = await article.boundingBox()
  if (!exitBaseline) {
    throw new Error('The status-exit fixture moved before the edit was applied.')
  }
  await page.evaluate((title) => {
    window.__statusExitSamples = []
    window.__statusExitRecordingDone = false
    let frame = 0
    const sample = () => {
      const card = [...document.querySelectorAll<HTMLElement>('article')].find(
        (candidate) => candidate.querySelector('h3')?.textContent === title,
      )
      if (card?.parentElement) {
        window.__statusExitSamples.push({
          top: card.getBoundingClientRect().top,
          opacity: Number(getComputedStyle(card.parentElement).opacity),
        })
      }
      frame += 1
      if (frame < 120) requestAnimationFrame(sample)
      else window.__statusExitRecordingDone = true
    }
    requestAnimationFrame(sample)
  }, 'Status exit fixture')
  await page.getByRole('button', { name: 'Apply changes to 1 entry' }).click()
  await page.waitForFunction(() => window.__statusExitRecordingDone)
  const samples = await page.evaluate(() => window.__statusExitSamples)

  expect(samples.length).toBeGreaterThan(1)
  const fadingSamples = samples.filter(
    ({ opacity }) => opacity > 0 && opacity < 0.99,
  )
  expect(fadingSamples.length).toBeGreaterThan(1)
  for (const { top } of fadingSamples) {
    expect(Math.abs(top - exitBaseline.y)).toBeLessThan(2)
  }
  await expect(page.getByText('No entries match these filters')).toBeVisible()
  await expect(page.getByText('Status exit fixture')).toHaveCount(0)
})

test('reduced-motion preference removes layout transforms while normal motion remains enabled', async (
  { page },
  testInfo,
) => {
  test.skip(testInfo.project.name !== 'chromium', 'Motion instrumentation runs in Chromium.')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await openWorkspace(page, [entry(1, 'Alpha fixture', 10), entry(2, 'Bravo fixture', 1)])
  await expect(page.locator('[data-motion-ready="true"]')).toHaveCount(0)

  const sampleReorder = (value: 'score' | 'title', expectedFirst: string) =>
    page.evaluate(
      async ({ nextValue, firstTitle }) => {
        const select = [...document.querySelectorAll<HTMLSelectElement>('select')].find(
          (candidate) =>
            [...candidate.options].some((option) => option.value === 'score') &&
            [...candidate.options].some((option) => option.value === 'title'),
        )
        if (!select) throw new Error('Sort field was not found.')
        select.value = nextValue
        select.dispatchEvent(new Event('change', { bubbles: true }))

        for (let frame = 0; frame < 120; frame += 1) {
          const first = document.querySelector('article h3')?.textContent
          if (first === firstTitle) break
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        }
        if (document.querySelector('article h3')?.textContent !== firstTitle) {
          throw new Error('The deferred animated projection did not become ready.')
        }

        const target = [...document.querySelectorAll<HTMLElement>('article')].find(
          (article) => article.querySelector('h3')?.textContent === 'Alpha fixture',
        )
        if (!target) throw new Error('The tracked card was not found.')
        const tops: number[] = []
        for (let frame = 0; frame < 12; frame += 1) {
          tops.push(target.getBoundingClientRect().top)
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        }
        return tops
      },
      { nextValue: value, firstTitle: expectedFirst },
    )

  const normalTops = await sampleReorder('score', 'Bravo fixture')
  await expect(page.locator('[data-motion-ready="true"]')).toBeVisible()
  const normalPositions = new Set(normalTops.map((top) => Math.round(top * 10)))
  expect(normalPositions.size).toBeGreaterThan(1)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(page.getByText('Alpha fixture')).toBeVisible()
  await expect(page.getByText(/Last synced/u).first()).toBeVisible()
  await page.waitForTimeout(250)
  const currentSort = await page.getByLabel('Sort field').inputValue()
  const reducedTops =
    currentSort === 'score'
      ? await sampleReorder('title', 'Alpha fixture')
      : await sampleReorder('score', 'Bravo fixture')
  const reducedPositions = new Set(reducedTops.map((top) => Math.round(top * 10)))
  expect(
    reducedPositions.size,
    `Reduced-motion card positions: ${reducedTops.map((top) => top.toFixed(2)).join(', ')}`,
  ).toBe(1)
})

test('a 5,000-entry collection keeps the DOM paginated and avoids a severe commit stall', async (
  { page },
  testInfo,
) => {
  test.skip(testInfo.project.name !== 'chromium', 'The large fixture has one deterministic run.')
  test.setTimeout(45_000)
  const entries = Array.from({ length: 5_000 }, (_, index) =>
    entry(index + 1, `Large fixture ${String(index + 1).padStart(4, '0')}`),
  )
  const api = await openWorkspace(page, entries)
  const mediaResults = page.getByRole('region', { name: 'Media list results' })

  await expect(mediaResults.getByRole('article')).toHaveCount(100)
  await expect(page.getByText('Page 1 of 50')).toBeVisible()
  await page.getByRole('button', { name: 'Bulk edit' }).click()
  await page.getByRole('button', { name: 'Select this page' }).click()
  await expect(page.getByText('100 selected')).toBeVisible()
  await page.getByRole('button', { name: 'Edit selected' }).click()
  await page.getByRole('checkbox', { name: 'Change status', exact: true }).check()
  await page.getByRole('combobox', { name: 'Status value' }).selectOption('COMPLETED')

  await page.evaluate(() => {
    window.__longTaskObserver?.disconnect()
    window.__longTaskDurations = []
    window.__longTaskObserver = new PerformanceObserver((list) => {
      window.__longTaskDurations.push(...list.getEntries().map(({ duration }) => duration))
    })
    window.__longTaskObserver.observe({ type: 'longtask', buffered: false })
  })
  const readsBeforeCommit = api.collectionReads()
  await page.getByRole('button', { name: 'Apply changes to 100 entries' }).click()
  await expect(
    page
      .getByRole('region', { name: 'Notifications' })
      .getByText(/100 entries were confirmed without reloading/i),
  ).toBeVisible({ timeout: 20_000 })
  await expect(mediaResults.getByRole('article')).toHaveCount(100)
  expect(api.collectionReads()).toBe(readsBeforeCommit)

  const longestTask = await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    window.__longTaskObserver?.disconnect()
    return Math.max(0, ...window.__longTaskDurations)
  })
  // The Long Tasks API flags work above 50 ms. A 200 ms ceiling avoids noisy
  // shared-runner failures while still rejecting an interaction-blocking commit.
  expect(longestTask).toBeLessThan(200)
})
