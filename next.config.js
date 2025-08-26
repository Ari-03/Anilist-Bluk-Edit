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
        deviceSizes: [640, 750, 828, 1080, 1200], // Common breakpoints for our layout
        imageSizes: [16, 32, 48, 64, 96, 128, 256, 384], // Specific sizes we actually use
        minimumCacheTTL: 2678400, // 31 days cache for cost optimization
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
                        value: 'public, max-age=2678400, stale-while-revalidate=31536000', // 31 days cache, 1 year stale
                    },
                ],
            },
        ]
    },
}

module.exports = nextConfig 