import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
    return (
        <Html lang="en">
            <Head>
                {/* Favicon configuration */}
                <link rel="icon" type="image/x-icon" href="/favicon.ico" />
                <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
                <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
                <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
                <link rel="manifest" href="/site.webmanifest" />
                
                {/* Android Chrome icons */}
                <link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png" />
                <link rel="icon" type="image/png" sizes="512x512" href="/android-chrome-512x512.png" />
                
                {/* Theme colors */}
                <meta name="theme-color" content="#2980b9" />
                <meta name="msapplication-TileColor" content="#2980b9" />
                
                {/* Web app metadata */}
                <meta name="application-name" content="AniList Bulk Edit" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="default" />
                <meta name="apple-mobile-web-app-title" content="ABE" />
                <meta name="mobile-web-app-capable" content="yes" />
                
                {/* SEO and social metadata */}
                <meta name="description" content="Bulk edit your AniList anime and manga collections with advanced filtering and management tools" />
                <meta name="keywords" content="AniList, anime, manga, bulk edit, collection management" />
                <meta property="og:title" content="AniList Bulk Edit" />
                <meta property="og:description" content="Bulk edit your AniList anime and manga collections with advanced filtering and management tools" />
                <meta property="og:type" content="website" />
                <meta property="og:image" content="/android-chrome-512x512.png" />
                <meta name="twitter:card" content="summary" />
                <meta name="twitter:title" content="AniList Bulk Edit" />
                <meta name="twitter:description" content="Bulk edit your AniList anime and manga collections with advanced filtering and management tools" />
                <meta name="twitter:image" content="/android-chrome-512x512.png" />
            </Head>
            <body>
                <Main />
                <NextScript />
            </body>
        </Html>
    )
}