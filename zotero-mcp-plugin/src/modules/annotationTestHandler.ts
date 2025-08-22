/**
 * 注释测试端点处理器
 */

import { handleAnnotationTest } from "./annotationTest";

declare let ztoolkit: ZToolkit;

/**
 * Handles GET /test/annotations endpoint.
 * @returns A promise that resolves to an HttpResponse.
 */
export async function handleAnnotationTestEndpoint(): Promise<any> {
  ztoolkit.log("[MCP ApiHandlers] handleAnnotationTestEndpoint called");

  try {
    const testResult = await handleAnnotationTest();

    ztoolkit.log(`[MCP ApiHandlers] Annotation test completed`);

    return testResult;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    ztoolkit.log(
      `[MCP ApiHandlers] Error in handleAnnotationTestEndpoint: ${error.message}`,
      "error",
    );

    return {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: error.message }),
    };
  }
}
