/** @type {import('next').NextConfig} */
// Railway deploys this app as the @ips/controller workspace from the monorepo root.
const nextConfig = {
  transpilePackages: ['@ips/ui', '@ips/contracts', '@ips/domain', '@ips/scoring-engine'],
};
export default nextConfig;
