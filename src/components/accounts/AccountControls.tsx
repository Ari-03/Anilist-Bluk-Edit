import { useState } from 'react'
import { ChevronDown, ExternalLink, Github, Moon, Plus, RotateCw, ShieldAlert, Sun, Trash2, Unplug } from 'lucide-react'

import { useApp } from '@/contexts/AppContext'
import { AccountAvatar } from '@/components/ui/AccountAvatar'

interface AccountControlsProps {
  refreshing: boolean
  onRefresh(): void
  onMessage(message: string, type?: 'error' | 'info'): void
}

export function AccountControls({ refreshing, onRefresh, onMessage }: AccountControlsProps) {
  const {
    accounts,
    activeAccount,
    jobRunning,
    darkMode,
    activate,
    beginLink,
    remove,
    forgetAll,
    toggleDarkMode,
  } = useApp()
  const [busy, setBusy] = useState(false)

  if (!activeAccount) return null

  const run = async (operation: () => Promise<void>) => {
    setBusy(true)
    try {
      await operation()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'The account action failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const removeActive = () => {
    if (!window.confirm(`Remove ${activeAccount.name} from this browser? AniList access is not revoked.`)) return
    void run(() => remove(activeAccount.id))
  }

  const forgetEveryAccount = () => {
    if (!window.confirm('Forget every linked account and its local preferences?')) return
    void run(forgetAll)
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1 sm:gap-2">
      <label className="sr-only" htmlFor="active-account">Active AniList account</label>
      <div className="relative flex min-w-0 items-center">
        <AccountAvatar name={activeAccount.name} avatarUrl={activeAccount.avatarUrl} size="sm" alt="" className="pointer-events-none absolute left-2 z-10" />
        <select
          id="active-account"
          value={activeAccount.id}
          disabled={jobRunning || busy}
          onChange={(event) => void run(() => activate(Number(event.target.value)))}
          className="min-h-11 max-w-44 appearance-none rounded-xl border border-slate-300 bg-white py-2 pl-12 pr-8 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id} disabled={account.state !== 'ready'}>
              {account.name}{account.state === 'ready' ? '' : ' · reconnect'}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4" aria-hidden="true" />
      </div>

      <button type="button" className="grid min-h-11 min-w-11 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800" onClick={onRefresh} disabled={refreshing} aria-label="Refresh active list">
        <RotateCw className={`h-5 w-5 ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
      </button>
      <button type="button" className="grid min-h-11 min-w-11 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" onClick={toggleDarkMode} aria-label={darkMode ? 'Use light theme' : 'Use dark theme'}>
        {darkMode ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
      </button>

      <details className="relative">
        <summary className="grid min-h-11 min-w-11 cursor-pointer list-none place-items-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Account actions">
          <ChevronDown className="h-5 w-5" aria-hidden="true" />
        </summary>
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <p className="px-3 py-2 text-sm font-semibold">{activeAccount.name}</p>
          <div className="mb-2 border-y border-slate-200 py-1 dark:border-slate-700" aria-label="Linked AniList accounts">
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                className="flex min-h-12 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-slate-100 disabled:opacity-60 dark:hover:bg-slate-800"
                disabled={jobRunning || busy || account.state !== 'ready' || account.id === activeAccount.id}
                onClick={() => void run(() => activate(account.id))}
                aria-label={`${account.id === activeAccount.id ? 'Active account' : 'Switch to'} ${account.name}`}
              >
                <AccountAvatar name={account.name} avatarUrl={account.avatarUrl} size="sm" alt="" />
                <span className="min-w-0 flex-1 truncate font-semibold">{account.name}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {account.id === activeAccount.id
                    ? 'Active'
                    : account.state === 'ready'
                      ? 'Switch'
                      : 'Reconnect'}
                </span>
              </button>
            ))}
          </div>
          <div className="mx-1 mb-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <p className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Linked AniList tokens are stored locally in this browser and are accessible to scripts running on this site.</span>
            </p>
            <a
              className="mt-2 inline-flex min-h-11 items-center gap-2 font-semibold underline"
              href="https://github.com/Ari-03/Anilist-Bluk-Edit"
              target="_blank"
              rel="noreferrer"
            >
              <Github className="h-4 w-4" aria-hidden="true" /> Inspect source code
            </a>
          </div>
          <button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800" disabled={jobRunning || busy} onClick={() => beginLink('/')}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add or reconnect account
          </button>
          <button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40" disabled={jobRunning || busy} onClick={removeActive}>
            <Unplug className="h-4 w-4" aria-hidden="true" /> Remove active account
          </button>
          <button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40" disabled={jobRunning || busy} onClick={forgetEveryAccount}>
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Forget all accounts
          </button>
          <a className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm hover:bg-slate-100 dark:hover:bg-slate-800" href="https://anilist.co/settings/developer" target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" aria-hidden="true" /> AniList developer settings
          </a>
        </div>
      </details>
    </div>
  )
}
