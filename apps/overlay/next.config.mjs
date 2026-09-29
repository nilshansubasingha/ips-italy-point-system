const gateway=process.env.PRISM_PREVIEW_GATEWAY==='1';
/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: gateway ? '/overlay' : '',
  transpilePackages: ['@ips/ui', '@ips/contracts', '@ips/domain', '@ips/scoring-engine'],
};
export default nextConfig;
