import type {NextConfig} from "next";

const nextConfig: NextConfig = {
    serverExternalPackages: ["@napi-rs/canvas"],
    experimental: {
        authInterrupts: true,
    },
    images: {
        remotePatterns: [
            // user uploaded avatars
            {
                protocol: "https",
                hostname: "cdn.discordapp.com",
                port: "",
                pathname: "/avatars/**",
            },

            // colour avatars built into discord for users without a custom avatar
            {
                protocol: "https",
                hostname: "cdn.discordapp.com",
                port: "",
                pathname: "/embed/avatars/**",
            }
        ]
    }
};

export default nextConfig;
