import assert from "node:assert/strict";
import { test } from "node:test";
import { assetUrl } from "./assetUrl.ts";

const paths = [
  "heroes/200.png", "suits/300001.png", "skins/200/200001.png",
  "currency/900273.png", "decocardhouse/123.png", "headskin/456.png", "sceneskin/789.png",
];

test("浏览器路径覆盖全部资源目录，兼容裸 UI 文件名", () => {
  for (const path of paths) assert.equal(assetUrl(path), `/haolai/${path}`);
  assert.equal(assetUrl("/ui/relic-slot-pointer.png"), "/static-data/assets/ui/relic-slot-pointer.png");
  assert.equal(assetUrl("icon-stamina.png"), "/static-data/assets/ui/icon-stamina.png");
});

test("拒绝错误层级、任一非法皮肤 ID、路径穿越、未知目录与外部 URL", () => {
  for (const path of [
    "skins/200001.png", "skins/0/1.png", "skins/1/0.png", "skins/+1/2.png", "skins/1/-2.png",
    "skins/1.1/2.png", "skins/1/2/3.png", "skins/../2.png", "skins/1/../../2.png",
    "skins/1/%2e%2e.png", "skins/1%2f2/3.png", "skins/1\\2/3.png", "skins/1/2.png?x=1",
    "heroes/18446744073709551616.png", "heroes/0.png", "unknown/1.png", "ui/../icon-money.png",
    "ui/.png", "ui/icon..png", "https://example.com/1.png", "currency/1.svg",
  ]) assert.equal(assetUrl(path), "", path);
});

test("Windows 和其他 Tauri 运行时使用各自的协议地址", () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { __TAURI_INTERNALS__: {} } });
    for (const [userAgent, base] of [
      ["Windows", "http://yys-cbg-assets.localhost"],
      ["Linux", "yys-cbg-assets://localhost"],
    ]) {
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent } });
      for (const path of paths) assert.equal(assetUrl(path), `${base}/${path}`);
      assert.equal(assetUrl("icon-money.png"), `${base}/ui/icon-money.png`);
      assert.equal(assetUrl("skins/1/../2.png"), "");
    }
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else delete globalThis.window;
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete globalThis.navigator;
  }
});
