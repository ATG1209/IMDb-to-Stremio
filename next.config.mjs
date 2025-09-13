import { execSync } from 'node:child_process';

function getCommit() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return null;
  }
}

const config = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || getCommit(),
  },
};

export default config;

