import { ReactNode } from 'react'
import Head from 'next/head'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export const ISSUES_URL = 'https://github.com/Ari-03/Anilist-Bluk-Edit/issues'

type Tone = 'accent' | 'success' | 'warning' | 'danger'

const toneClasses: Record<Tone, string> = {
    accent: 'bg-accent/15 text-accent-strong',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-danger/15 text-danger',
}

/** Full-screen centered card for standalone pages (404, errors, the OAuth callback) */
export default function StatusPage({
    title,
    icon: Icon,
    tone = 'accent',
    spin = false,
    children,
    actions,
}: {
    title: string
    icon: LucideIcon
    tone?: Tone
    spin?: boolean
    children?: ReactNode
    actions?: ReactNode
}) {
    return (
        <>
            <Head>
                <title>{`${title} · AniList Bulk Edit`}</title>
            </Head>
            <main className="min-h-screen bg-page flex items-center justify-center p-4">
                <div className="card shadow-overlay w-full max-w-md p-8 text-center">
                    <div className={cn('w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center', toneClasses[tone])}>
                        <Icon className={cn('w-6 h-6', spin && 'animate-spin')} aria-hidden />
                    </div>
                    <h1 className="text-xl font-bold text-fg">{title}</h1>
                    {children && <div className="mt-2 text-sm text-fg-muted space-y-2">{children}</div>}
                    {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
                </div>
            </main>
        </>
    )
}
