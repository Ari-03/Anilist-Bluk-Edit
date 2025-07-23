import type { AppProps } from 'next/app'
import { AuthProvider } from '@/contexts/AuthContext'
import '@/styles/globals.css'
import '@/styles/sliders.css'

export default function App({ Component, pageProps }: AppProps) {
    return (
        <AuthProvider>
            <Component {...pageProps} />
        </AuthProvider>
    )
} 