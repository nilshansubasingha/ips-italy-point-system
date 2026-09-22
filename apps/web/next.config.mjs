/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@ips/ui', '@ips/contracts', '@ips/domain', '@ips/scoring-engine', '@ips/data'],
};
export default nextConfig;
