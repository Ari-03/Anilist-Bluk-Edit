import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, m } from 'framer-motion'
import { activateAccount, refreshProfile, signOutAccount, signOutAll } from '@/lib/auth'
import { useStore } from '@/store'
import TokenLoginForm from '@/components/TokenLoginForm'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Modal, { ModalTitle } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { Check, ChevronDown, LogOut, UserPlus, X, ExternalLink } from 'lucide-react'

export default function AccountSwitcher() {
    const user = useStore(s => s.user)
    const accounts = useStore(s => s.accounts)
    const activeAccountId = useStore(s => s.activeAccountId)
    // Block switching while anything is writing to or loading from AniList
    const busy = useStore(s => s.isLoadingLists || Object.values(s.entrySync).some(state => state === 'pending'))

    const [open, setOpen] = useState(false)
    const [showAddAccount, setShowAddAccount] = useState(false)
    const [confirmSignOutAll, setConfirmSignOutAll] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    // Dialogs opened from the menu return focus here, since the menu item is gone by then
    const triggerRef = useRef<HTMLButtonElement>(null)

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

    // Switching is instant from the saved profile; the token is re-validated in
    // the background and only a definitive rejection removes the account
    const handleSwitch = (accountId: number) => {
        if (accountId === activeAccountId || busy) return
        activateAccount(accountId)
        void refreshProfile({ quiet: true })
        setOpen(false)
    }

    const handleSignOutActive = () => {
        if (activeAccountId == null) return
        setOpen(false)
        signOutAccount(activeAccountId)
    }

    const handleSignOutAll = () => {
        setConfirmSignOutAll(false)
        setOpen(false)
        signOutAll()
    }

    return (
        <div className="relative" ref={menuRef}>
            <button
                ref={triggerRef}
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 h-10 pl-1.5 pr-2 rounded-lg hover:bg-raised transition-colors"
                title="Accounts"
                aria-expanded={open}
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

                        {accountList.map((account) => {
                            const isActive = account.user.id === activeAccountId
                            return (
                                <button
                                    key={account.user.id}
                                    onClick={() => handleSwitch(account.user.id)}
                                    disabled={busy}
                                    className={cn(
                                        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors',
                                        isActive ? 'bg-accent/10' : 'hover:bg-raised',
                                        busy && !isActive && 'opacity-60'
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
                                    {isActive && <Check className="w-4 h-4 text-accent-strong" strokeWidth={3} />}
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

            <Modal
                open={showAddAccount}
                onClose={() => setShowAddAccount(false)}
                className="max-w-sm p-6"
                fallbackFocus={triggerRef}
            >
                <div className="flex items-start justify-between mb-4">
                    <ModalTitle className="text-base font-semibold text-fg">Add another account</ModalTitle>
                    <button
                        onClick={() => setShowAddAccount(false)}
                        className="btn-icon w-8 h-8 -mt-1 -mr-1"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="space-y-3 mb-4 text-sm text-fg-muted">
                    <p>AniList uses the account already signed in on its website.</p>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>
                            Open AniList, log out from the avatar menu, and sign in to the account
                            you want to add.
                        </li>
                        <li>Return here and connect that account.</li>
                    </ol>
                    <a
                        href="https://anilist.co"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary w-full"
                    >
                        <ExternalLink className="w-4 h-4" />
                        Open AniList to switch accounts
                    </a>
                    <p className="text-xs text-fg-subtle">
                        Your saved accounts stay connected here.
                    </p>
                </div>
                <TokenLoginForm addAccount />
            </Modal>

            <ConfirmDialog
                open={confirmSignOutAll}
                title="Sign out all accounts?"
                confirmLabel="Sign out all"
                danger
                onConfirm={handleSignOutAll}
                onCancel={() => setConfirmSignOutAll(false)}
                fallbackFocus={triggerRef}
            >
                All saved accounts will be removed from this browser.
            </ConfirmDialog>
        </div>
    )
}
