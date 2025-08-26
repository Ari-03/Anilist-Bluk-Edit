import type { AppProps } from 'next/app'
import { AuthProvider } from '@/contexts/AuthContext'
import { Analytics } from '@vercel/analytics/next'
import '@/styles/globals.css'
import '@/styles/sliders.css'

export default function App({ Component, pageProps }: AppProps) {
    return (
        <AuthProvider>
            <Component {...pageProps} />
            <Analytics />
        </AuthProvider>
    )
} 