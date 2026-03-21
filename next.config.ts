import type { NextConfig } from "next";

const isVercelBuild = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  // Vercel expects the default `.next` output directory during deployment.
  distDir: isVercelBuild ? ".next" : ".next-build",
  async redirects() {
    return [
      {
        source: "/benchmark",
        destination: "/arena",
        permanent: true,
      },
      {
        source: "/benchmark/:id",
        destination: "/arena/:id",
        permanent: true,
      },
      {
        source: "/results",
        destination: "/archive",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;