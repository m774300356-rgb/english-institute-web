/** @type {import('next').NextConfig} */
const nextConfig = {
  // next/image isn't used in this project; disabling the optimizer closes
  // its attack surface (GHSA-2xp9-vwfh-vxw4) without a Next major upgrade.
  images: { unoptimized: true },
};

export default nextConfig;
