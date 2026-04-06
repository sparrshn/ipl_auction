/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'scores.iplt20.com',
        pathname: '/ipl/teamlogos/**',
      },
    ],
  },
}

module.exports = nextConfig
