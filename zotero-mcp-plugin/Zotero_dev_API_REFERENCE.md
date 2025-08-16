# Zotero API 参考文档

本文档提供了 Zotero 的核心 API 参考，旨在帮助开发者快速理解和使用插件功能。

---

# 一、核心功能示例

本模块展示了插件的核心功能用法，源码位于 `src/modules/examples.ts`。

## 基础功能 (BasicExampleFactory)

### 注册 Zotero 事件监听器

- **功能描述**: 注册一个全局监听器，用于响应 Zotero 中的各种事件，例如条目的增删改、标签的变化等。这是插件与 Zotero 数据交互的基础。
- **核心方法**: `Zotero.Notifier.registerObserver()`
- **函数签名**:
  ```typescript
  registerObserver(callback: object, types: string[], id?: string, priority?: number): string
  ```
- **参数说明**:
  - `callback`: 一个包含 `notify` 方法的对象，用于处理事件。
  - `types`: 一个字符串数组，指定要监听的事件类型 (如 `item`, `file`, `tab`)。
  - `id`: (可选) 监听器的唯一标识符。
  - `priority`: (可选) 监听器的优先级。

### 注册插件设置面板

- **功能描述**: 在 Zotero 的首选项窗口中添加一个新的设置面板，允许用户配置插件参数。
- **核心方法**: `Zotero.PreferencePanes.register()`
- **函数签名**:
  ```typescript
  register(options: object): void
  ```
- **参数说明**:
  - `options`: 一个包含设置面板信息的对象，主要包括：
    - `pluginID`: 插件的 ID。
    - `src`: 设置面板界面的 XUL 或 XHTML 文件路径。
    - `label`: 在 Zotero 设置窗口中显示的名称。
    - `image`: (可选) 设置面板的图标。

## 快捷键 (KeyExampleFactory)

### 注册全局快捷键

- **功能描述**: 注册一个监听键盘事件的处理器，从而实现自定义快捷键功能。开发者可以在回调函数中定义特定按键组合要执行的操作。
- **核心方法**: `ztoolkit.Keyboard.register()`
- **函数签名**:
  ```typescript
  register(callback: (event: KeyboardEvent, keyOptions: object) => void): void
  ```
- **参数说明**:
  - `callback`: 按键事件触发时的回调函数。
    - `event`: 标准的 `KeyboardEvent` 对象。
    - `keyOptions`: `ztoolkit` 封装的对象，包含解析后的按键信息，如 `keyOptions.keyboard.equals("shift,l")` 可用于判断组合键。

## 界面定制 (UIExampleFactory)

### 注册自定义样式表

- **功能描述**: 向 Zotero 主窗口动态添加自定义 CSS 样式表，用于修改 Zotero 界面的外观。
- **核心方法**: `ztoolkit.UI.createElement()`
- **函数签名**:
  ```typescript
  createElement(doc: Document, tag: string, options?: object): Element
  ```
- **参数说明**:
  - `doc`: 目标窗口的 `document` 对象。
  - `tag`: 要创建的 HTML 元素的标签名 (此处为 `link`)。
  - `options`: (可选) 元素的属性、样式、监听器等。

### 注册右键菜单项

- **功能描述**: 在 Zotero 的各种菜单（如条目右键菜单、工具菜单、主菜单）中添加新的菜单项或子菜单。
- **核心方法**: `ztoolkit.Menu.register()`
- **函数签名**:
  ```typescript
  register(parentSelector: string, options: object, before?: Element, doc?: Document): void
  ```
- **参数说明**:
  - `parentSelector`: 目标菜单的选择器 (如 `'item'` 表示条目右键菜单, `'menuFile'` 表示“文件”菜单)。
  - `options`: 定义菜单项的对象，包含 `tag`, `id`, `label`, `commandListener` (点击事件), `icon` 等属性。
  - `before`: (可选) 将新菜单项插入到该元素之前。

### 添加主窗格列

- **功能描述**: 在 Zotero 主界面的条目列表视图中添加一个新的列，并自定义其显示内容和渲染方式。
- **核心方法**: `Zotero.ItemTreeManager.registerColumns()`
- **函数签名**:
  ```typescript
  registerColumns(options: object): Promise<void>
  ```
- **参数说明**:
  - `options`: 一个包含列定义的对象，关键属性包括：
    - `pluginID`: 插件 ID。
    - `dataKey`: 列的数据标识符。
    - `label`: 列标题。
    - `dataProvider`: 一个函数，根据 `Zotero.Item` 返回该单元格应显示的数据。
    - `renderCell`: (可选) 自定义单元格渲染逻辑的函数。

### 在条目详情页添加信息行

- **功能描述**: 在右侧的条目详情面板中添加一个可编辑或只读的信息行，用于显示或编辑与条目相关的自定义数据。
- **核心方法**: `Zotero.ItemPaneManager.registerInfoRow()`
- **函数签名**:
  ```typescript
  registerInfoRow(options: object): void
  ```
- **参数说明**:
  - `options`: 定义信息行的对象，包含 `rowID`, `pluginID`, `label`, `editable`, `onGetData`, `onSetData` 等。

### 在条目详情页添加自定义区域

- **功能描述**: 在右侧的条目详情面板中添加一个完整的自定义区域（Section），可以包含复杂的 HTML 内容和交互逻辑，适用于需要较大独立空间的复杂功能。
- **核心方法**: `Zotero.ItemPaneManager.registerSection()`
- **函数签名**:
  ```typescript
  registerSection(options: object): void
  ```
- **参数说明**:
  - `options`: 定义区域的对象，包含 `paneID`, `pluginID`, `header` (标题), `sidenav` (侧边栏图标), `onRender` (渲染逻辑), `onAsyncRender` (异步渲染), `sectionButtons` (区域按钮) 等。

## 快速命令面板 (PromptExampleFactory)

### 注册快速命令

- **功能描述**: 为 `ztoolkit` 提供的快速命令面板（默认 `Shift+P` 唤起）添加新的命令，支持条件显示和异步操作，可用于实现快速搜索、快速操作等功能。
- **核心方法**: `ztoolkit.Prompt.register()`
- **函数签名**:
  ```typescript
  register(commands: object[]): void
  ```
- **参数说明**:
  - `commands`: 一个命令对象的数组，每个对象定义一个命令，包含：
    - `name` 或 `id`: 命令的名称或标识符。
    - `label`: (可选) 命令的分组标签。
    - `callback`: 选中该命令后执行的回调函数。
    - `when`: (可选) 一个返回布尔值的函数，用于决定该命令是否显示。

## 辅助工具 (HelperExampleFactory)

### 创建自定义对话框

- **功能描述**: 提供一个基于网格布局的对话框构建器。通过链式调用 `addCell()`, `addButton()` 等方法，可以方便地创建包含复杂布局和数据绑定的自定义对话框。
- **核心方法**: `new ztoolkit.Dialog()`
- **函数签名**:
  ```typescript
  new Dialog(rows: number, cols: number)
  ```

### 复制内容到剪贴板

- **功能描述**: 提供一个剪贴板操作的辅助类。通过 `addText()` 可以添加不同格式（如纯文本、HTML）的内容，然后通过 `copy()` 方法一次性复制到系统剪贴板。
- **核心方法**: `new ztoolkit.Clipboard()`
- **函数签名**:
  ```typescript
  new Clipboard()
  ```

### 打开文件选择器

- **功能描述**: 封装了 Zotero 的文件选择器，简化了打开（`open`）或保存（`save`）文件的操作，支持文件类型过滤和默认文件名设置。
- **核心方法**: `new ztoolkit.FilePicker()`
- **函数签名**:
  ```typescript
  new FilePicker(title: string, mode: string, filters?: string[][], defaultName?: string)
  ```

### 显示进度窗口

- **功能描述**: 创建一个进度条窗口，用于向用户反馈长时间任务的执行状态。可以通过 `createLine()` 添加进度项。
- **核心方法**: `new ztoolkit.ProgressWindow()`
- **函数签名**:
  ```typescript
  new ProgressWindow(title: string)
  ```

---

# 二、工具函数

本模块包含位于 `src/utils/` 目录下的各类辅助函数。

## 国际化 (i18n) - `locale.ts`

### 获取本地化字符串

- **功能描述**: 基于 Mozilla 的 [Fluent](https://projectfluent.org/) 语法，从插件的 `.ftl` 文件中获取国际化字符串。支持变量替换和复数形式。
- **核心方法**: `getString()`
- **函数签名**:
  ```typescript
  getString(localString: FluentMessageId): string
  getString(localString: FluentMessageId, branch: string): string
  getString(localeString: FluentMessageId, options: { branch?: string; args?: object }): string
  ```
- **参数说明**:
  - `localString`: 在 `.ftl` 文件中定义的字符串 ID。
  - `branch`: (可选) 获取字符串的特定分支。
  - `args`: (可选) 传递给字符串的动态参数。

## 配置项读写 - `prefs.ts`

### 获取、设置、清除插件配置项

- **功能描述**: 封装了 Zotero 的 `Zotero.Prefs` 方法，并自动添加了插件的前缀，简化了对插件专属配置项的读、写和清除操作。
- **核心方法**: `getPref()`, `setPref()`, `clearPref()`
- **函数签名**:
  ```typescript
  getPref<K>(key: K): any
  setPref<K>(key: K, value: any): boolean
  clearPref(key: string): boolean
  ```

## 窗口管理 - `window.ts`

### 检查窗口是否存活

- **功能描述**: 一个辅助函数，用于判断一个窗口对象是否仍然存在且处于活动状态，常用于避免重复打开相同的对话框或窗口。
- **核心方法**: `isWindowAlive()`
- **函数签名**:
  ```typescript
  isWindowAlive(win?: Window): boolean
  ```
- **参数说明**:
  - `win`: (可选) 要检查的窗口对象。

## Zotero-Plugin-Toolkit 初始化 - `ztoolkit.ts`

### 创建和初始化 `ztoolkit` 实例

- **功能描述**: 该文件负责创建并初始化 `zotero-plugin-toolkit` 的实例。在 `initZToolkit` 函数中，会根据开发或生产环境配置日志、API ID 等基础选项。开发者通常不需要直接修改此文件，但可以了解 `ztoolkit` 的基本配置过程。
- **核心方法**: `createZToolkit()`
- **函数签名**:
  ```typescript
  createZToolkit(): ZoteroToolkit