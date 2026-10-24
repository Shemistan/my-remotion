// Общая настройка юнит-тестов UI: разметка каждого теста убирается после него; у jsdom нет
// воспроизведения медиа — play/pause заглушены (иначе jsdom пишет «Not implemented» в вывод).
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value() {} });
Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() });

afterEach(() => cleanup());
