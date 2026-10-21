import { fileURLToPath } from "node:url";

// Реальный knowledge/ этого репозитория (worktree) и корень исходников (main checkout).
export const repoKnowledge = fileURLToPath(new URL("../../../../../knowledge", import.meta.url));
export const mainCheckout = "/Users/stalyzade/my_track/01_It_development/my-remotion";
export const sourceRoot = process.env.KB_SOURCE_ROOT ?? mainCheckout;
