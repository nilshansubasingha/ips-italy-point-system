const gateway=process.env.PRISM_PREVIEW_GATEWAY==='1';
/** @type {import('next').NextConfig} */
const nextConfig={basePath:gateway?'/replay':'',poweredByHeader:false};
export default nextConfig;
