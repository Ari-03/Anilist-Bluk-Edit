import { useEffect } from 'react'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { Inter } from 'next/font/google'
import { LazyMotion, domAnimation } from 'framer-motion'
import { Analytics } from '@vercel/analytics/next'
import { useStore } from '@/store'
import '@/styles/globals.css'

const inter = Inter({
    subsets: ['latin'],
    display: 'swap',
})

export default function App({ Component, pageProps }: AppProps) {
    const darkMode = useStore(s => s.darkMode)

    // public/theme.js sets the class before paint; this keeps it in sync on toggle
    useEffect(() => {
        document.documentElement.classList.toggle('dark', darkMode)
    }, [darkMode])

    return (
        <>
            <Head>
                <title>AniList Bulk Edit</title>
            </Head>
            <style jsx global>{`
                :root {
                    --font-sans: ${inter.style.fontFamily};
                }
            `}</style>
            <LazyMotion features={domAnimation} strict>
                <Component {...pageProps} />
            </LazyMotion>
            <Analytics />
        </>
    )
}
