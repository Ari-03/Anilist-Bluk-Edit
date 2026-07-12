import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  AccountPreferencesRepository,
  AniListAccountViewerGateway,
  type AccountSummary,
  type BrowserAccountManager,
  createBrowserAccountManager,
  deleteLegacyAuthentication,
  discoverLegacyAccount,
  importLegacyAccount,
  IndexedDbAccountStorage,
  type LegacyAccountMigration,
  type LegacyAccountSummary,
} from '@/modules/accounts'
import type { AniListGateway } from '@/modules/anilist/types'
import {
  createMediaListWorkspace,
  type ObservableMediaListWorkspace,
} from '@/modules/media-list'

const workspace = createMediaListWorkspace()

type BootstrapStatus = 'booting' | 'ready' | 'error'

interface AppContextValue {
  status: BootstrapStatus
  startupError: string | null
  aniListGateway: AniListGateway | null
  accounts: readonly AccountSummary[]
  activeAccount: AccountSummary | null
  workspace: ObservableMediaListWorkspace
  preferences: AccountPreferencesRepository | null
  legacyCandidate: LegacyAccountSummary | null
  jobRunning: boolean
  darkMode: boolean
  beginLink(returnTo?: string): void
  completeLink(fragment: string): Promise<AccountSummary>
  activate(accountId: number): Promise<void>
  remove(accountId: number): Promise<void>
  forgetAll(): Promise<void>
  importLegacy(): Promise<AccountSummary>
  deleteLegacy(): void
  markReauthenticationRequired(accountId: number): Promise<void>
  setJobRunning(running: boolean): void
  toggleDarkMode(): void
}

const AppContext = createContext<AppContextValue | null>(null)

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The application could not start.'
}

/**
 * Exposes only domain gateway operations. The credential callback and concrete
 * account manager remain captured behind this frozen facade.
 */
function createSafeAniListGateway(
  internalGateway: AniListGateway,
): AniListGateway {
  const publicGateway: AniListGateway = {
    loadMediaListCollection: (request) =>
      internalGateway.loadMediaListCollection(request),
    getMediaListOptionsCatalog: (request) =>
      internalGateway.getMediaListOptionsCatalog(request),
    readMediaRelations: (request) => internalGateway.readMediaRelations(request),
    discoverRelatedSeasons: (request) =>
      internalGateway.discoverRelatedSeasons(request),
    readEntries: (request) => internalGateway.readEntries(request),
    readEntriesByMediaIds: (request) =>
      internalGateway.readEntriesByMediaIds(request),
    updateShared: (request) => internalGateway.updateShared(request),
    saveEntries: (request) => internalGateway.saveEntries(request),
    createEntries: (request) => internalGateway.createEntries(request),
    deleteEntries: (request) => internalGateway.deleteEntries(request),
    getRateLimitStats: () => internalGateway.getRateLimitStats(),
  }
  return Object.freeze(publicGateway)
}

export function AppProvider({ children }: { children: ReactNode }) {
  const managerRef = useRef<BrowserAccountManager | null>(null)
  const legacyMigrationRef = useRef<LegacyAccountMigration | null>(null)
  const [status, setStatus] = useState<BootstrapStatus>('booting')
  const [startupError, setStartupError] = useState<string | null>(null)
  const [aniListGateway, setAniListGateway] = useState<AniListGateway | null>(null)
  const [accounts, setAccounts] = useState<readonly AccountSummary[]>([])
  const [activeAccount, setActiveAccount] = useState<AccountSummary | null>(null)
  const [preferences, setPreferences] = useState<AccountPreferencesRepository | null>(null)
  const [legacyCandidate, setLegacyCandidate] = useState<LegacyAccountSummary | null>(null)
  const [jobRunning, setJobRunning] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false
    const savedTheme = window.localStorage.getItem('anilist-bulk-edit:theme')
    return (
      savedTheme === 'dark' ||
      (savedTheme === null && window.matchMedia('(prefers-color-scheme: dark)').matches)
    )
  })

  const syncSnapshot = useCallback((accountManager?: BrowserAccountManager | null) => {
    const current = accountManager ?? managerRef.current
    if (!current) return
    setAccounts(current.listAccounts())
    setActiveAccount(current.getActiveAccount())
  }, [])

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      try {
        const accountManager = createBrowserAccountManager({
          clientId: process.env.NEXT_PUBLIC_ANILIST_CLIENT_ID ?? '',
          viewerGateway: new AniListAccountViewerGateway(),
          confirmReplacement: (existing) =>
            window.confirm(
              `Replace the locally stored token for ${existing.name}?`,
            ),
          onAccountRemoved: (accountId) => workspace.clearAccount(accountId),
          onForgetAll: () => {
            for (const account of accountManager.listAccounts()) {
              workspace.clearAccount(account.id)
            }
          },
        })
        await accountManager.bootstrap()
        if (cancelled) return

        const preferenceStorage = new IndexedDbAccountStorage()
        await preferenceStorage.bootstrap()
        if (cancelled) return

        const { createBrowserAniListGateway } = await import(
          '@/modules/anilist/gateway'
        )
        if (cancelled) return
        const internalGateway = createBrowserAniListGateway({
          withAccessToken: (accountId, operation) =>
            accountManager.withAccessToken(accountId, operation),
        })

        managerRef.current = accountManager
        setAniListGateway(createSafeAniListGateway(internalGateway))
        setPreferences(new AccountPreferencesRepository(preferenceStorage))
        const legacyMigration = discoverLegacyAccount(window.localStorage)
        legacyMigrationRef.current = legacyMigration
        setLegacyCandidate(legacyMigration?.summary ?? null)
        syncSnapshot(accountManager)
        setStatus('ready')
      } catch (error) {
        if (cancelled) return
        setStartupError(messageOf(error))
        setStatus('error')
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [syncSnapshot])

  useEffect(() => {
    const compatibilityKey = 'anilist-bulk-edit:legacy-cookie-cleared'
    if (window.sessionStorage.getItem(compatibilityKey)) return
    window.sessionStorage.setItem(compatibilityKey, '1')
    void fetch('/api/auth/signout', {
      method: 'POST',
      credentials: 'same-origin',
    })
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    window.localStorage.setItem(
      'anilist-bulk-edit:theme',
      darkMode ? 'dark' : 'light',
    )
  }, [darkMode])

  const requireManager = useCallback((): BrowserAccountManager => {
    const current = managerRef.current
    if (!current) throw new Error('Account storage is still starting.')
    return current
  }, [])

  const beginLink = useCallback(
    (returnTo?: string) => requireManager().beginOAuthLink(returnTo),
    [requireManager],
  )

  const completeLink = useCallback(
    async (fragment: string) => {
      const linked = await requireManager().completeOAuthLink(fragment)
      syncSnapshot()
      return linked
    },
    [requireManager, syncSnapshot],
  )

  const activate = useCallback(
    async (accountId: number) => {
      if (jobRunning) throw new Error('Cancel or finish the current bulk job first.')
      await requireManager().activate(accountId)
      syncSnapshot()
    },
    [jobRunning, requireManager, syncSnapshot],
  )

  const remove = useCallback(
    async (accountId: number) => {
      if (jobRunning) throw new Error('Cancel or finish the current bulk job first.')
      await requireManager().remove(accountId)
      syncSnapshot()
    },
    [jobRunning, requireManager, syncSnapshot],
  )

  const forgetAll = useCallback(async () => {
    if (jobRunning) throw new Error('Cancel or finish the current bulk job first.')
    await requireManager().forgetAll()
    syncSnapshot()
  }, [jobRunning, requireManager, syncSnapshot])

  const importLegacy = useCallback(async () => {
    const legacyMigration = legacyMigrationRef.current
    if (!legacyMigration) throw new Error('No legacy token was found.')
    const linked = await importLegacyAccount(
      legacyMigration,
      requireManager(),
      window.localStorage,
    )
    legacyMigrationRef.current = null
    setLegacyCandidate(null)
    syncSnapshot()
    return linked
  }, [requireManager, syncSnapshot])

  const deleteLegacy = useCallback(() => {
    deleteLegacyAuthentication(window.localStorage)
    legacyMigrationRef.current = null
    setLegacyCandidate(null)
  }, [])

  const markReauthenticationRequired = useCallback(
    async (accountId: number) => {
      await requireManager().markReauthenticationRequired(accountId)
      syncSnapshot()
    },
    [requireManager, syncSnapshot],
  )

  const value = useMemo<AppContextValue>(
    () => ({
      status,
      startupError,
      aniListGateway,
      accounts,
      activeAccount,
      workspace,
      preferences,
      legacyCandidate,
      jobRunning,
      darkMode,
      beginLink,
      completeLink,
      activate,
      remove,
      forgetAll,
      importLegacy,
      deleteLegacy,
      markReauthenticationRequired,
      setJobRunning,
      toggleDarkMode: () => setDarkMode((current) => !current),
    }),
    [
      accounts,
      activate,
      activeAccount,
      aniListGateway,
      beginLink,
      completeLink,
      darkMode,
      deleteLegacy,
      forgetAll,
      importLegacy,
      jobRunning,
      legacyCandidate,
      markReauthenticationRequired,
      preferences,
      remove,
      startupError,
      status,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used within AppProvider.')
  return context
}
