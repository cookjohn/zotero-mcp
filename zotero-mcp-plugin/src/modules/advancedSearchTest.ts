/**
 * 高级搜索功能测试
 */

import { handleSearchRequest } from "./searchEngine";

declare let ztoolkit: ZToolkit;

interface TestCase {
  name: string;
  params: any;
  description: string;
}

/**
 * 高级搜索测试用例
 */
const advancedSearchTestCases: TestCase[] = [
  {
    name: "基础全文搜索",
    params: { q: "价值共创", limit: "5" },
    description: "测试基础全文搜索功能",
  },
  {
    name: "标题精确匹配",
    params: {
      title: "数字化转型",
      titleOperator: "exact",
      limit: "5",
    },
    description: "测试标题精确匹配功能",
  },
  {
    name: "标题模糊匹配",
    params: {
      title: "数字化",
      titleOperator: "contains",
      limit: "5",
    },
    description: "测试标题包含匹配功能",
  },
  {
    name: "作者搜索",
    params: {
      creator: "张",
      creatorOperator: "contains",
      limit: "5",
    },
    description: "测试作者搜索功能",
  },
  {
    name: "年份范围搜索",
    params: {
      yearRange: "2020-2023",
      limit: "10",
    },
    description: "测试年份范围搜索（2020-2023年）",
  },
  {
    name: "最近添加的文献",
    params: {
      dateAddedRange: "2024-01-01,2024-12-31",
      limit: "10",
    },
    description: "测试按添加日期范围搜索（2024年）",
  },
  {
    name: "相关性评分搜索",
    params: {
      q: "人工智能",
      relevanceScoring: "true",
      sort: "relevance",
      direction: "desc",
      limit: "5",
    },
    description: "测试相关性评分搜索，按相关性排序",
  },
  {
    name: "字段权重提升",
    params: {
      q: "创新",
      relevanceScoring: "true",
      boostFields: "title,abstractNote",
      sort: "relevance",
      limit: "5",
    },
    description: "测试字段权重提升（标题和摘要）",
  },
  {
    name: "摘要正则表达式搜索",
    params: {
      abstractText: "数字.*转型",
      abstractOperator: "regex",
      limit: "5",
    },
    description: "测试摘要正则表达式搜索",
  },
  {
    name: "复合条件搜索",
    params: {
      title: "创新",
      titleOperator: "contains",
      yearRange: "2021-2023",
      creator: "李",
      creatorOperator: "contains",
      relevanceScoring: "true",
      limit: "5",
    },
    description: "测试复合条件搜索（标题+年份+作者+相关性评分）",
  },
  {
    name: "页数范围搜索",
    params: {
      numPagesRange: "10-50",
      limit: "5",
    },
    description: "测试页数范围搜索（10-50页）",
  },
  {
    name: "语言过滤",
    params: {
      language: "Chinese",
      limit: "5",
    },
    description: "测试按语言过滤",
  },
];

/**
 * 执行高级搜索测试
 */
export async function runAdvancedSearchTests(): Promise<any> {
  ztoolkit.log("=== 开始高级搜索功能测试 ===\n");

  const testResults: any[] = [];
  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of advancedSearchTestCases) {
    ztoolkit.log(`📋 测试: ${testCase.name}`);
    ztoolkit.log(`📝 描述: ${testCase.description}`);
    ztoolkit.log(`⚙️  参数: ${JSON.stringify(testCase.params)}`);

    try {
      const startTime = Date.now();
      const result = await handleSearchRequest(testCase.params);
      const duration = Date.now() - startTime;

      ztoolkit.log(`✅ 成功 (${duration}ms)`);
      ztoolkit.log(`📊 结果数量: ${result.results?.length || 0}`);
      ztoolkit.log(`📈 总数: ${result.pagination?.total || 0}`);

      if (result.version === "2.0") {
        ztoolkit.log("🎉 使用增强版搜索引擎");
      }

      if (result.searchFeatures) {
        ztoolkit.log(`🔧 搜索功能: ${result.searchFeatures.join(", ")}`);
      }

      if (result.relevanceStats) {
        ztoolkit.log(
          `📊 相关性统计: 平均分=${result.relevanceStats.averageScore.toFixed(2)}, 最高分=${result.relevanceStats.maxScore.toFixed(2)}`,
        );
      }

      if (result.results?.length > 0) {
        ztoolkit.log("🔍 示例结果:");
        result.results.slice(0, 2).forEach((item: any, index: number) => {
          ztoolkit.log(`  ${index + 1}. ${item.title || "(无标题)"}`);
          if (item.relevanceScore !== undefined) {
            ztoolkit.log(`     相关性评分: ${item.relevanceScore.toFixed(2)}`);
          }
          if (item.matchedFields?.length > 0) {
            ztoolkit.log(`     匹配字段: ${item.matchedFields.join(", ")}`);
          }
        });
      }

      testResults.push({
        name: testCase.name,
        status: "PASSED",
        duration,
        resultCount: result.results?.length || 0,
        totalCount: result.pagination?.total || 0,
        features: result.searchFeatures || [],
        relevanceStats: result.relevanceStats || null,
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
  ztoolkit.log(`总测试数: ${advancedSearchTestCases.length}`);
  ztoolkit.log(`通过: ${passedTests}`);
  ztoolkit.log(`失败: ${failedTests}`);
  ztoolkit.log(
    `成功率: ${((passedTests / advancedSearchTestCases.length) * 100).toFixed(1)}%`,
  );

  return {
    summary: {
      total: advancedSearchTestCases.length,
      passed: passedTests,
      failed: failedTests,
      successRate:
        ((passedTests / advancedSearchTestCases.length) * 100).toFixed(1) + "%",
    },
    tests: testResults,
    timestamp: new Date().toISOString(),
  };
}

/**
 * HTTP接口包装器
 */
export async function handleAdvancedSearchTest(): Promise<any> {
  // 捕获ztoolkit日志输出
  const logs: string[] = [];
  const originalLog = ztoolkit.log;

  ztoolkit.log = (message: string, level?: string) => {
    const logEntry = level ? `[${level.toUpperCase()}] ${message}` : message;
    logs.push(logEntry);
    originalLog.call(ztoolkit, message, level);
  };

  let testResult;
  try {
    testResult = await runAdvancedSearchTests();
  } finally {
    // 恢复原始日志方法
    ztoolkit.log = originalLog;
  }

  return {
    status: 200,
    statusText: "OK",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      {
        testResults: testResult,
        logs: logs,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  };
}
