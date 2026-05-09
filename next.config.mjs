/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Proxy all API requests to the backend to bypass CORS
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
