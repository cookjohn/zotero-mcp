/**
 * 注释和高亮内容服务
 * 提供对Zotero中笔记、PDF注释、高亮等内容的检索功能
 */

declare let ztoolkit: ZToolkit;

// 注释内容接口
export interface AnnotationContent {
  id: string;
  itemKey: string;
  parentKey?: string;
  type: "note" | "highlight" | "annotation" | "ink" | "text" | "image";
  content: string;
  text?: string; // 高亮的原始文本
  comment?: string; // 用户添加的评论
  color?: string; // 高亮颜色
  tags: string[];
  dateAdded: string;
  dateModified: string;
  page?: number;
  position?: any; // PDF中的位置信息
  sortIndex?: number;
}

// 搜索参数
export interface AnnotationSearchParams {
  q?: string; // 搜索关键词
  itemKey?: string; // 特定文献的Key
  type?: string | string[]; // 注释类型过滤
  tags?: string | string[]; // 标签过滤
  color?: string; // 颜色过滤
  dateRange?: string; // 日期范围
  hasComment?: boolean; // 是否有评论
  limit?: string;
  offset?: string;
  sort?: string; // dateAdded, dateModified, position
  direction?: string;
  // 新增：内容详细程度控制
  detailed?: boolean; // 是否返回完整内容，默认false
}

export class AnnotationService {
  /**
   * 智能截断文本，保留完整句子
   */
  private smartTruncate(text: string, maxLength: number = 200): string {
    if (!text || text.length <= maxLength) return text;
    
    const truncated = text.substring(0, maxLength);
    // 寻找最后一个句号或换行
    const lastPeriod = Math.max(
      truncated.lastIndexOf('。'),
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('\n')
    );
    
    // 如果找到合适的句子边界且不会截断太多内容
    if (lastPeriod > maxLength * 0.6) {
      return truncated.substring(0, lastPeriod + 1) + "...";
    }
    
    return truncated + "...";
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string, maxCount: number = 5): string[] {
    if (!text) return [];
    
    // 简单的关键词提取：移除停用词，按词频排序
    const stopWords = new Set(['的', '了', '在', '是', '和', '与', '或', '但', '然而', '因此', '所以', 
                              'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with']);
    
    const words = text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ') // 保留中英文字符
      .split(/\s+/)
      .filter(word => word.length > 1 && !stopWords.has(word));
    
    // 统计词频
    const wordCount = new Map<string, number>();
    words.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    });
    
    // 按频率排序并返回前N个
    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxCount)
      .map(([word]) => word);
  }

  /**
   * 处理注释内容，根据需要返回简化或完整版本
   */
  private processAnnotationContent(annotation: AnnotationContent, detailed: boolean = false): AnnotationContent {
    if (detailed) {
      return annotation; // 返回完整内容
    }
    
    // 创建简化版本
    const processed: AnnotationContent = {
      ...annotation,
      content: this.smartTruncate(annotation.content),
      text: annotation.text ? this.smartTruncate(annotation.text, 150) : annotation.text,
      comment: annotation.comment ? this.smartTruncate(annotation.comment, 100) : annotation.comment,
    };
    
    // 添加额外的元数据
    (processed as any).contentMeta = {
      isPreview: !detailed,
      originalLength: annotation.content?.length || 0,
      textLength: annotation.text?.length || 0,
      commentLength: annotation.comment?.length || 0,
      keywords: this.extractKeywords(annotation.content + " " + (annotation.text || "") + " " + (annotation.comment || ""))
    };
    
    return processed;
  }

  /**
   * 获取所有笔记内容
   * @param itemKey 可选，特定文献的笔记
   * @returns 笔记列表
   */
  async getAllNotes(itemKey?: string): Promise<AnnotationContent[]> {
    try {
      ztoolkit.log(
        `[AnnotationService] Getting all notes${itemKey ? " for item " + itemKey : ""}`,
      );

      let items: Zotero.Item[];

      if (itemKey) {
        // 获取特定文献的笔记
        const parentItem = Zotero.Items.getByLibraryAndKey(
          Zotero.Libraries.userLibraryID,
          itemKey,
        );
        if (!parentItem) {
          throw new Error(`Item with key ${itemKey} not found`);
        }

        const noteIds = parentItem.getNotes(false);
        items = noteIds.map((id) => Zotero.Items.get(id)).filter(Boolean);
      } else {
        // 获取所有笔记
        const search = new Zotero.Search();
        (search as any).libraryID = Zotero.Libraries.userLibraryID;
        search.addCondition("itemType", "is", "note");

        const itemIds = await search.search();
        items = await Zotero.Items.getAsync(itemIds);
      }

      const notes: AnnotationContent[] = [];

      for (const item of items) {
        try {
          const noteContent = this.formatNoteItem(item);
          if (noteContent) {
            notes.push(noteContent);
          }
        } catch (e) {
          ztoolkit.log(
            `[AnnotationService] Error processing note ${item.id}: ${e}`,
            "error",
          );
        }
      }

      ztoolkit.log(`[AnnotationService] Found ${notes.length} notes`);
      return notes;
    } catch (error) {
      ztoolkit.log(
        `[AnnotationService] Error getting notes: ${error}`,
        "error",
      );
      throw error;
    }
  }

  /**
   * 获取PDF注释和高亮
   * @param itemKey PDF文献的Key
   * @returns 注释列表
   */
  async getPDFAnnotations(itemKey: string): Promise<AnnotationContent[]> {
    try {
      ztoolkit.log(
        `[AnnotationService] Getting PDF annotations for ${itemKey}`,
      );

      const item = Zotero.Items.getByLibraryAndKey(
        Zotero.Libraries.userLibraryID,
        itemKey,
      );

      if (!item) {
        throw new Error(`Item with key ${itemKey} not found`);
      }

      const annotations: AnnotationContent[] = [];

      // 获取附件
      const attachmentIds = item.getAttachments();

      for (const attachmentId of attachmentIds) {
        try {
          const attachment = Zotero.Items.get(attachmentId);
          if (!attachment || !attachment.isPDFAttachment()) {
            continue;
          }

          // 获取PDF的注释
          const annotationItems = attachment.getAnnotations();

          for (const annotationItem of annotationItems) {
            try {
              const annotationContent = this.formatAnnotationItem(
                annotationItem,
                attachment.key,
              );
              if (annotationContent) {
                annotations.push(annotationContent);
              }
            } catch (e) {
              ztoolkit.log(
                `[AnnotationService] Error processing annotation ${annotationItem.id}: ${e}`,
                "error",
              );
            }
          }
        } catch (e) {
          ztoolkit.log(
            `[AnnotationService] Error processing attachment ${attachmentId}: ${e}`,
            "error",
          );
        }
      }

      // 按位置排序
      annotations.sort((a, b) => {
        if (a.page !== b.page) {
          return (a.page || 0) - (b.page || 0);
        }
        return (a.sortIndex || 0) - (b.sortIndex || 0);
      });

      ztoolkit.log(
        `[AnnotationService] Found ${annotations.length} PDF annotations`,
      );
      return annotations;
    } catch (error) {
      ztoolkit.log(
        `[AnnotationService] Error getting PDF annotations: ${error}`,
        "error",
      );
      throw error;
    }
  }

  /**
   * 搜索注释和高亮内容
   * @param params 搜索参数
   * @returns 搜索结果
   */
  async searchAnnotations(params: AnnotationSearchParams): Promise<{
    pagination: any;
    searchTime: string;
    totalCount: number;
    contentMode: string;
    version: string;
    endpoint: string;
    results: AnnotationContent[];
  }> {
    const startTime = Date.now();
    ztoolkit.log(
      `[AnnotationService] Searching annotations with params: ${JSON.stringify(params)}`,
    );

    try {
      const allAnnotations: AnnotationContent[] = [];

      // 获取笔记
      if (
        !params.type ||
        params.type === "note" ||
        (Array.isArray(params.type) && params.type.includes("note"))
      ) {
        const notes = await this.getAllNotes(params.itemKey);
        allAnnotations.push(...notes);
      }

      // 获取PDF注释
      if (!params.type || params.type !== "note") {
        if (params.itemKey) {
          const pdfAnnotations = await this.getPDFAnnotations(params.itemKey);
          allAnnotations.push(...pdfAnnotations);
        } else {
          // 获取所有文献的PDF注释（可能较慢）
          const allItems = await Zotero.Items.getAll(
            Zotero.Libraries.userLibraryID,
          );
          for (const item of allItems.slice(0, 50)) {
            // 限制数量避免性能问题
            if (
              item.isRegularItem() &&
              !item.isNote() &&
              !item.isAttachment()
            ) {
              try {
                const pdfAnnotations = await this.getPDFAnnotations(item.key);
                allAnnotations.push(...pdfAnnotations);
              } catch (e) {
                // 忽略单个文献的错误
              }
            }
          }
        }
      }

      // 应用过滤器
      let filteredAnnotations = this.filterAnnotations(allAnnotations, params);

      // 应用搜索
      if (params.q) {
        filteredAnnotations = this.searchInAnnotations(
          filteredAnnotations,
          params.q,
        );
      }

      // 处理内容（简化或完整）
      const detailed = params.detailed === true || String(params.detailed) === "true";

      // 排序
      const sort = params.sort || "dateModified";
      const direction = params.direction || "desc";
      this.sortAnnotations(filteredAnnotations, sort, direction);

      // 分页 - 为preview模式使用更小的默认值
      const defaultLimit = detailed ? "50" : "20"; // preview模式默认20条，详细模式50条
      const limit = Math.min(parseInt(params.limit || defaultLimit, 10), detailed ? 200 : 100);
      const offset = parseInt(params.offset || "0", 10);
      const totalCount = filteredAnnotations.length;
      const paginatedResults = filteredAnnotations.slice(
        offset,
        offset + limit,
      );
      const processedResults = paginatedResults.map(annotation => 
        this.processAnnotationContent(annotation, detailed)
      );

      const searchTime = `${Date.now() - startTime}ms`;
      ztoolkit.log(
        `[AnnotationService] Search completed in ${searchTime}, found ${totalCount} results (detailed: ${detailed})`,
      );

      return {
        // 元数据信息放在最前面
        pagination: {
          limit,
          offset,
          total: totalCount,
          hasMore: offset + limit < totalCount,
        },
        searchTime,
        totalCount,
        contentMode: detailed ? "full" : "preview",
        version: "2.0",
        endpoint: "annotations/search",
        // 实际数据放在后面
        results: processedResults,
      };
    } catch (error) {
      ztoolkit.log(
        `[AnnotationService] Error searching annotations: ${error}`,
        "error",
      );
      throw error;
    }
  }

  /**
   * 格式化笔记项目
   */
  private formatNoteItem(item: Zotero.Item): AnnotationContent | null {
    try {
      const noteText = item.getNote() || "";
      if (!noteText.trim()) {
        return null;
      }

      // 提取纯文本内容
      const textContent = noteText.replace(/<[^>]*>/g, "").trim();

      return {
        id: item.key,
        itemKey: item.key,
        parentKey: item.parentKey || undefined,
        type: "note",
        content: noteText,
        text: textContent,
        tags: item.getTags().map((t) => t.tag),
        dateAdded: item.dateAdded,
        dateModified: item.dateModified,
      };
    } catch (error) {
      ztoolkit.log(
        `[AnnotationService] Error formatting note item: ${error}`,
        "error",
      );
      return null;
    }
  }

  /**
   * 格式化注释项目
   */
  private formatAnnotationItem(
    item: Zotero.Item,
    parentKey: string,
  ): AnnotationContent | null {
    try {
      if (!item.isAnnotation()) {
        return null;
      }

      const annotationText = item.annotationText || "";
      const annotationComment = item.annotationComment || "";
      const annotationType = item.annotationType;
      const annotationColor = item.annotationColor || "";
      const annotationPageLabel = item.annotationPageLabel;
      const annotationSortIndex = item.annotationSortIndex;

      if (!annotationText.trim() && !annotationComment.trim()) {
        return null;
      }

      // 映射注释类型
      let type: AnnotationContent["type"] = "annotation";
      switch (annotationType) {
        case "highlight":
          type = "highlight";
          break;
        case "note":
          type = "text";
          break;
        case "image":
          type = "image";
          break;
        case "ink":
          type = "ink";
          break;
        default:
          type = "annotation";
          break;
      }

      return {
        id: item.key,
        itemKey: item.key,
        parentKey: parentKey,
        type,
        content: annotationComment || annotationText,
        text: annotationText,
        comment: annotationComment,
        color: annotationColor,
        tags: item.getTags().map((t) => t.tag),
        dateAdded: item.dateAdded,
        dateModified: item.dateModified,
        page: annotationPageLabel
          ? parseInt(annotationPageLabel, 10)
          : undefined,
        sortIndex: annotationSortIndex,
      };
    } catch (error) {
      ztoolkit.log(
        `[AnnotationService] Error formatting annotation item: ${error}`,
        "error",
      );
      return null;
    }
  }

  /**
   * 过滤注释
   */
  private filterAnnotations(
    annotations: AnnotationContent[],
    params: AnnotationSearchParams,
  ): AnnotationContent[] {
    return annotations.filter((annotation) => {
      // 类型过滤
      if (params.type) {
        const types = Array.isArray(params.type) ? params.type : [params.type];
        if (!types.includes(annotation.type)) {
          return false;
        }
      }

      // 标签过滤
      if (params.tags) {
        const searchTags = Array.isArray(params.tags)
          ? params.tags
          : [params.tags];
        const hasMatchingTag = searchTags.some((searchTag) =>
          annotation.tags.some((tag) =>
            tag.toLowerCase().includes(searchTag.toLowerCase()),
          ),
        );
        if (!hasMatchingTag) {
          return false;
        }
      }

      // 颜色过滤
      if (params.color && annotation.color !== params.color) {
        return false;
      }

      // 评论过滤
      if (params.hasComment !== undefined) {
        const hasComment = !!(annotation.comment && annotation.comment.trim());
        if (params.hasComment !== hasComment) {
          return false;
        }
      }

      // 日期范围过滤
      if (params.dateRange) {
        const [startDate, endDate] = params.dateRange
          .split(",")
          .map((d) => new Date(d.trim()));
        const itemDate = new Date(annotation.dateModified);
        if (startDate && itemDate < startDate) return false;
        if (endDate && itemDate > endDate) return false;
      }

      return true;
    });
  }

  /**
   * 在注释中搜索
   */
  private searchInAnnotations(
    annotations: AnnotationContent[],
    query: string,
  ): AnnotationContent[] {
    const lowerQuery = query.toLowerCase();

    return annotations.filter((annotation) => {
      const searchFields = [
        annotation.content,
        annotation.text,
        annotation.comment,
        annotation.tags.join(" "),
      ].filter(Boolean);

      return searchFields.some(
        (field) => field && field.toLowerCase().includes(lowerQuery),
      );
    });
  }

  /**
   * 排序注释
   */
  private sortAnnotations(
    annotations: AnnotationContent[],
    sort: string,
    direction: string,
  ): void {
    annotations.sort((a, b) => {
      let valueA: any, valueB: any;

      switch (sort) {
        case "dateAdded":
          valueA = new Date(a.dateAdded);
          valueB = new Date(b.dateAdded);
          break;
        case "dateModified":
          valueA = new Date(a.dateModified);
          valueB = new Date(b.dateModified);
          break;
        case "position":
          valueA = (a.page || 0) * 1000 + (a.sortIndex || 0);
          valueB = (b.page || 0) * 1000 + (b.sortIndex || 0);
          break;
        case "type":
          valueA = a.type;
          valueB = b.type;
          break;
        default:
          valueA = a.dateModified;
          valueB = b.dateModified;
          break;
      }

      if (valueA < valueB) return direction === "asc" ? -1 : 1;
      if (valueA > valueB) return direction === "asc" ? 1 : -1;
      return 0;
    });
  }

  /**
   * 根据ID获取注释的完整内容
   */
  async getAnnotationById(annotationId: string): Promise<AnnotationContent | null> {
    try {
      ztoolkit.log(`[AnnotationService] Getting annotation by ID: ${annotationId}`);
      
      // 尝试从笔记中查找
      const notes = await this.getAllNotes();
      const note = notes.find(n => n.id === annotationId);
      if (note) {
        return note;
      }

      // 从所有PDF注释中查找
      const allItems = await Zotero.Items.getAll(Zotero.Libraries.userLibraryID);
      for (const item of allItems.slice(0, 100)) { // 限制搜索范围避免性能问题
        if (item.isRegularItem() && !item.isNote() && !item.isAttachment()) {
          try {
            const annotations = await this.getPDFAnnotations(item.key);
            const annotation = annotations.find(a => a.id === annotationId);
            if (annotation) {
              return annotation;
            }
          } catch (e) {
            // 忽略单个文献的错误
          }
        }
      }

      return null;
    } catch (error) {
      ztoolkit.log(`[AnnotationService] Error getting annotation by ID: ${error}`, "error");
      throw error;
    }
  }

  /**
   * 批量获取注释的完整内容
   */
  async getAnnotationsByIds(annotationIds: string[]): Promise<AnnotationContent[]> {
    try {
      ztoolkit.log(`[AnnotationService] Getting annotations by IDs: ${annotationIds.join(", ")}`);
      
      const results: AnnotationContent[] = [];
      
      for (const id of annotationIds) {
        const annotation = await this.getAnnotationById(id);
        if (annotation) {
          results.push(annotation);
        }
      }
      
      return results;
    } catch (error) {
      ztoolkit.log(`[AnnotationService] Error getting annotations by IDs: ${error}`, "error");
      throw error;
    }
  }
}
