import type { AppProps } from 'next/app'
import { Inter } from 'next/font/google'
import { LazyMotion, domAnimation } from 'framer-motion'
import { AuthProvider } from '@/contexts/AuthContext'
import { Analytics } from '@vercel/analytics/next'
import '@/styles/globals.css'

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-sans',
    display: 'swap',
})

export default function App({ Component, pageProps }: AppProps) {
    return (
        <AuthProvider>
            <LazyMotion features={domAnimation} strict>
                <div className={`${inter.variable} font-sans`}>
                    <Component {...pageProps} />
                </div>
            </LazyMotion>
            <Analytics />
        </AuthProvider>
    )
}
