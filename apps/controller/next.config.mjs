const gateway=process.env.PRISM_PREVIEW_GATEWAY==='1';
/** @type {import('next').NextConfig} */
// Standalone deployments stay at /. The unified PRISM gateway serves Controller at /controller.
const nextConfig = {
  basePath: gateway ? '/controller' : '',
  transpilePackages: ['@ips/ui', '@ips/contracts', '@ips/domain', '@ips/scoring-engine'],
};
export default nextConfig;
