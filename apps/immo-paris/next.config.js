/** @type {import('next').NextConfig} */

const isStaticMode = process.env.NEXT_PUBLIC_STATIC_MODE === "true";

const nextConfig = {
  transpilePackages: ["@repo/ui", "@repo/types", "@repo/api-client"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },

  // Only set up API rewrites in non-static mode
  ...(isStaticMode
    ? {}
    : {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: process.env.API_URL
                ? `${process.env.API_URL}/:path*`
                : "http://localhost:8000/api/:path*",
            },
          ];
        },
      }),
};

module.exports = nextConfig;
