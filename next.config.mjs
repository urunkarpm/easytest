/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium", "sharp", "archiver"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
