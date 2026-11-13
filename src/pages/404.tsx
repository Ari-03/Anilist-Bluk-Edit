import Link from 'next/link'
import { useRouter } from 'next/router'
import { Home, ArrowLeft, SearchX } from 'lucide-react'
import StatusPage from '@/components/ui/StatusPage'

export default function Custom404() {
    const router = useRouter()

    return (
        <StatusPage
            title="Page not found"
            icon={SearchX}
            actions={
                <>
                    <Link href="/" className="btn-primary">
                        <Home className="w-4 h-4" />
                        Go to home
                    </Link>
                    <button onClick={() => router.back()} className="btn-secondary">
                        <ArrowLeft className="w-4 h-4" />
                        Go back
                    </button>
                </>
            }
        >
            <p>The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
        </StatusPage>
    )
}
