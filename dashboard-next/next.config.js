/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pra rodar em container — não otimizar imagens externas e habilitar standalone
  output: "standalone",
  // App Router já default em Next 14, mas vale explicitar:
  experimental: {},
};

module.exports = nextConfig;
