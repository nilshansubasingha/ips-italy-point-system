/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@ips/ui', '@ips/contracts', '@ips/domain', '@ips/scoring-engine', '@ips/broadcast'],
};
export default nextConfig;
