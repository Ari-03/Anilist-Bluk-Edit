/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // The T3 preview (and anyone typing the IP) opens the dev server as
    // 127.0.0.1; without this Next 16 blocks HMR and the dev font as cross-origin.
    allowedDevOrigins: ['127.0.0.1'],
    // Stop `next dev` from regenerating AGENTS.md / CLAUDE.md on every start
    agentRules: false,
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
