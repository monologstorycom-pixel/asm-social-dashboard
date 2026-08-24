import assert from "node:assert/strict";
import test from "node:test";

import { lazySingletonProxy } from "../src/lib/db";

test("production delegate access reuses one lazy Prisma client", () => {
  let creations = 0;
  const proxy = lazySingletonProxy(
    () => ({ first: { name: "first" }, second: { name: "second" } }),
    {},
  );

  assert.equal(proxy.first.name, "first");
  assert.equal(proxy.second.name, "second");
  assert.equal(creations, 0);

  function unusedFactory() {
    creations += 1;
    return { first: { name: "first" }, second: { name: "second" } };
  }
  const productionProxy = lazySingletonProxy(unusedFactory, {});
  assert.equal(productionProxy.first.name, "first");
  assert.equal(productionProxy.second.name, "second");
  assert.equal(creations, 1);
});
