const gateway=process.env.PRISM_PREVIEW_GATEWAY==='1';
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@ips/ui', '@ips/contracts', '@ips/domain', '@ips/scoring-engine'],
  basePath: gateway?'/controller':'',
  poweredByHeader:false
};
export default nextConfig;
