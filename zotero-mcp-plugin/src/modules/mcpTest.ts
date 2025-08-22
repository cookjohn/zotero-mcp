/**
 * MCP Integration Test Module
 * 
 * Tests the integrated MCP server functionality
 */

export interface MCPTestResult {
  testName: string;
  status: 'PASSED' | 'FAILED';
  duration: number;
  result?: any;
  error?: string;
}

export async function testMCPIntegration(): Promise<{
  message: string;
  message_zh: string;
  testResults: {
    summary: {
      total: number;
      passed: number;
      failed: number;
      successRate: string;
    };
    tests: MCPTestResult[];
    timestamp: string;
  };
}> {
  const tests: MCPTestResult[] = [];
  const startTime = Date.now();

  // Test 1: MCP Initialize
  await runTest('MCP Initialize', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: 'test-1',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    };

    // Simulate the MCP server logic
    const { StreamableMCPServer } = await import('./streamableMCPServer');
    const mcpServer = new StreamableMCPServer();
    
    // Test the initialize method through private access
    const response = await (mcpServer as any).processRequest(request);
    
    if (response.result && response.result.protocolVersion === '2024-11-05') {
      return { success: true, response };
    } else {
      throw new Error('Invalid initialize response');
    }
  }, tests);

  // Test 2: Tools List
  await runTest('Tools List', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: 'test-2',
      method: 'tools/list',
      params: {}
    };

    const { StreamableMCPServer } = await import('./streamableMCPServer');
    const mcpServer = new StreamableMCPServer();
    
    const response = await (mcpServer as any).processRequest(request);
    
    if (response.result && response.result.tools && Array.isArray(response.result.tools)) {
      const tools = response.result.tools;
      const expectedTools = ['search_library', 'search_annotations', 'get_item_details'];
      const hasExpectedTools = expectedTools.every(tool => 
        tools.some((t: any) => t.name === tool)
      );
      
      if (hasExpectedTools) {
        return { success: true, toolCount: tools.length, tools: tools.map((t: any) => t.name) };
      } else {
        throw new Error('Missing expected tools');
      }
    } else {
      throw new Error('Invalid tools list response');
    }
  }, tests);

  // Test 3: Tool Call - Ping
  await runTest('Tool Call - Ping', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: 'test-3',
      method: 'tools/call',
      params: {
        name: 'ping',
        arguments: {}
      }
    };

    const { StreamableMCPServer } = await import('./streamableMCPServer');
    const mcpServer = new StreamableMCPServer();
    
    const response = await (mcpServer as any).processRequest(request);
    
    if (response.result) {
      return { success: true, response: response.result };
    } else {
      throw new Error('Ping tool call failed');
    }
  }, tests);

  // Test 4: MCP Status
  await runTest('MCP Server Status', async () => {
    const { StreamableMCPServer } = await import('./streamableMCPServer');
    const mcpServer = new StreamableMCPServer();
    
    const status = mcpServer.getStatus();
    
    if (status.serverInfo && status.protocolVersion && status.availableTools) {
      return { success: true, status };
    } else {
      throw new Error('Invalid status response');
    }
  }, tests);

  // Test 5: Error Handling
  await runTest('Error Handling', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: 'test-5',
      method: 'invalid/method',
      params: {}
    };

    const { StreamableMCPServer } = await import('./streamableMCPServer');
    const mcpServer = new StreamableMCPServer();
    
    const response = await (mcpServer as any).processRequest(request);
    
    if (response.error && response.error.code === -32601) {
      return { success: true, error: response.error };
    } else {
      throw new Error('Error handling failed');
    }
  }, tests);

  const endTime = Date.now();
  const duration = endTime - startTime;

  const summary = {
    total: tests.length,
    passed: tests.filter(t => t.status === 'PASSED').length,
    failed: tests.filter(t => t.status === 'FAILED').length,
    successRate: `${((tests.filter(t => t.status === 'PASSED').length / tests.length) * 100).toFixed(1)}%`
  };

  ztoolkit.log(`[MCPTest] Completed ${tests.length} tests in ${duration}ms: ${summary.passed} passed, ${summary.failed} failed`);

  return {
    message: "MCP integration test completed",
    message_zh: "MCP集成测试完成",
    testResults: {
      summary,
      tests,
      timestamp: new Date().toISOString()
    }
  };
}

async function runTest(
  testName: string,
  testFunction: () => Promise<any>,
  tests: MCPTestResult[]
): Promise<void> {
  const startTime = Date.now();
  try {
    ztoolkit.log(`[MCPTest] Running: ${testName}`);
    const result = await testFunction();
    const duration = Date.now() - startTime;
    
    tests.push({
      testName,
      status: 'PASSED',
      duration,
      result
    });
    
    ztoolkit.log(`[MCPTest] ✓ ${testName} passed in ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    tests.push({
      testName,
      status: 'FAILED',
      duration,
      error: errorMessage
    });
    
    ztoolkit.log(`[MCPTest] ✗ ${testName} failed in ${duration}ms: ${errorMessage}`);
  }
}