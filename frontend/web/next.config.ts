import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Fully static marketing site — no API routes, middleware, or
    // server-side data. Static export lets this deploy as a Render
    // Static Site (free, no cold starts) instead of a Node web service.
    output: "export",
    images: {
        // The Next.js Image Optimization API needs a running server;
        // static export has none, so serve images unoptimized instead.
        unoptimized: true,
    },
};

export default nextConfig;
