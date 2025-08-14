/**
 * 测试 Zotero 搜索功能
 */

export async function testZoteroSearch() {
  console.log("=== 开始搜索测试 ===");
  
  try {
    // 测试1：直接获取所有条目
    console.log("\n测试1：获取所有条目");
    const allItems = await Zotero.Items.getAll(Zotero.Libraries.userLibraryID);
    console.log(`总条目数：${allItems.length}`);
    
    // 查找包含"价值共创"的条目
    const matchingItems = allItems.filter((item: Zotero.Item) => {
      const title = item.getField('title');
      return title && title.includes('价值共创');
    });
    console.log(`包含"价值共创"的条目数：${matchingItems.length}`);
    if (matchingItems.length > 0) {
      console.log("找到的条目标题：");
      matchingItems.slice(0, 3).forEach((item: Zotero.Item) => {
        console.log(`  - ${item.getField('title')}`);
      });
    }
    
    // 测试2：使用 Zotero.Search API
    console.log("\n测试2：使用 Zotero.Search API");
    const s = new Zotero.Search();
    (s as any).libraryID = Zotero.Libraries.userLibraryID;
    
    // 添加标题搜索条件
    s.addCondition('title', 'contains', '价值共创');
    console.log("添加条件：title contains '价值共创'");
    
    // 打印搜索对象信息
    console.log(`Search libraryID: ${(s as any).libraryID}`);
    console.log(`Search conditions: ${JSON.stringify((s as any).conditions || [])}`);
    
    // 执行搜索
    const searchResults = await s.search();
    console.log(`搜索结果数量：${searchResults.length}`);
    
    if (searchResults.length > 0) {
      const items = await Zotero.Items.getAsync(searchResults.slice(0, 3));
      console.log("搜索到的条目标题：");
      items.forEach(item => {
        console.log(`  - ${item.getField('title')}`);
      });
    }
    
    // 测试3：使用快速搜索
    console.log("\n测试3：使用快速搜索");
    const s2 = new Zotero.Search();
    (s2 as any).libraryID = Zotero.Libraries.userLibraryID;
    
    s2.addCondition('quicksearch-everything', 'contains', '价值共创');
    console.log("添加条件：quicksearch-everything contains '价值共创'");
    
    const quickSearchResults = await s2.search();
    console.log(`快速搜索结果数量：${quickSearchResults.length}`);
    
    if (quickSearchResults.length > 0) {
      const items = await Zotero.Items.getAsync(quickSearchResults.slice(0, 3));
      console.log("快速搜索到的条目标题：");
      items.forEach(item => {
        console.log(`  - ${item.getField('title')}`);
      });
    }
    
    // 测试4：测试不同的搜索操作符
    console.log("\n测试4：测试不同的搜索操作符");
    const operators = ['contains', 'is', 'beginsWith'] as const;
    
    for (const op of operators) {
      const s3 = new Zotero.Search();
      (s3 as any).libraryID = Zotero.Libraries.userLibraryID;
      
      s3.addCondition('title', op as any, '价值共创');
      const results = await s3.search();
      console.log(`操作符 '${op}': 找到 ${results.length} 个结果`);
    }
    
    // 测试5：检查库ID
    console.log("\n测试5：检查库信息");
    console.log(`用户库ID: ${Zotero.Libraries.userLibraryID}`);
    const userLibrary = Zotero.Libraries.get(Zotero.Libraries.userLibraryID);
    if (userLibrary) {
      console.log(`用户库名称: ${userLibrary.name}`);
      console.log(`用户库类型: ${userLibrary.libraryType}`);
    }
    
    // 列出所有库
    const allLibraries = Zotero.Libraries.getAll();
    console.log(`所有库数量: ${allLibraries.length}`);
    allLibraries.forEach(lib => {
      console.log(`  库 ${lib.libraryID}: ${lib.name} (${lib.libraryType})`);
    });
    
  } catch (error) {
    console.error("搜索测试出错：", error);
    console.error("错误堆栈：", (error as Error).stack);
  }
  
  console.log("\n=== 搜索测试结束 ===");
}

// 导出一个可以从 HTTP 接口调用的版本
export async function handleSearchTest(): Promise<any> {
  // 捕获 console.log 输出
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  
  console.log = (...args) => {
    logs.push(args.join(' '));
    originalLog(...args);
  };
  
  console.error = (...args) => {
    logs.push('ERROR: ' + args.join(' '));
    originalError(...args);
  };
  
  try {
    await testZoteroSearch();
  } finally {
    // 恢复原始 console
    console.log = originalLog;
    console.error = originalError;
  }
  
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      testResults: logs,
      timestamp: new Date().toISOString()
    }, null, 2)
  };
}