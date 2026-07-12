import { useState } from 'react'
import { ExternalLink, Github, KeyRound, LoaderCircle, ShieldAlert, Trash2 } from 'lucide-react'

import { useApp } from '@/contexts/AppContext'
import { AccountAvatar } from '@/components/ui/AccountAvatar'

export function Onboarding() {
  const {
    status,
    startupError,
    accounts,
    legacyCandidate,
    beginLink,
    activate,
    remove,
    forgetAll,
    importLegacy,
    deleteLegacy,
  } = useApp()
  const [busy, setBusy] = useState<'import' | 'delete' | null>(null)
  const [switchingAccountId, setSwitchingAccountId] = useState<number | null>(null)
  const [removingAccountId, setRemovingAccountId] = useState<number | null>(null)
  const [forgettingAll, setForgettingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clientConfigured = Boolean(process.env.NEXT_PUBLIC_ANILIST_CLIENT_ID)

  const handleImport = async () => {
    setBusy('import')
    setError(null)
    try {
      await importLegacy()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The legacy account could not be imported.')
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = () => {
    setBusy('delete')
    deleteLegacy()
    setBusy(null)
  }

  const handleActivate = async (accountId: number) => {
    setSwitchingAccountId(accountId)
    setError(null)
    try {
      await activate(accountId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The account could not be activated.')
    } finally {
      setSwitchingAccountId(null)
    }
  }

  const handleRemove = async (accountId: number, accountName: string) => {
    if (
      !window.confirm(
        `Remove ${accountName} from this browser? This does not revoke AniList access.`,
      )
    ) {
      return
    }
    setRemovingAccountId(accountId)
    setError(null)
    try {
      await remove(accountId)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The account could not be removed.',
      )
    } finally {
      setRemovingAccountId(null)
    }
  }

  const handleForgetAll = async () => {
    if (
      !window.confirm(
        'Forget every linked account and local preference? This does not revoke AniList access.',
      )
    ) {
      return
    }
    setForgettingAll(true)
    setError(null)
    try {
      await forgetAll()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The accounts could not be forgotten.',
      )
    } finally {
      setForgettingAll(false)
    }
  }

  const accountActionBusy =
    switchingAccountId !== null || removingAccountId !== null || forgettingAll
  const onboardingBusy = busy !== null || accountActionBusy

  if (status === 'booting') {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center" role="status">
          <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-sky-500 motion-reduce:animate-none" aria-hidden="true" />
          <p className="mt-3 text-slate-600 dark:text-slate-300">Opening local account storage…</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_38rem)] px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <header className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-700 text-2xl font-black text-white shadow-lg shadow-sky-700/25" aria-hidden="true">A</div>
          <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">AniList Bulk Edit</h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-600 dark:text-slate-300">
            Filter, review, and update an AniList anime or manga collection without losing your place.
          </p>
          <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            Unofficial third-party tool · Not affiliated with AniList
          </p>
        </header>

        <section className="panel mt-8 overflow-hidden" aria-labelledby="link-title">
          <div className="border-b border-slate-200 p-6 dark:border-slate-800 sm:p-8">
            <h2 id="link-title" className="text-xl font-bold">Link an AniList account</h2>
            <p className="mt-2 text-slate-600 dark:text-slate-300">
              AniList will ask you to authorize this browser. Exactly one linked account is active at a time.
            </p>

            <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p>
                <strong>Local token storage:</strong> Linked AniList tokens are stored locally in this browser and are accessible to scripts running on this site.
              </p>
            </div>

            {status === 'error' ? (
              <p className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200" role="alert">
                {startupError ?? 'Local account storage could not be opened.'}
              </p>
            ) : null}

            {error ? (
              <p className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200" role="alert">
                {error}
              </p>
            ) : null}

            {!clientConfigured ? (
              <p className="mt-4 rounded-xl border border-slate-300 p-3 text-sm dark:border-slate-700" role="alert">
                Set <code>NEXT_PUBLIC_ANILIST_CLIENT_ID</code> to enable account linking.
              </p>
            ) : null}

            <button
              type="button"
              className="btn-primary mt-6 w-full"
              disabled={!clientConfigured || status !== 'ready' || onboardingBusy}
              onClick={() => beginLink('/')}
            >
              <KeyRound className="h-5 w-5" aria-hidden="true" /> Link with AniList
            </button>

            <a
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-sky-700 underline dark:text-sky-300"
              href="https://github.com/Ari-03/Anilist-Bluk-Edit"
              target="_blank"
              rel="noreferrer"
            >
              <Github className="h-4 w-4" aria-hidden="true" /> Inspect the source code
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>

          {legacyCandidate ? (
            <div className="bg-sky-50 p-6 dark:bg-sky-950/25 sm:px-8" aria-labelledby="legacy-title">
              <h2 id="legacy-title" className="font-bold">Old local sign-in found</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Import validates the account before moving its token to IndexedDB. Nothing is imported silently.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button className="btn-primary" disabled={onboardingBusy} onClick={() => void handleImport()}>
                  {busy === 'import' ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                  Import old account
                </button>
                <button className="btn-secondary" disabled={onboardingBusy} onClick={handleDelete}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete old sign-in
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {accounts.length > 0 ? (
          <section className="mt-6" aria-labelledby="linked-accounts-title">
            <h2 id="linked-accounts-title" className="subtle-label px-1">Linked accounts</h2>
            <ul className="mt-2 space-y-2">
              {accounts.map((account) => (
                <li key={account.id} className="panel flex flex-wrap items-center gap-3 p-3">
                  <AccountAvatar name={account.name} avatarUrl={account.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{account.name}</p>
                    <p className={`text-sm ${
                      account.state === 'ready'
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-amber-700 dark:text-amber-300'
                    }`}>
                      {account.state === 'ready' ? 'Ready to use' : 'Reconnect required'}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {account.state === 'ready' ? (
                      <button
                        className="btn-secondary"
                        onClick={() => void handleActivate(account.id)}
                        disabled={onboardingBusy}
                      >
                        {switchingAccountId === account.id ? 'Switching…' : 'Switch'}
                      </button>
                    ) : (
                      <button
                        className="btn-secondary"
                        onClick={() => beginLink('/')}
                        disabled={!clientConfigured || onboardingBusy}
                      >
                        Reconnect
                      </button>
                    )}
                    <button
                      className="btn-danger"
                      onClick={() => void handleRemove(account.id, account.name)}
                      disabled={onboardingBusy}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      {removingAccountId === account.id ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1">
              <a
                className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-sky-700 underline dark:text-sky-300"
                href="https://anilist.co/settings/developer"
                target="_blank"
                rel="noreferrer"
              >
                AniList developer settings
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
              <button
                type="button"
                className="btn-danger"
                disabled={onboardingBusy}
                onClick={() => void handleForgetAll()}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {forgettingAll ? 'Forgetting…' : 'Forget all accounts'}
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  )
}
