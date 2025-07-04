/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    swcMinify: true,
    images: {
        domains: ['s4.anilist.co', 'media.anilist.co'],
    },
    env: {
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
        ANILIST_CLIENT_ID: process.env.ANILIST_CLIENT_ID,
        ANILIST_CLIENT_SECRET: process.env.ANILIST_CLIENT_SECRET,
    },
}

module.exports = nextConfig 