// Chrome Headless Shell для рендера: `npm ci` стирает node_modules вместе с
// `.remotion/`, поэтому Makefile зовёт этот скрипт сразу после установки.
import { ensureRenderBrowser } from "../render/src/node/browser.ts";

const { path } = await ensureRenderBrowser();
console.log(`chrome-headless-shell: ${path}`);
