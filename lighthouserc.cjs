const port = Number(process.env.LHCI_PORT ?? 4173)
const origin = `http://127.0.0.1:${port}`

module.exports = {
  ci: {
    collect: {
      url: [`${origin}/`],
      numberOfRuns: 3,
      chromePath: process.env.CHROME_PATH,
      puppeteerScript: './scripts/lighthouse-fixture.cjs',
      puppeteerLaunchOptions: {
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-features=PaintHolding',
        ],
      },
      startServerCommand: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
      startServerReadyPattern: 'Ready in',
      startServerReadyTimeout: 60_000,
      settings: {
        preset: 'desktop',
        onlyCategories: ['performance', 'accessibility'],
        maxWaitForLoad: 45_000,
        disableStorageReset: true,
      },
    },
    assert: {
      assertions: {
        'categories:performance': [
          'error',
          { minScore: 0.9, aggregationMethod: 'median' },
        ],
        'categories:accessibility': [
          'error',
          { minScore: 0.9, aggregationMethod: 'median' },
        ],
      },
      includePassedAssertions: true,
    },
  },
}
