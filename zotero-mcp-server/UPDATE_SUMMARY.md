# Zotero MCP Server 更新摘要 (v0.4.0)

本次更新主要增强了现有工具的功能，并引入了全新的工具集，以提供更强大的文献管理能力。

## 主要变更

### 1. `search` 工具功能增强

`search` 工具现已支持更高级的标签搜索功能，允许用户进行更精确的文献筛选。

- **新增参数**:
  - `tags` (string): 按标签筛选，多个标签用逗号分隔。
  - `tagMode` (enum: 'any', 'all', 'none'): 标签匹配模式。
    - `any`: 包含任意一个指定标签 (OR)。
    - `all`: 包含所有指定标签 (AND)。
    - `none`: 排除包含指定标签的条目。
  - `tagMatch` (enum: 'exact', 'contains', 'startsWith'): 标签匹配方式。
    - `exact`: 精确匹配。
    - `contains`: 包含关键词。
    - `startsWith`: 以关键词开头。

### 2. 新增 Collections 工具集

引入了四个用于管理 Zotero 文献集的全新工具，方便用户以编程方式与文献集进行交互。

- **`get_collections`**: 获取所有文献集的层级列表。
- **`search_collections`**: 根据名称搜索文献集。
- **`get_collection_details`**: 获取单个文献集的详细信息。
- **`get_collection_items`**: 获取指定文献集中的所有条目。

### 3. 新增 PDF 内容提取工具

- **`get_pdf_content`**: 从 Zotero 条目的 PDF 附件中提取文本内容。
  - **参数**:
    - `itemKey` (string, required): 文献条目的唯一标识符。
    - `page` (number, optional): 指定提取文本的 PDF 页码（从1开始）。
    - `format` (enum: 'text', 'json', optional, default: 'text'): 返回内容的格式。

### 4. 版本更新

- **MCP Server 版本**: `0.3.0` -> `0.4.0`