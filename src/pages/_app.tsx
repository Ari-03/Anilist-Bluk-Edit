import { useEffect } from 'react'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { Inter } from 'next/font/google'
import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion'
import { Analytics } from '@vercel/analytics/next'
import { useStore } from '@/store'
import '@/styles/globals.css'

const inter = Inter({
    subsets: ['latin'],
    display: 'swap',
})

export default function App({ Component, pageProps }: AppProps) {

    // public/theme.js sets the theme, accent and cover size before paint; this keeps <html>
    // in sync when they change. Subscribing here, rather than reading the store
    // during render, matters: a saved value that differs from the default would
    // otherwise re-render the app mid-hydration, which React reports as an error.
    useEffect(() => {
        const apply = ({ darkMode, accentColor, coverSize }: ReturnType<typeof useStore.getState>) => {
            document.documentElement.classList.toggle('dark', darkMode)
            document.documentElement.dataset.accent = accentColor
            document.documentElement.style.setProperty('--cover-min', `${coverSize}px`)
        }
        apply(useStore.getState())
        return useStore.subscribe(apply)
    }, [])

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
                <MotionConfig reducedMotion="user">
                    <Component {...pageProps} />
                </MotionConfig>
            </LazyMotion>
            <Analytics />
        </>
    )
}
