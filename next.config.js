/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    output: 'standalone', // Required for Docker deployment
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'api.telegram.org',
            },
            {
                protocol: 'https',
                hostname: 'cdn.huggingface.co',
            },
        ],
    },
}

module.exports = nextConfig
