import { useState } from 'react'
import { NextPageContext } from 'next'
import Link from 'next/link'
import { AlertTriangle, RefreshCw, Home, Copy, Check } from 'lucide-react'
import StatusPage, { ISSUES_URL } from '@/components/ui/StatusPage'

interface ErrorProps {
    statusCode?: number
    err?: Error & { digest?: string }
}

const describe = (statusCode?: number): { title: string; message: string } => {
    if (statusCode === 404) return { title: 'Page not found', message: "The page you're looking for doesn't exist or has been moved." }
    if (statusCode && statusCode >= 500) return { title: 'Server error', message: 'Something went wrong on our end. Try again in a moment.' }
    if (statusCode && statusCode >= 400) return { title: `Error ${statusCode}`, message: 'The request could not be completed.' }
    return { title: 'Something went wrong', message: 'An unexpected error occurred. Refreshing the page usually fixes it.' }
}

/** Fallback for server errors and uncaught client errors */
function Error({ statusCode, err }: ErrorProps) {
    const [copied, setCopied] = useState(false)
    const { title, message } = describe(statusCode)

    const copyDetails = async () => {
        const details = {
            timestamp: new Date().toISOString(),
            statusCode,
            url: window.location.href,
            userAgent: navigator.userAgent,
            error: err?.message,
            stack: err?.stack,
            digest: err?.digest,
        }
        try {
            await navigator.clipboard.writeText(JSON.stringify(details, null, 2))
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (error) {
            console.error('Failed to copy error details:', error)
        }
    }

    return (
        <StatusPage
            title={title}
            icon={AlertTriangle}
            tone="danger"
            actions={
                <>
                    <button onClick={() => window.location.reload()} className="btn-primary">
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                    <Link href="/" className="btn-secondary">
                        <Home className="w-4 h-4" />
                        Go to home
                    </Link>
                    <button onClick={copyDetails} className="btn-ghost">
                        {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'Copied' : 'Copy error details'}
                    </button>
                </>
            }
        >
            <p>{message}</p>
            <p className="text-xs text-fg-subtle">
                If it keeps happening,{' '}
                <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" className="text-accent-strong hover:underline">
                    report the issue
                </a>{' '}
                with the copied details.
            </p>
        </StatusPage>
    )
}

Error.getInitialProps = ({ res, err }: NextPageContext) => {
    const statusCode = res ? res.statusCode : err ? err.statusCode : 404
    return { statusCode }
}

export default Error
