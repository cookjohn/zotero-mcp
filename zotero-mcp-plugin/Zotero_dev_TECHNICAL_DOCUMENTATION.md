# Zotero 插件开发技术文档

## 1. 简介

本文档旨在为使用 Zotero Zotero MCP Plugin的开发者提供一份全面的技术参考。该模板项目不仅仅是一个简单的文件框架，更是一套完整的 Zotero 插件开发解决方案。它通过 TypeScript 提供了类型安全，通过 `zotero-plugin-toolkit` 简化了 API 调用，通过 `zotero-plugin-scaffold` 实现了现代化的开发和构建流程。对于任何想要为 Zotero 7+ 开发插件的开发者来说，这都是一个理想的、值得深入学习和使用的起点。

## 2. 项目结构

项目结构清晰，职责分离明确，便于维护和扩展。

- **`package.json`**: 项目的“心脏”。
  - 定义了项目名称、版本、依赖项和脚本命令（如 `start`, `build`, `release`）。
  - 包含一个 `config` 字段，用于存储插件的元数据（如 ID、名称），这些元数据会在构建时被自动注入到插件的各个部分。

- **`zotero-plugin.config.ts`**: 构建工具 `zotero-plugin-scaffold` 的配置文件。
  - 它精确地控制了整个构建过程，包括指定 TypeScript 源文件入口、最终输出目录、代码打包方式（esbuild）以及如何处理静态资源（如 `addon/` 目录下的文件）。

- **`addon/` 目录**: 存放 Zotero 插件的“骨架”文件，这些是 Zotero 加载插件所必需的基础结构。
  - `manifest.json`: 插件的清单文件，定义了插件的 ID、版本、名称、目标应用等基本信息。文件中的占位符（如 `__addonName__`）会在构建时被 `package.json` 中的元数据自动替换。
  - `bootstrap.js`: 插件的生命周期入口文件。它负责在 Zotero 启动、关闭或窗口加载时，加载/卸载插件的核心逻辑、注册 UI 组件，并调用 `src/` 目录中定义的生命周期钩子。
  - `content/`: 存放静态资源，如 XUL/XHTML 界面文件（`preferences.xhtml`）、CSS 样式（`zoteroPane.css`）和图标。
  - `locale/`: 存放国际化（i18n）文件，采用 Fluent (`.ftl`) 格式，支持多语言。

- **`src/` 目录**: 插件核心功能和业务逻辑的实现，全部使用 TypeScript 编写。
  - `index.ts`: TypeScript 代码的入口文件。它负责初始化插件的主类 `Addon`，并将其挂载到 Zotero 的全局命名空间下，以便 `bootstrap.js` 调用。
  - `addon.ts`: 定义了插件的主类 `Addon`。这个类是插件的数据中心和 API 容器，集中管理插件的状态和提供的功能。
  - `hooks.ts`: 实现了插件的生命周期钩子函数（如 `onStartup`, `onMainWindowLoad`, `onShutdown` 等）。这是功能逻辑的“调度中心”，负责在合适的时机调用和注册具体功能模块。
  - `modules/`: 存放具体的业务逻辑模块。模板中的 `examples.ts` 提供了大量示例，展示了如何利用 `zotero-plugin-toolkit` 实现各种常见功能。
  - `utils/`: 存放通用的工具函数，如国际化管理 (`locale.ts`)、偏好设置读写 (`prefs.ts`) 等。

## 插件生命周期与调用流程

本章节详细分析了从 Zotero 启动到插件 UI 成功渲染的完整调用链，帮助开发者理解代码的执行顺序和模块间的交互关系。

**1. 入口加载 (`addon/bootstrap.js`)**

- **文件**: `addon/bootstrap.js`
- **触发**: Zotero 启动时，会读取插件的 `manifest.json` 并执行此 `bootstrap.js` 脚本。
- **核心函数**: `startup()`
- **流程**:
  1.  Zotero 调用 `startup()` 函数。
  2.  该函数使用 `Services.scriptloader.loadSubScript` 加载编译后的主 TypeScript 文件，即 `addon.js`（源文件为 `src/index.ts`）。
  3.  加载时，它会注入一个全局上下文对象 `ctx`，这个对象在插件的 TS 环境中成为 `_globalThis`。

**2. TS 启动与实例创建 (`src/index.ts`)**

- **文件**: `src/index.ts`
- **触发**: `bootstrap.js` 加载 `addon.js` 后，此文件中的代码立即执行。
- **核心逻辑**:
  1.  代码检查 `Zotero` 全局对象上是否已存在插件实例，防止重复初始化。
  2.  如果不存在，它会执行 `new Addon()`，创建插件的核心主类 `Addon` 的一个实例。
  3.  最关键的一步：它将这个新创建的 `addon` 实例赋值给 `Zotero` 的一个全局属性（例如 `Zotero.__addonInstance__`）。这使得 `bootstrap.js` 和 Zotero 的其他部分可以通过这个全局属性访问到插件的实例和其方法。

**3. 主类构造与初始化 (`src/addon.ts`)**

- **文件**: `src/addon.ts`
- **触发**: 在 `src/index.ts` 中执行 `new Addon()` 时。
- **核心函数**: `constructor()`
- **流程**:
  1.  初始化一个 `data` 对象，用于存储插件的配置、状态和 `zotero-plugin-toolkit` 的实例 (`ztoolkit`)。
  2.  将从 `hooks.ts` 文件中导入的生命周期钩子对象赋值给 `this.hooks` 属性。这使得 `bootstrap.js` 中可以通过 `Zotero.__addonInstance__.hooks.onStartup()` 等方式调用这些钩子。

**4. 生命周期钩子与模块加载 (`src/hooks.ts`)**

- **文件**: `src/hooks.ts`
- **触发**: 由 `bootstrap.js` 中的事件监听器（如 `onMainWindowLoad`）触发，这些监听器会调用 `Zotero.__addonInstance__.hooks` 上相应的方法。
- **核心函数**: `onMainWindowLoad(window)`
- **流程**:
  1.  当 Zotero 的主窗口加载完成时，`bootstrap.js` 会捕获该事件并调用 `hooks.ts` 中的 `onMainWindowLoad` 函数。
  2.  此函数是 UI 注册的“调度中心”。它会直接调用从 `modules` 目录中导入的功能模块（如 `UIExampleFactory`）的静态方法。
  3.  通过调用 `UIExampleFactory.registerRightClickMenuItem()`、`UIExampleFactory.registerWindowMenuWithSeparator()` 等方法，将具体的 UI 注册任务分派给相应的功能模块。

**5. 功能注册与 UI 渲染 (`src/modules/XXXXXX.ts`)**

- **文件**: `src/modules/XXXXXXs.ts`
- **触发**: 在 `hooks.ts` 的 `onMainWindowLoad` 中被调用。
- **核心函数**: `UIExampleFactory.registerRightClickMenuItem()`
- **流程**:
  1.  该函数被调用后，它会使用 `zotero-plugin-toolkit` 提供的便捷 API，即 `ztoolkit.Menu.register()`。
  2.  `ztoolkit.Menu.register()` 接收一个配置对象，其中定义了菜单项的 ID、标签文本（`label`）、点击事件监听器（`commandListener`）和图标等。
  3.  `ztoolkit` 在底层处理了与 Zotero 的 XUL 界面交互的复杂逻辑，根据配置动态创建 `<menuitem>` 元素，并将其插入到 Zotero 主窗口 DOM 中正确的位置（例如条目右键菜单）。

至此，从 Zotero 加载插件的入口文件开始，通过层层调用和初始化，最终由具体的功能模块使用 `ztoolkit` API 将一个菜单项成功注册并显示在界面上，整个调用链分析完毕。

## 偏好设置页面创建流程

**1. 注册阶段 (`src/hooks.ts` -> `src/modules/examples.ts`)**:

- 插件启动时，`onStartup` 钩子调用 `BasicExampleFactory.registerPrefs()`。
- 此函数通过 `Zotero.PreferencePanes.register()` 告诉 Zotero 存在一个偏好设置面板，并指定其 UI 定义文件为 `addon/content/preferences.xhtml`。

**2. UI 加载与事件触发 (`addon/content/preferences.xhtml`)**:

- 当用户打开偏好设置面板时，Zotero 加载 `preferences.xhtml` 文件来渲染界面。
- 该文件的 `<groupbox>` 元素通过 `onload` 属性触发一个事件 `onPrefsEvent('load', ...)`，将控制权交回给插件的主逻辑。

**3. 逻辑分派 (`src/hooks.ts`)**:

- `onPrefsEvent` 钩子函数捕获到 `load` 事件。
- 它随即调用 `src/modules/preferenceScript.ts` 中的 `registerPrefsScripts()` 函数，这标志着偏好设置页面的后端逻辑开始执行。
- `addon/prefs.js` 文件仅用于定义默认偏好值，不参与运行时交互。

**4. 核心交互逻辑 (`src/modules/preferenceScript.ts`)**:

- `registerPrefsScripts` 函数在面板加载时执行，负责初始化 UI 和绑定事件。
- UI 元素（如复选框）通过 `document.querySelector()` 获取。
- 值的**读写和 UI 同步**由 Zotero 的内置机制自动处理，因为 UI 元素在 `xhtml` 文件中已通过 `preference` 属性与配置项绑定。`preferenceScript.ts` 中的代码主要负责处理这些基础绑定之外的、更复杂的交互逻辑（如此模板中的虚拟表格和事件反馈）。

该流程展示了一个从注册、UI 定义、事件派发到核心逻辑执行的完整闭环，有效地将 UI 声明与业务逻辑分离开来。

## 3. 核心功能与示例

该模板的核心优势在于集成了 **`zotero-plugin-toolkit`**，这是一个强大的工具包，它将复杂的 Zotero API 封装成简单易用的接口。模板通过 `src/modules/examples.ts` 中的 `Factory` 类，全面展示了其核心功能：

#### UI 扩展

- **自定义列**: 在 Zotero 主列表窗格中添加自定义列，并动态展示条目数据。
- **菜单项**: 在条目右键菜单、工具菜单和文件菜单中添加新的菜单项和可折叠的子菜单。
- **右侧详情窗格**: 在右侧条目详情窗格中添加自定义的信息行和独立的 UI 区域（Tab）。
- **PDF 阅读器**: 在 Zotero 内置的 PDF 阅读器侧边栏中添加自定义区域。

#### 事件与交互

- **全局快捷键**: 注册全局快捷键，快速触发插件的特定功能。
- **事件监听 (Notifier)**: 通过 Notifier 系统监听 Zotero 内部的各种事件，如条目选择变化、标签页切换、条目修改等，并作出响应。
- **自定义偏好设置**: 创建功能丰富的自定义偏好设置窗格，允许用户配置插件行为，并能实时响应用户的操作。

#### 辅助工具

- **UI 组件**: 提供丰富的即用型 UI 组件，包括各种对话框（提示、确认）、进度条窗口、剪贴板工具和文件选择器。
- **命令系统**: 允许开发者注册自定义命令，用户可以通过 Zotero 的“运行命令”框（默认快捷键 `Ctrl/Cmd + Shift + P`）快速搜索并执行插件功能。

## 4. 开发与构建

项目的开发、构建和打包流程由 **`zotero-plugin-scaffold`** 工具驱动，实现了高度自动化。

- **开发 (`npm start`)**:
  - 启动一个本地开发服务器。
  - 该服务器会自动将插件链接到 Zotero 的插件目录，无需手动复制文件。
  - 支持对 TypeScript (`src/`) 和静态资源 (`addon/`) 的热重载。当代码或资源文件发生变化时，插件会自动在 Zotero 中重新加载，极大地提升了开发效率。

- **构建 (`npm run build`)**:
  - 使用 `esbuild` 将 `src/` 目录下的 TypeScript 源码高效地打包成一个现代的、经过优化的 JavaScript 文件。
  - 将打包后的 JS 文件与 `addon/` 目录下的静态资源整合到一起，形成一个完整的、可直接运行的插件，并输出到指定的构建目录（默认为 `dist/`）。

- **发布 (`npm run release`)**:
  - 执行构建过程。
  - 将构建好的插件目录打包成一个 `.xpi` 文件，这是 Zotero 插件的标准分发格式。
  - 自动生成更新所需的 `update.json` 文件，方便用户通过 Zotero 的插件更新机制获取新版本。

## 5. 快速上手指南

以下步骤将引导新开发者快速开始插件开发：

1.  **克隆项目**:

    ```bash
    git clone https://github.com/zotero-types/zotero-plugin-template.git your-plugin-name
    cd your-plugin-name
    ```

2.  **安装依赖**:

    ```bash
    npm install
    ```

3.  **配置插件信息**:
    - 打开 `package.json`，修改 `name`, `version`, `author` 等字段。
    - 在 `config` 字段中，修改 `addonID` 和 `addonName`。ID 建议使用 `@{作者}.{插件名}` 的格式。

4.  **启动开发模式**:

    ```bash
    npm start
    ```

    - 首次运行时，工具会提示 Zotero 的数据目录路径，并自动创建链接。按照终端提示操作即可。

5.  **开始编码**:
    - 打开 `src/` 目录，特别是 `modules/examples.ts`，参考示例代码开始编写你自己的功能。
    - 每次保存文件后，插件将在 Zotero 中自动刷新。

6.  **构建插件**:
    - 当你完成开发，准备分发时，运行构建命令：

    ```bash
    npm run build
    ```

7.  **打包发布**:
    - 运行发布命令来创建 `.xpi` 安装包和 `update.json`：

    ```bash
    npm run release
    ```

    - 生成的 `.xpi` 文件位于 `release/` 目录下，可以直接分享给用户安装。
