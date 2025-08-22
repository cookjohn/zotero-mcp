/**
 * 注释和高亮功能测试
 */

import { AnnotationService } from "./annotationService";

declare let ztoolkit: ZToolkit;

interface TestCase {
  name: string;
  description: string;
  testFunction: () => Promise<any>;
}

/**
 * 注释功能测试用例
 */
const annotationTestCases: TestCase[] = [
  {
    name: "获取所有笔记",
    description: "测试获取库中所有笔记的功能",
    testFunction: async () => {
      const service = new AnnotationService();
      return await service.getAllNotes();
    },
  },
  {
    name: "搜索包含关键词的注释",
    description: "测试在注释中搜索特定关键词",
    testFunction: async () => {
      const service = new AnnotationService();
      return await service.searchAnnotations({
        q: "重要",
        limit: "10",
      });
    },
  },
  {
    name: "按类型过滤注释",
    description: "测试只获取特定类型的注释",
    testFunction: async () => {
      const service = new AnnotationService();
      return await service.searchAnnotations({
        type: ["note", "highlight"],
        limit: "10",
      });
    },
  },
  {
    name: "搜索带评论的高亮",
    description: "测试搜索有用户评论的高亮内容",
    testFunction: async () => {
      const service = new AnnotationService();
      return await service.searchAnnotations({
        type: "highlight",
        hasComment: true,
        limit: "10",
      });
    },
  },
  {
    name: "按日期排序的注释",
    description: "测试按修改日期排序获取注释",
    testFunction: async () => {
      const service = new AnnotationService();
      return await service.searchAnnotations({
        sort: "dateModified",
        direction: "desc",
        limit: "5",
      });
    },
  },
];

/**
 * 执行注释功能测试
 */
export async function runAnnotationTests(): Promise<any> {
  ztoolkit.log("=== 开始注释功能测试 ===");

  const testResults: any[] = [];
  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of annotationTestCases) {
    ztoolkit.log(`📋 测试: ${testCase.name}`);
    ztoolkit.log(`📝 描述: ${testCase.description}`);

    try {
      const startTime = Date.now();
      const result = await testCase.testFunction();
      const duration = Date.now() - startTime;

      ztoolkit.log(`✅ 成功 (${duration}ms)`);

      if (result.results) {
        // 这是搜索结果
        ztoolkit.log(`📊 结果数量: ${result.results.length}`);
        ztoolkit.log(`📈 总数: ${result.totalCount}`);
        ztoolkit.log(`⏱️  搜索时间: ${result.searchTime}`);

        if (result.results.length > 0) {
          ztoolkit.log("🔍 示例结果:");
          result.results.slice(0, 2).forEach((item: any, index: number) => {
            ztoolkit.log(
              `  ${index + 1}. [${item.type}] ${item.content?.substring(0, 50) || item.text?.substring(0, 50)}...`,
            );
            if (item.page) {
              ztoolkit.log(`     页码: ${item.page}`);
            }
            if (item.color) {
              ztoolkit.log(`     颜色: ${item.color}`);
            }
            if (item.tags.length > 0) {
              ztoolkit.log(`     标签: ${item.tags.join(", ")}`);
            }
          });
        }
      } else if (Array.isArray(result)) {
        // 这是直接的数组结果
        ztoolkit.log(`📊 结果数量: ${result.length}`);

        if (result.length > 0) {
          ztoolkit.log("🔍 示例结果:");
          result.slice(0, 2).forEach((item: any, index: number) => {
            ztoolkit.log(
              `  ${index + 1}. [${item.type}] ${item.content?.substring(0, 50) || item.text?.substring(0, 50)}...`,
            );
          });
        }
      }

      testResults.push({
        name: testCase.name,
        status: "PASSED",
        duration,
        resultCount: result.results?.length || result.length || 0,
        totalCount: result.totalCount || result.length || 0,
      });

      passedTests++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      ztoolkit.log(`❌ 失败: ${errorMsg}`, "error");

      testResults.push({
        name: testCase.name,
        status: "FAILED",
        error: errorMsg,
      });

      failedTests++;
    }

    ztoolkit.log(""); // 空行分隔
  }

  ztoolkit.log("=== 测试摘要 ===");
  ztoolkit.log(`总测试数: ${annotationTestCases.length}`);
  ztoolkit.log(`通过: ${passedTests}`);
  ztoolkit.log(`失败: ${failedTests}`);
  ztoolkit.log(
    `成功率: ${((passedTests / annotationTestCases.length) * 100).toFixed(1)}%`,
  );

  return {
    summary: {
      total: annotationTestCases.length,
      passed: passedTests,
      failed: failedTests,
      successRate:
        ((passedTests / annotationTestCases.length) * 100).toFixed(1) + "%",
    },
    tests: testResults,
    timestamp: new Date().toISOString(),
  };
}

/**
 * HTTP接口包装器
 */
export async function handleAnnotationTest(): Promise<any> {
  ztoolkit.log("开始执行注释功能测试...");

  let testResult;
  try {
    testResult = await runAnnotationTests();
    ztoolkit.log(
      `测试完成：${testResult.summary.passed}/${testResult.summary.total} 通过`,
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ztoolkit.log(`测试执行失败: ${errorMsg}`, "error");

    return {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        {
          error: errorMsg,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    };
  }

  return {
    status: 200,
    statusText: "OK",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(
      {
        message: "Annotation features test completed",
        message_zh: "注释功能测试完成",
        testResults: testResult,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  };
}
