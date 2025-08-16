# 发布新版本

本文档说明了如何为 Zotero MCP 插件发布新版本。

## 版本号规范

项目遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/) 规范。版本格式为 `MAJOR.MINOR.PATCH`。

- **MAJOR** 版本：当你做了不兼容的 API 修改。
- **MINOR** 版本：当你做了向下兼容的功能性新增。
- **PATCH** 版本：当你做了向下兼容的问题修正。

对于测试版本，使用 `-beta` 后缀，例如 `v1.0.0-beta.1`。

## 发布流程

发布流程通过 npm 脚本和 GitHub Actions 自动完成。

### 发布正式版本

1.  确保在 `main` 分支上，并且所有更改都已提交。
2.  运行以下命令：

    ```bash
    npm run release
    ```

    该命令会自动：
    -   提升 `package.json` 中的 `patch` 版本号。
    -   创建一个新的 Git tag，格式为 `vMAJOR.MINOR.PATCH`。
    -   将提交和 tag 推送到 GitHub。

3.  推送到 GitHub 后，`release.yml` 工作流将自动触发，完成以下任务：
    -   构建插件 (`.xpi` 文件)。
    -   生成 `update.json`。
    -   创建一个新的 GitHub Release。
    -   将 `.xpi` 文件和 `update.json` 上传到 Release。

### 发布 Beta 版本

1.  确保在 `main` 或开发分支上，并且所有更改都已提交。
2.  运行以下命令：

    ```bash
    npm run release:beta
    ```

    该命令会自动：
    -   创建一个预发布版本号（例如 `1.0.1-beta.0`）。
    -   创建一个新的 Git tag。
    -   将提交和 tag 推送到 GitHub。

3.  推送到 GitHub 后，`beta-release.yml` 工作流将自动触发，完成以下任务：
    -   构建插件。
    -   生成 `update-beta.json`。
    -   创建一个新的 GitHub Pre-release。
    -   将 `.xpi` 文件和 `update-beta.json` 上传到 Pre-release。

## 自动更新机制

插件的自动更新依赖于 `update.json` (正式版) 和 `update-beta.json` (测试版) 文件。这些文件包含了最新版本的下载链接和更新信息。

-   `release.yml` 工作流会更新 `update.json` 并将其上传到 GitHub Release。
-   `beta-release.yml` 工作流会更新 `update-beta.json` 并将其上传到 GitHub Pre-release。

Zotero 客户端会定期检查这些文件以获取更新。

## 故障排除

-   **工作流执行失败**：
    -   检查 GitHub Actions 日志，查看详细的错误信息。
    -   确保 `secrets.GITHUB_TOKEN` 具有 `contents: write` 权限。
    -   检查 npm 脚本是否能本地成功运行。

-   **版本号冲突**：
    -   如果 `npm version` 失败，可能是因为 tag 已存在。请手动删除远程和本地的 tag，然后重试。

-   **发布产物错误**：
    -   检查 `scripts/prepare-release.js` 脚本的逻辑是否正确。
    -   确保 `build` 脚本生成了正确的 `.xpi` 文件。