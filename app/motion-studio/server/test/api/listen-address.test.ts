// S17b: сервер слушает только 127.0.0.1; порт — из config.json (`server.port`), по умолчанию 8790.
import { expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { listenAddress } from "../../src/main.js";

it("адрес сервера: хост всегда 127.0.0.1, порт из конфигурации", () => {
  expect(listenAddress(loadConfig({ MS_DATA_DIR: "/Volumes/Test/MotionStudio" }))).toEqual({ host: "127.0.0.1", port: 8790 });
  expect(listenAddress(loadConfig({ MS_DATA_DIR: "/Volumes/Test/MotionStudio" }, { server: { port: 8791 } }))).toEqual({ host: "127.0.0.1", port: 8791 });
});
