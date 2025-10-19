/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    swcMinify: true,
    transpilePackages: [
        'antd',
        '@ant-design/icons',
        '@ant-design/icons-svg',
        'rc-util',
        'rc-pagination',
        'rc-picker',
        'rc-table',
        'rc-tree'
    ],
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
    // Add cache headers for static assets
    async headers() {
        return [
            {
                source: '/_next/image(.*)',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, stale-while-revalidate=31536000',
                    },
                ],
            },
        ]
    },
}

module.exports = nextConfig 