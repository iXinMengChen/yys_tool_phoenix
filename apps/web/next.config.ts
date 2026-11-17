import type { NextConfig } from 'next'
import { env } from './src/env.server'

const { apiBaseUrl, apiProxyUrl } = env

const nextConfig: NextConfig = {
  output: 'standalone',
  agentRules: false,
  experimental: {
    agentFeedback: true,
    // API 商品请求可能排队，保持与商品客户端的五分钟预算一致。
    proxyTimeout: 300_000,
  },
  async redirects() {
    return [
      {
        source: '/yys-cbg-inspector',
        destination: '/yys-cbg-inspector/home',
        permanent: true,
      },
      {
        source: '/:page(home|speed|pve|hero-skills|calculator|relics)',
        destination: '/yys-cbg-inspector/:page',
        permanent: true,
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: `${apiBaseUrl}/:path*`,
        destination: `${apiProxyUrl}${apiBaseUrl}/:path*`,
      },
    ]
  },
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ['@phoenix/api-client', '@phoenix/config', '@phoenix/ui', '@phoenix/utils', '@phoenix/types'],
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
