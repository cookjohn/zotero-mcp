import { expect } from "chai";
import {
  getToolRegistry,
  resetToolRegistry,
} from "../src/modules/toolRegistry.ts";

describe("External Tool Registry compatibility", function () {
  beforeEach(function () {
    (globalThis as any).ztoolkit = { log: () => undefined };
    resetToolRegistry();
  });

  afterEach(function () {
    resetToolRegistry();
  });

  it("keeps pluginID optional and boolean register/unregister semantics", function () {
    const registry = getToolRegistry();
    const registered = registry.registerTool({
      name: "example_tool",
      description: "Example external tool",
      inputSchema: { type: "object", properties: {} },
      handler: () => ({ ok: true }),
    });

    expect(registered).to.equal(true);
    expect(registry.getRegisteredTools()[0].pluginID).to.equal(undefined);
    expect(registry.unregisterTool("example_tool")).to.equal(true);
    expect(registry.unregisterTool("example_tool")).to.equal(false);
  });

  it("reserves built-in and planned tool names", function () {
    const registry = getToolRegistry();

    for (const name of ["sync_bib", "cite", "trash_item", "add_by_identifier"]) {
      expect(() =>
        registry.registerTool({
          name,
          description: "Must not shadow built-in citation file tools",
          inputSchema: { type: "object", properties: {} },
          handler: () => null,
        }),
      ).to.throw("reserved by a built-in tool");
    }
  });
});
