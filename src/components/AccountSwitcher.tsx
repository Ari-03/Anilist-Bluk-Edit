import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { AnimatePresence, m } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { useStore } from '@/store'
import TokenLoginForm from '@/components/TokenLoginForm'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { cn } from '@/lib/utils'
import { Check, ChevronDown, LogOut, UserPlus, Loader2, X, Info } from 'lucide-react'

export default function AccountSwitcher() {
    const { switchAccount, signOut } = useAuth()
    const {
        user,
        accounts,
        activeAccountId,
        isLoadingLists,
        entrySync,
        removeAccount,
        logout,
        addNotification,
    } = useStore()

    const [open, setOpen] = useState(false)
    const [switchingTo, setSwitchingTo] = useState<number | null>(null)
    const [showAddAccount, setShowAddAccount] = useState(false)
    const [confirmSignOutAll, setConfirmSignOutAll] = useState(false)
    const [mounted, setMounted] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => setMounted(true), [])

    // Block switching while anything is writing to or loading from AniList
    const busy = isLoadingLists || Object.values(entrySync).some(s => s === 'pending')

    useEffect(() => {
        if (!open) return
        const onClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onClickOutside)
        window.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onClickOutside)
            window.removeEventListener('keydown', onKey)
        }
    }, [open])

    if (!user) return null

    const accountList = Object.values(accounts).sort((a, b) => a.addedAt - b.addedAt)

    const handleSwitch = async (accountId: number) => {
        const account = accounts[accountId]
        if (!account || accountId === activeAccountId || busy || switchingTo !== null) return

        setSwitchingTo(accountId)
        const result = await switchAccount(account.accessToken)
        setSwitchingTo(null)

        if (result.success) {
            setOpen(false)
        } else {
            // Token no longer valid — drop the saved account
            removeAccount(accountId)
            addNotification({
                type: 'error',
                message: `Couldn't switch to ${account.user.name}: ${result.error || 'token expired'}. The account was removed — add it again to re-link.`
            })
        }
    }

    const handleSignOutActive = async () => {
        if (activeAccountId == null) return
        removeAccount(activeAccountId)
        const remaining = Object.values(useStore.getState().accounts).sort((a, b) => a.addedAt - b.addedAt)
        setOpen(false)
        if (remaining.length > 0) {
            const result = await switchAccount(remaining[0].accessToken)
            if (!result.success) {
                logout()
                signOut()
            }
        } else {
            logout()
            signOut()
        }
    }

    const handleSignOutAll = () => {
        setConfirmSignOutAll(false)
        setOpen(false)
        logout()
        signOut()
    }

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 h-10 pl-1.5 pr-2 rounded-lg hover:bg-raised transition-colors"
                title="Accounts"
            >
                <Image
                    src={user.avatar?.medium || '/default-avatar.png'}
                    alt={user.name}
                    width={28}
                    height={28}
                    className="rounded-full ring-1 ring-edge"
                    unoptimized={true}
                />
                <span className="text-sm font-medium text-fg hidden sm:block">{user.name}</span>
                <ChevronDown className={cn('w-3.5 h-3.5 text-fg-subtle transition-transform', open && 'rotate-180')} />
            </button>

            <AnimatePresence>
                {open && (
                    <m.div
                        initial={{ opacity: 0, y: -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.12, ease: 'easeOut' }}
                        className="absolute right-0 top-full mt-2 w-64 card shadow-overlay p-1.5 z-dropdown"
                    >
                        <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold text-fg-subtle uppercase tracking-wide">
                            Accounts
                        </p>

                        {accountList.map(account => {
                            const isActive = account.user.id === activeAccountId
                            const isSwitching = switchingTo === account.user.id
                            return (
                                <button
                                    key={account.user.id}
                                    onClick={() => handleSwitch(account.user.id)}
                                    disabled={busy || switchingTo !== null}
                                    className={cn(
                                        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors',
                                        isActive ? 'bg-accent/10' : 'hover:bg-raised',
                                        (busy || switchingTo !== null) && !isActive && 'opacity-60'
                                    )}
                                >
                                    <Image
                                        src={account.user.avatar?.medium || '/default-avatar.png'}
                                        alt={account.user.name}
                                        width={26}
                                        height={26}
                                        className="rounded-full"
                                        unoptimized={true}
                                    />
                                    <span className="flex-1 min-w-0 text-sm font-medium text-fg truncate">
                                        {account.user.name}
                                    </span>
                                    {isSwitching ? (
                                        <Loader2 className="w-4 h-4 text-accent animate-spin" />
                                    ) : isActive ? (
                                        <Check className="w-4 h-4 text-accent" strokeWidth={3} />
                                    ) : null}
                                </button>
                            )
                        })}

                        {busy && (
                            <p className="px-2.5 py-1 text-[11px] text-fg-subtle">
                                Switching is disabled while syncing
                            </p>
                        )}

                        <div className="h-px bg-edge my-1.5" />

                        <button
                            onClick={() => {
                                setOpen(false)
                                setShowAddAccount(true)
                            }}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm font-medium text-fg hover:bg-raised transition-colors"
                        >
                            <UserPlus className="w-4 h-4 text-fg-muted" />
                            Add another account
                        </button>

                        <button
                            onClick={handleSignOutActive}
                            disabled={busy}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm font-medium text-fg hover:bg-raised transition-colors disabled:opacity-50"
                        >
                            <LogOut className="w-4 h-4 text-fg-muted" />
                            Sign out {user.name}
                        </button>

                        {accountList.length > 1 && (
                            <button
                                onClick={() => {
                                    setOpen(false)
                                    setConfirmSignOutAll(true)
                                }}
                                disabled={busy}
                                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm font-medium text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                            >
                                <LogOut className="w-4 h-4" />
                                Sign out all accounts
                            </button>
                        )}
                    </m.div>
                )}
            </AnimatePresence>

            {/* Add-account dialog — portaled to <body>: the header's backdrop-filter
                would otherwise become the containing block for this fixed overlay,
                centering it on the header instead of the viewport. */}
            {mounted && createPortal(
                <AnimatePresence>
                    {showAddAccount && (
                        <m.div
                            className="fixed inset-0 z-confirm flex items-center justify-center p-4"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                        >
                            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setShowAddAccount(false)} />
                            <m.div
                                role="dialog"
                                aria-modal="true"
                                className="relative w-full max-w-sm card p-6 shadow-overlay"
                                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.97, y: 4 }}
                                transition={{ duration: 0.18, ease: 'easeOut' }}
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <h3 className="text-base font-semibold text-fg">Add another account</h3>
                                    <button onClick={() => setShowAddAccount(false)} className="btn-icon w-8 h-8 -mt-1 -mr-1">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="flex items-start gap-2 rounded-lg bg-accent/5 border border-accent/20 p-2.5 mb-4">
                                    <Info className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
                                    <p className="text-xs leading-relaxed text-fg-muted">
                                        Log into the other account on anilist.co first — the OAuth page uses
                                        whichever AniList account is currently signed in there.
                                    </p>
                                </div>
                                <TokenLoginForm />
                            </m.div>
                        </m.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            <ConfirmDialog
                open={confirmSignOutAll}
                title="Sign out all accounts?"
                confirmLabel="Sign out all"
                danger
                onConfirm={handleSignOutAll}
                onCancel={() => setConfirmSignOutAll(false)}
            >
                All saved accounts will be removed from this browser.
            </ConfirmDialog>
        </div>
    )
}
