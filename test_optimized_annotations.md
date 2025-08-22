# 优化后的注释检索功能测试

## 测试概述

测试优化后的注释检索功能，包括：
1. 概览模式（默认）- 内容截断和关键词提取
2. 详细模式 - 完整内容
3. 精准检索 - 按ID获取和批量获取

## API测试用例

### 1. 概览搜索（默认模式）
```bash
curl "http://localhost:23120/annotations/search?q=important&limit=3"
```
**期望结果**：
```json
{
  "pagination": {
    "limit": 3,
    "offset": 0,
    "total": 15,
    "hasMore": true
  },
  "searchTime": "45ms",
  "totalCount": 15,
  "contentMode": "preview",
  "version": "2.0",
  "endpoint": "annotations/search",
  "results": [
    {
      "id": "ABC123",
      "content": "这是重要的内容截断版本...",
      "contentMeta": {
        "isPreview": true,
        "originalLength": 1250,
        "keywords": ["重要", "内容", "研究"]
      }
    }
  ]
}
```
- 🎯 **元数据在前**：AI首先看到总览信息
- 📏 **内容被智能截断**（~200字符）
- 🔍 **包含关键词**和原始长度信息
- 📊 **默认limit=20**（较小的数据量）

### 2. 详细搜索模式
```bash
curl "http://localhost:23120/annotations/search?q=important&limit=3&detailed=true"
```
**期望结果**：
```json
{
  "pagination": {
    "limit": 3,
    "offset": 0,
    "total": 15,
    "hasMore": true
  },
  "searchTime": "52ms",
  "totalCount": 15,
  "contentMode": "full",
  "version": "2.0",
  "endpoint": "annotations/search",
  "results": [
    {
      "id": "ABC123",
      "content": "这是完整的注释内容，包含所有原始文本...",
      "text": "原始高亮文本的完整内容...",
      "comment": "用户评论的完整内容..."
    }
  ]
}
```
- 📄 **完整内容**：返回所有原始文本
- 📊 **默认limit=50**（详细模式）
- ⚡ **按需获取**：只在需要时使用

### 3. 按ID获取完整注释
```bash
curl "http://localhost:23120/annotations/{ANNOTATION_ID}"
```
**期望结果**：
- 返回指定注释的完整内容

### 4. 批量获取注释
```bash
curl -X POST "http://localhost:23120/annotations/batch" \
  -H "Content-Type: application/json" \
  -d '{"ids": ["ID1", "ID2", "ID3"]}'
```
**期望结果**：
- 返回请求ID的完整注释列表
- 包含统计信息

### 5. 测试高级搜索参数
```bash
curl "http://localhost:23120/search?q=machine+learning&titleOperator=contains&relevanceScoring=true&sort=relevance"
```

## 验证要点

1. **性能优化**：
   - 默认模式返回的数据量明显减少
   - 响应时间保持快速

2. **内容质量**：
   - 智能截断保留完整句子
   - 关键词准确提取
   - 元数据信息完整

3. **功能完整性**：
   - AI可以通过概览了解全貌
   - 可以选择性获取详细内容
   - 批量操作高效

4. **兼容性**：
   - 现有API保持向后兼容
   - MCP服务器正确处理新参数

## 预期改进

### 🎯 AI体验优化
1. **元数据优先**：AI首先看到总数、分页、搜索时间等关键信息
2. **渐进式加载**：从概览→详细→完整内容的层次化获取
3. **智能分页**：
   - 概览模式：默认20条记录，最大100条
   - 详细模式：默认50条记录，最大200条
   - 有`hasMore`标识指导后续请求

### 💡 性能优化
1. **Token使用**：概览模式减少80%的token消耗
2. **响应速度**：默认返回更少数据，响应更快
3. **内容质量**：智能截断保持句子完整性

### 🔧 实用功能
1. **关键词提取**：快速了解内容要点
2. **原始长度**：判断是否需要获取完整内容
3. **统一格式**：所有API都采用元数据优先的格式

## 测试结果记录

- [ ] 基础搜索功能正常
- [ ] 内容截断和关键词提取工作正常  
- [ ] 详细模式返回完整内容
- [ ] 按ID检索功能正常
- [ ] 批量检索功能正常
- [ ] 高级搜索参数生效
- [ ] MCP服务器兼容新功能