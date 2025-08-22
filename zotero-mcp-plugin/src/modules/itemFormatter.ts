declare let ztoolkit: ZToolkit;

/**
 * Formats a single Zotero item into a brief JSON object for search results.
 * @param item The Zotero.Item object to format.
 * @returns A JSON object with essential item details.
 */
export function formatItemBrief(item: Zotero.Item): Record<string, any> {
  return {
    key: item.key,
    title: item.getField("title") || "No Title",
    creators: item
      .getCreators()
      .map((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim())
      .join(", "),
    date: item.getField("date")?.match(/\d{4}/)?.[0] || "", // Extract year
  };
}

/**
 * Formats a single Zotero item into a detailed JSON object.
 * @param item The Zotero.Item object to format.
 * @param fields Optional array of fields to include in the output.
 * @returns A JSON object representing the item.
 */
export async function formatItem(
  item: Zotero.Item,
  fields?: string[],
): Promise<Record<string, any>> {
  let fieldsToExport: string[];

  if (fields) {
    fieldsToExport = fields;
  } else {
    fieldsToExport = [
      "title",
      "creators",
      "date",
      "itemType",
      "publicationTitle",
      "volume",
      "issue",
      "pages",
      "DOI",
      "url",
      "abstractNote",
      "tags",
      "notes",
      "attachments",
    ];
  }
  const formattedItem: Record<string, any> = {
    key: item.key,
    itemType: item.itemType,
    zoteroUrl: `zotero://select/library/items/${item.key}`,
  };

  // 修复字符串编码的辅助函数
  function fixStringEncoding(str: string): string {
    if (!str) return str;
    try {
      // 检查是否是UTF-8编码损坏的字符串
      if (str.includes("") || /[\x80-\xFF]/.test(str)) {
        ztoolkit.log(
          `[ItemFormatter] Detecting encoding issues in string: ${str.substring(0, 50)}`,
        );

        // 尝试多种编码修复方法
        try {
          // 方法1: 尝试用TextDecoder重新解码
          const encoder = new TextEncoder();
          const bytes = encoder.encode(str);
          const decoder = new TextDecoder("utf-8", { fatal: false });
          const fixed = decoder.decode(bytes);
          if (fixed !== str && !fixed.includes("")) {
            ztoolkit.log(
              `[ItemFormatter] Fixed encoding using TextDecoder: ${fixed.substring(0, 50)}`,
            );
            return fixed;
          }
        } catch (e) {
          ztoolkit.log(
            `[ItemFormatter] TextDecoder method failed: ${e}`,
            "error",
          );
        }

        // 方法2: 尝试escape/unescape方法
        try {
          const fixed = decodeURIComponent(escape(str));
          if (fixed !== str && !fixed.includes("")) {
            ztoolkit.log(
              `[ItemFormatter] Fixed encoding using escape/unescape: ${fixed.substring(0, 50)}`,
            );
            return fixed;
          }
        } catch (e) {
          ztoolkit.log(
            `[ItemFormatter] Escape/unescape method failed: ${e}`,
            "error",
          );
        }
      }
      return str;
    } catch (e) {
      ztoolkit.log(`[ItemFormatter] Error fixing encoding: ${e}`, "error");
      return str;
    }
  }

  for (const field of fieldsToExport) {
    try {
      switch (field) {
        case "attachments":
          try {
            const attachmentIds = item.getAttachments(false);
            const attachments = Zotero.Items.get(attachmentIds);
            formattedItem[field] = await Promise.all(attachments
              .map(async (attachment: Zotero.Item) => {
                if (!attachment.isAttachment()) {
                  return null;
                }
                try {
                  return {
                    key: attachment.key,
                    title: fixStringEncoding(
                      attachment.getField("title") || "",
                    ),
                    path: fixStringEncoding(attachment.getFilePath() || ""),
                    contentType: fixStringEncoding(
                      attachment.attachmentContentType || "",
                    ),
                    filename: fixStringEncoding(
                      attachment.attachmentFilename || "",
                    ),
                    url: fixStringEncoding(attachment.getField("url") || ""),
                    linkMode: attachment.attachmentLinkMode,
                    hasFulltext: hasExtractableText(attachment),
                    size: await getAttachmentSize(attachment),
                  };
                } catch (e) {
                  ztoolkit.log(
                    `[ItemFormatter] Error processing attachment ${attachment.key}: ${e}`,
                    "error",
                  );
                  return null;
                }
              }))
              .then(results => results.filter((att) => att && att.path)); // 确保附件有效且有路径
          } catch (e) {
            ztoolkit.log(
              `[ItemFormatter] Error getting attachments: ${e}`,
              "error",
            );
            formattedItem[field] = [];
          }
          break;
        case "creators":
          try {
            formattedItem[field] = item.getCreators().map((creator) => ({
              firstName: fixStringEncoding(creator.firstName || ""),
              lastName: fixStringEncoding(creator.lastName || ""),
              creatorType: fixStringEncoding(
                Zotero.CreatorTypes.getName(creator.creatorTypeID) || "unknown",
              ),
            }));
          } catch (e) {
            ztoolkit.log(
              `[ItemFormatter] Error getting creators: ${e}`,
              "error",
            );
            formattedItem[field] = [];
          }
          break;
        case "tags":
          try {
            formattedItem[field] = item
              .getTags()
              .map((tag) => fixStringEncoding(tag.tag || ""));
          } catch (e) {
            ztoolkit.log(`[ItemFormatter] Error getting tags: ${e}`, "error");
            formattedItem[field] = [];
          }
          break;
        case "notes":
          try {
            formattedItem[field] = item
              .getNotes(false)
              .map((noteId: number) => {
                try {
                  const note = Zotero.Items.get(noteId);
                  return note ? fixStringEncoding(note.getNote() || "") : "";
                } catch (e) {
                  ztoolkit.log(
                    `[ItemFormatter] Error getting note ${noteId}: ${e}`,
                    "error",
                  );
                  return "";
                }
              })
              .filter((note) => note);
          } catch (e) {
            ztoolkit.log(`[ItemFormatter] Error getting notes: ${e}`, "error");
            formattedItem[field] = [];
          }
          break;
        case "date":
          try {
            formattedItem[field] = fixStringEncoding(
              item.getField("date") || "",
            );
          } catch (e) {
            ztoolkit.log(`[ItemFormatter] Error getting date: ${e}`, "error");
            formattedItem[field] = "";
          }
          break;
        default:
          try {
            const value = item.getField(field);
            formattedItem[field] = fixStringEncoding(value || "");
          } catch (e) {
            // Field doesn't exist or can't be accessed, skip silently
            formattedItem[field] = "";
          }
          break;
      }
    } catch (e) {
      ztoolkit.log(
        `[ItemFormatter] Error processing field ${field}: ${e}`,
        "error",
      );
      formattedItem[field] = null;
    }
  }

  return formattedItem;
}

/**
 * Check if an attachment has extractable text content
 */
function hasExtractableText(attachment: Zotero.Item): boolean {
  try {
    if (!attachment.isAttachment()) return false;
    
    const contentType = attachment.attachmentContentType || "";
    const path = attachment.getFilePath() || "";
    
    // Check for PDF files
    if (contentType.includes("pdf") || path.toLowerCase().endsWith(".pdf")) {
      return true;
    }
    
    // Check for text files
    if (contentType.includes("text") || 
        [".txt", ".md", ".html", ".htm", ".xml"].some(ext => path.toLowerCase().endsWith(ext))) {
      return true;
    }
    
    return false;
  } catch (error) {
    ztoolkit.log(`[ItemFormatter] Error checking extractable text: ${error}`, "error");
    return false;
  }
}

/**
 * Get attachment file size
 */
async function getAttachmentSize(attachment: Zotero.Item): Promise<number> {
  try {
    if (!attachment.isAttachment()) return 0;
    
    const path = attachment.getFilePath();
    if (!path) return 0;
    
    // Try to get file size using OS.File
    if (typeof OS !== "undefined" && OS.File && OS.File.stat) {
      try {
        const stat = await OS.File.stat(path);
        return (stat as any).size || 0;
      } catch (e) {
        ztoolkit.log(`[ItemFormatter] OS.File.stat failed: ${e}`, "error");
      }
    }
    
    // Fallback: try to use nsIFile
    try {
      const file = (Components.classes as any)["@mozilla.org/file/local;1"]
        .createInstance(Components.interfaces.nsIFile);
      file.initWithPath(path);
      if (file.exists()) {
        return file.fileSize || 0;
      }
    } catch (e) {
      ztoolkit.log(`[ItemFormatter] nsIFile method failed: ${e}`, "error");
    }
    
    return 0;
  } catch (error) {
    ztoolkit.log(`[ItemFormatter] Error getting attachment size: ${error}`, "error");
    return 0;
  }
}

/**
 * Formats an array of Zotero items into an array of JSON objects.
 * @param items An array of Zotero.Item objects to format.
 * @param fields Optional array of fields to include in the output for each item.
 * @returns An array of JSON objects representing the items.
 */
export async function formatItems(
  items: Zotero.Item[],
  fields?: string[],
): Promise<Array<Record<string, any>>> {
  return Promise.all(items.map((item) => formatItem(item, fields)));
}
