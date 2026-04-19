/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdf-parse', 'mammoth', 'mongoose', 'bcryptjs', 'jsonwebtoken', 'razorpay'],
  turbopack: {},
};

export default nextConfig;
