/**
 * Semantic Search Dialog for Zotero MCP Plugin
 *
 * 参考 ZotSeek 的搜索对话框实现，在 Zotero 中创建一个独立的语义搜索窗口，
 * 复用 zotero-mcp 原有的向量缓存数据库（VectorStore + EmbeddingService）
 * 实现搜索，不添加或更改原始数据库。
 *
 * 窗口通过 openDialog 打开，UI 逻辑在 searchDialog.xhtml 中内联实现，
 * TypeScript 控制器负责注入搜索回调。
 */

import { VirtualizedTableHelper } from 'zotero-plugin-toolkit';
import { getSemanticSearchService, type SemanticSearchResult } from './semantic';

declare let Zotero: any;
declare let ztoolkit: ZToolkit;
declare let Services: any;

/** 对话框 chrome URL */
const DIALOG_URL = 'chrome://zotero-mcp-plugin/content/searchDialog.xhtml';
const DIALOG_NAME = 'zotero-mcp-semantic-search-dialog';

/** 工具栏按钮 ID */
const TOOLBAR_BUTTON_ID = 'zotero-mcp-semantic-search-button';
const TOOLBAR_SEPARATOR_ID = 'zotero-mcp-semantic-search-separator';

/** 右键菜单 ID */
const CONTEXT_MENU_FIND_SIMILAR_ID = 'zotero-mcp-find-similar';
const CONTEXT_MENU_SEPARATOR_ID = 'zotero-mcp-find-similar-separator';

/** 需要在卸载时清理的 DOM 元素 ID */
export const SEMANTIC_DIALOG_ELEMENT_IDS = [
  TOOLBAR_BUTTON_ID,
  TOOLBAR_SEPARATOR_ID,
  CONTEXT_MENU_FIND_SIMILAR_ID,
  CONTEXT_MENU_SEPARATOR_ID,
];

/**
 * 语义搜索对话框控制器
 *
 * 管理 XHTML 窗口的生命周期，向窗口注入三个回调：
 *  - searchCallback(query) → SemanticSearchResult[]
 *  - openItemCallback(itemKey) → 在 Zotero 中定位条目
 *  - findSimilarCallback(itemKey, title) → 查找相似文献
 */
export class SemanticSearchDialog {
  private window: any = null;

  /**
   * 打开搜索对话框（单例，重复调用 focus 已有窗口）
   * @param initialQuery 可选初始查询，自动填充并搜索
   */
  open(initialQuery?: string): void {
    try {
      if (this.isWindowOpen()) {
        this.window.focus();
        // 若有初始查询，注入并自动搜索
        if (initialQuery) {
          const queryInput = this.window.document?.getElementById('zotseek-query-1');
          if (queryInput) {
            queryInput.value = initialQuery;
            this.window.performSearch?.();
          }
        }
        return;
      }

      const mainWindow = Zotero.getMainWindow();

      // 构建窗口参数
      const windowArgs = {
        initialQuery: initialQuery || '',
        searchCallback: (query: string) => this.performSearch(query),
        openItemCallback: (itemKey: string) => this.locateItem(itemKey),
        findSimilarCallback: (itemKey: string, title: string) =>
          this.findSimilar(itemKey, title),
        VirtualizedTableHelper: VirtualizedTableHelper,
      };

      this.window = mainWindow.openDialog(
        DIALOG_URL,
        DIALOG_NAME,
        'chrome,centerscreen,resizable,dialog=no',
        windowArgs,
      );

      ztoolkit.log('[SemanticDialog] Search dialog opened');
    } catch (error) {
      ztoolkit.log(
        `[SemanticDialog] Failed to open dialog: ${error instanceof Error ? error.message : String(error)}`,
        'error',
      );
    }
  }

  /**
   * 关闭对话框
   */
  close(): void {
    if (this.window && !this.window.closed) {
      this.window.close();
    }
    this.window = null;
  }

  /**
   * 检查窗口是否打开
   */
  private isWindowOpen(): boolean {
    return (
      this.window &&
      !this.window.closed &&
      typeof Components !== 'undefined' &&
      !Components.utils.isDeadWrapper(this.window)
    );
  }

  /**
   * 执行语义搜索（注入到窗口的回调）
   */
  private async performSearch(query: string): Promise<SemanticSearchResult[]> {
    ztoolkit.log(`[SemanticDialog] Performing search: "${query}"`);

    const service = getSemanticSearchService();
    const results = await service.search(query, {
      topK: 50,
      minScore: 0.1,
    });

    ztoolkit.log(`[SemanticDialog] Found ${results.length} results`);
    return results;
  }

  /**
   * 查找与指定条目相似的文献
   */
  async findSimilar(itemKey: string, title?: string): Promise<void> {
    // 确保对话框打开
    this.open();

    ztoolkit.log(
      `[SemanticDialog] Finding similar to: ${title || itemKey}`,
    );

    // 等待窗口初始化
    await this.waitForWindowReady();

    // 更新进度提示
    this.window?.showProgress?.('Finding similar documents...');

    try {
      const service = getSemanticSearchService();
      const results = await service.findSimilar(itemKey, { topK: 15 });

      // 通过窗口暴露的 displayResults 更新结果
      this.window?.displayResults?.(results);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.window?.showError?.('Search failed: ' + msg);
      ztoolkit.log(`[SemanticDialog] FindSimilar error: ${msg}`, 'error');
    }
  }

  /**
   * 等待窗口 DOM 及内联脚本就绪
   */
  private waitForWindowReady(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.window) return resolve();
      // 检查内联脚本是否已执行（performSearch 在脚本末尾暴露到 window）
      if ((this.window as any).performSearch) {
        return resolve();
      }
      // 轮询等待
      const check = () => {
        if ((this.window as any)?.performSearch) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      setTimeout(check, 100);
    });
  }

  /**
   * 在 Zotero 条目列表中定位条目（注入到窗口的回调）
   */
  private locateItem(itemKey: string): void {
    try {
      const win = Zotero.getActiveZoteroPane();
      if (!win) return;

      const item = Zotero.Items.getByLibraryAndKey(
        Zotero.Libraries.userLibraryID,
        itemKey,
      );
      if (item) {
        win.selectItem(item.id);
      }
    } catch (e) {
      ztoolkit.log(`[SemanticDialog] Failed to locate item ${itemKey}: ${e}`, 'warn');
    }
  }
}

// ============ 单例 ============

let dialogInstance: SemanticSearchDialog | null = null;

export function getSemanticSearchDialog(): SemanticSearchDialog {
  if (!dialogInstance) {
    dialogInstance = new SemanticSearchDialog();
  }
  return dialogInstance;
}

// ============ UI 注册函数 ============

/**
 * 在 Zotero 主工具栏注册语义搜索按钮。
 * 参考 ZotSeek 实现：使用 #zotero-items-toolbar 容器，
 * 插入到搜索框之前。
 */
export function registerSemanticSearchToolbar(win: _ZoteroTypes.MainWindow): void {
  const doc = win.document;

  // 先清理已有
  doc.getElementById(TOOLBAR_BUTTON_ID)?.remove();
  doc.getElementById(TOOLBAR_SEPARATOR_ID)?.remove();

  // 查找条目工具栏（Zotero 的正确 ID）
  const toolbar = doc.getElementById('zotero-items-toolbar');
  if (!toolbar) {
    ztoolkit.log('[SemanticDialog] zotero-items-toolbar not found, skipping button registration');
    return;
  }

  // 创建分隔线
  const separator = doc.createXULElement('toolbarseparator');
  separator.id = TOOLBAR_SEPARATOR_ID;

  // 创建按钮
  const button = doc.createXULElement('toolbarbutton');
  button.id = TOOLBAR_BUTTON_ID;
  button.setAttribute('label', 'SS');
  button.setAttribute('tooltiptext', 'Semantic Search');
  button.setAttribute('class', 'zotero-tb-button');

  // 使用 ZotSeek 风格的大脑+放大镜图标
  (button as any).style.listStyleImage = 'url("chrome://zotero-mcp-plugin/content/icons/icon-toolbar.svg")';

  button.addEventListener('command', () => {
    getSemanticSearchDialog().open();
  });

  // 插入到搜索框之前，没有搜索框则追加到末尾
  const searchBox = toolbar.querySelector('#zotero-tb-search');
  if (searchBox) {
    toolbar.insertBefore(separator, searchBox);
    toolbar.insertBefore(button, separator);
  } else {
    toolbar.appendChild(button);
    toolbar.appendChild(separator);
  }

  ztoolkit.log('[SemanticDialog] Toolbar button registered');
}

/**
 * 在条目右键菜单注册"查找相似文献"
 */
export function registerFindSimilarMenu(win: _ZoteroTypes.MainWindow): void {
  const doc = win.document;

  // 先清理
  doc.getElementById(CONTEXT_MENU_FIND_SIMILAR_ID)?.remove();
  doc.getElementById(CONTEXT_MENU_SEPARATOR_ID)?.remove();

  const itemMenu = doc.getElementById('zotero-itemmenu');
  if (!itemMenu) {
    ztoolkit.log('[SemanticDialog] Item menu not found, skipping find-similar registration');
    return;
  }

  // 分隔线
  const separator = doc.createXULElement('menuseparator');
  separator.id = CONTEXT_MENU_SEPARATOR_ID;

  // 菜单项
  const menuItem = doc.createXULElement('menuitem');
  menuItem.id = CONTEXT_MENU_FIND_SIMILAR_ID;
  menuItem.setAttribute('label', 'Find Similar Documents');
  menuItem.addEventListener('command', async () => {
    const zoteroPane = win.ZoteroPane;
    if (!zoteroPane) return;

    const selectedItems = zoteroPane.getSelectedItems();
    if (!selectedItems || selectedItems.length === 0) return;

    const item = selectedItems[0];
    const title = item.getDisplayTitle?.() || '';
    getSemanticSearchDialog().findSimilar(item.key, title);
  });

  itemMenu.appendChild(separator);
  itemMenu.appendChild(menuItem);
  ztoolkit.log('[SemanticDialog] Find-similar context menu registered');
}

/**
 * 卸载所有 UI 元素
 */
export function unregisterSemanticSearchUI(win: Window): void {
  try {
    const doc = (win as any).document;
    if (!doc) return;

    // 关闭对话框
    getSemanticSearchDialog().close();

    // 移除 UI 元素
    for (const id of SEMANTIC_DIALOG_ELEMENT_IDS) {
      doc.getElementById(id)?.remove();
    }
  } catch {
    // window may already be gone
  }
}
