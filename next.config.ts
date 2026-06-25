import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n.ts");

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
};

export default withNextIntl(nextConfig);
