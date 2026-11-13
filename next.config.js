const isDev = process.env.NODE_ENV !== 'production'

// Covers come from AniList's CDN, optionally through ImageKit
const imageKitOrigin = (() => {
    try {
        return new URL(process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || '').origin
    } catch {
        return ''
    }
})()

// The browser talks to AniList directly with tokens kept in localStorage, so
// the CSP is the main guard against script injection reading them. Dev mode
// needs eval and websockets for fast refresh, and stays frameable for previews.
const csp = [
    "default-src 'self'",
    `script-src 'self'${isDev ? " 'unsafe-eval' 'unsafe-inline'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://*.anilist.co ${imageKitOrigin}`.trim(),
    "font-src 'self'",
    `connect-src 'self' https://graphql.anilist.co${isDev ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isDev ? [] : ["frame-ancestors 'none'"]),
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // The T3 preview (and anyone typing the IP) opens the dev server as
    // 127.0.0.1; without this Next 16 blocks HMR and the dev font as cross-origin.
    allowedDevOrigins: ['127.0.0.1'],
    // Stop `next dev` from regenerating AGENTS.md / CLAUDE.md on every start
    agentRules: false,
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    { key: 'Content-Security-Policy', value: csp },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
                ],
            },
        ]
    },
    images: {
        // ImageKit SDK will handle image optimization
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 's4.anilist.co',
            },
            {
                protocol: 'https',
                hostname: 'ik.imagekit.io',
            },
        ],
        formats: ['image/webp', 'image/avif'],
        deviceSizes: [640, 768, 1024, 1280, 1536],
        imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
        minimumCacheTTL: 31536000, // 1 year cache since covers rarely change
        dangerouslyAllowSVG: false,
        contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    },
}

module.exports = nextConfig
