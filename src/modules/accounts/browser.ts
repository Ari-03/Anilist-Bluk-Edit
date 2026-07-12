import { BrowserAccountManager, type AccountManagerDependencies } from './manager'
import { SessionOAuthIntentStore } from './oauth'
import { IndexedDbAccountStorage } from './storage'
import type { AccountViewerGateway, ViewerIdentity } from './types'

const VIEWER_QUERY = `
  query AccountViewer {
    Viewer {
      id
      name
      avatar { large medium }
    }
  }
`

interface ViewerPayload {
  data?: {
    Viewer?: {
      id?: unknown
      name?: unknown
      avatar?: { large?: unknown; medium?: unknown }
    }
  }
  errors?: readonly unknown[]
}

/** Direct browser adapter used only while validating a newly supplied token. */
export class AniListAccountViewerGateway implements AccountViewerGateway {
  constructor(
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  async getViewer(accessToken: string): Promise<ViewerIdentity> {
    const response = await this.fetcher('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: VIEWER_QUERY }),
    })

    let payload: ViewerPayload
    try {
      payload = (await response.json()) as ViewerPayload
    } catch (error) {
      throw new Error('AniList returned an unreadable Viewer response.', {
        cause: error,
      })
    }

    const viewer = payload.data?.Viewer
    if (
      !response.ok ||
      payload.errors?.length ||
      typeof viewer?.id !== 'number' ||
      typeof viewer.name !== 'string'
    ) {
      throw new Error('AniList did not accept this account token.')
    }

    const avatar = viewer.avatar?.large ?? viewer.avatar?.medium
    return {
      id: viewer.id,
      name: viewer.name,
      avatarUrl: typeof avatar === 'string' ? avatar : null,
    }
  }
}

export type BrowserAccountManagerOptions = Omit<
  AccountManagerDependencies,
  'storage' | 'oauthIntentStore' | 'navigate'
> & {
  databaseName?: string
}

export function createBrowserAccountManager(
  options: BrowserAccountManagerOptions,
): BrowserAccountManager {
  return new BrowserAccountManager({
    ...options,
    storage: new IndexedDbAccountStorage(options.databaseName),
    oauthIntentStore: new SessionOAuthIntentStore(window.sessionStorage),
    navigate: (url) => window.location.assign(url),
  })
}
