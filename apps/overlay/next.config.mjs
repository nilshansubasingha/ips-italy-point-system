/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@ips/ui', '@ips/contracts', '@ips/domain', '@ips/scoring-engine'],
};
export default nextConfig;
