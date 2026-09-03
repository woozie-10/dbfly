import type { NextConfig } from "next";

// GitHub Pages serves project sites under /<repo-name>.
// GITHUB_ACTIONS is set to "true" automatically on GitHub runners,
// so local `next build`/`next start` behavior stays unchanged.
const isGithubActions = process.env.GITHUB_ACTIONS === "true";

// TODO: change this to the actual GitHub repository name if it is not "dbfly"
const REPO_NAME = "dbfly";

const nextConfig: NextConfig = {
  ...(isGithubActions && {
    // Static export — `next build` emits the site into ./out
    output: "export",
    basePath: `/${REPO_NAME}`,
    assetPrefix: `/${REPO_NAME}/`,
  }),
};

export default nextConfig;
