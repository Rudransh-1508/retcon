const api = process.env.RETCON_API ?? 'http://127.0.0.1:8000'
const dev = process.env.NODE_ENV === 'development'

/** @type {import('next').NextConfig} */
export default {
  // Production is a static export served by Vercel next to the Python function in /api.
  output: dev ? undefined : 'export',
  agentRules: false,
  reactStrictMode: true,
  poweredByHeader: false,
  ...(dev && {
    rewrites: async () => [
      { source: '/api/:path*', destination: `${api}/api/:path*` },
      { source: '/mcp', destination: `${api}/mcp` },
    ],
  }),
}
