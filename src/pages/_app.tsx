import type { AppProps } from 'next/app'
import { Inter } from 'next/font/google'
import { LazyMotion, domAnimation } from 'framer-motion'
import { AuthProvider } from '@/contexts/AuthContext'
import { Analytics } from '@vercel/analytics/next'
import '@/styles/globals.css'

const inter = Inter({
    subsets: ['latin'],
    display: 'swap',
})

export default function App({ Component, pageProps }: AppProps) {
    return (
        <>
            <style jsx global>{`
                :root {
                    --font-sans: ${inter.style.fontFamily};
                }
            `}</style>
            <AuthProvider>
                <LazyMotion features={domAnimation} strict>
                    <Component {...pageProps} />
                </LazyMotion>
                <Analytics />
            </AuthProvider>
        </>
    )
}
