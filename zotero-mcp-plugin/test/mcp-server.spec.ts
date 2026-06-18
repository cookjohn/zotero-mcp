import { testMCPIntegration } from "../src/modules/mcpTest";

describe("Zotero MCP server", () => {
  it("passes safe MCP integration checks", async () => {
    const result = await testMCPIntegration();
    const failures = result.testResults.tests.filter(
      (test) => test.status === "FAILED",
    );

    if (failures.length) {
      (window as any).debug?.({ failures, result });
      expect(JSON.stringify(failures, null, 2)).to.equal("[]");
      return;
    }

    expect(result.testResults.summary.failed).to.equal(0);
    expect(result.testResults.summary.total).to.be.greaterThan(0);
  });
});
