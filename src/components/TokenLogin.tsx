import React from 'react'
import { Layers, Zap, ListChecks } from 'lucide-react'
import TokenLoginForm from '@/components/TokenLoginForm'

const TokenLogin: React.FC = () => {
    return (
        <div className="min-h-screen bg-page relative flex items-center justify-center p-4 overflow-hidden">
            {/* Ambient gradient blobs */}
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-accent/20 blur-3xl" />
            <div className="absolute -bottom-40 -right-24 w-[28rem] h-[28rem] rounded-full bg-status-completed/15 blur-3xl" />

            <div className="relative w-full max-w-md">
                <div className="card shadow-overlay p-8">
                    <div className="text-center mb-8">
                        <div className="w-14 h-14 rounded-2xl brand-gradient mx-auto mb-4 flex items-center justify-center shadow-raised">
                            <Layers className="w-7 h-7 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-fg">AniList Bulk Edit</h1>
                        <p className="mt-1.5 text-sm text-fg-muted">
                            Update, organize, and clean up your whole list in a few clicks
                        </p>
                    </div>

                    <TokenLoginForm />

                    <div className="mt-8 pt-6 border-t border-edge grid grid-cols-2 gap-3 text-left">
                        <div className="flex items-start gap-2">
                            <ListChecks className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-fg-muted">Bulk edit status, score, progress & custom lists</p>
                        </div>
                        <div className="flex items-start gap-2">
                            <Zap className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-fg-muted">Rate-limit aware — safe on large libraries</p>
                        </div>
                    </div>
                </div>

                <p className="mt-4 text-center text-xs text-fg-subtle">
                    Your token stays in your browser; edits go straight to AniList.
                </p>
            </div>
        </div>
    )
}

export default TokenLogin
