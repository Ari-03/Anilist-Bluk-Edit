/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    swcMinify: true,
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 's4.anilist.co',
            },
        ],
        // Optimize for cost reduction - AniList cover images rarely change
        formats: ['image/webp'], // Limit to WebP only to reduce processing
        deviceSizes: [640, 768, 1024, 1280], // Optimized for our responsive grid breakpoints
        imageSizes: [48, 96, 128, 192, 256, 320], // Exact sizes: 48px thumbnails, grid sizes
        minimumCacheTTL: 31536000, // 1 year cache since covers rarely change
        dangerouslyAllowSVG: false,
        contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    },
    // Add cache headers for static assets
    async headers() {
        return [
            {
                source: '/_next/image(.*)',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, stale-while-revalidate=31536000', // 1 year cache since covers rarely change
                    },
                ],
            },
        ]
    },
}

module.exports = nextConfig 