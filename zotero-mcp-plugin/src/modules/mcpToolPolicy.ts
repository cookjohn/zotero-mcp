export type ToolRisk = "read" | "write" | "destructive";

export interface ToolPolicy {
  risk: ToolRisk;
  category: string;
  requiresWriteEnabled: boolean;
  requiresConfirmation: boolean;
  guidance: string;
}

export interface ToolAnnotations {
  title?: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

const READ_ONLY_TOOLS = [
  "zotero_status",
  "get_libraries",
  "search_library",
  "search_libraries",
  "search_annotations",
  "get_item_details",
  "get_annotations",
  "get_content",
  "get_collections",
  "search_collections",
  "get_collection_details",
  "get_collection_items",
  "get_subcollections",
  "search_fulltext",
  "get_item_abstract",
  "list_export_formats",
  "export_items",
  "format_citation",
  "better_bibtex_status",
  "semantic_search",
  "find_similar",
  "semantic_status",
  "fulltext_database",
] as const;

const COLLECTION_WRITE_TOOLS = [
  "create_collection",
  "update_collection",
  "add_items_to_collection",
  "remove_items_from_collection",
] as const;

const ITEM_WRITE_TOOLS = [
  "write_note",
  "write_tag",
  "write_metadata",
  "write_item",
  "import_by_identifier",
  "attach_url",
  "download_open_access_pdf",
  "attach_file",
] as const;

const DESTRUCTIVE_TOOLS = ["delete_collection"] as const;
const OPEN_WORLD_TOOLS = [
  "semantic_search",
  "import_by_identifier",
  "attach_url",
  "download_open_access_pdf",
] as const;

export const SEMANTIC_TOOL_NAMES: Set<string> = new Set([
  "semantic_search",
  "find_similar",
  "semantic_status",
]);

export const WRITE_TOOL_NAMES: Set<string> = new Set([
  ...COLLECTION_WRITE_TOOLS,
  ...ITEM_WRITE_TOOLS,
  ...DESTRUCTIVE_TOOLS,
]);

export const DESTRUCTIVE_TOOL_NAMES: Set<string> = new Set([
  ...DESTRUCTIVE_TOOLS,
]);

const TOOL_CATEGORIES: Record<string, string> = {
  zotero_status: "server",
  get_libraries: "library",
  search_library: "library",
  search_libraries: "library",
  search_annotations: "annotation",
  get_item_details: "item",
  get_annotations: "annotation",
  get_content: "content",
  get_collections: "collection",
  search_collections: "collection",
  get_collection_details: "collection",
  get_collection_items: "collection",
  get_subcollections: "collection",
  create_collection: "collection-write",
  update_collection: "collection-write",
  delete_collection: "collection-write",
  add_items_to_collection: "collection-write",
  remove_items_from_collection: "collection-write",
  search_fulltext: "content",
  get_item_abstract: "item",
  list_export_formats: "citation",
  export_items: "citation",
  format_citation: "citation",
  better_bibtex_status: "citation",
  semantic_search: "semantic",
  find_similar: "semantic",
  semantic_status: "semantic",
  fulltext_database: "content-cache",
  write_note: "item-write",
  write_tag: "item-write",
  write_metadata: "item-write",
  write_item: "item-write",
  import_by_identifier: "item-import",
  attach_url: "attachment-write",
  download_open_access_pdf: "attachment-write",
  attach_file: "attachment-write",
};

const TOOL_GUIDANCE: Record<ToolRisk, string> = {
  read: "Safe for discovery and analysis. Does not mutate the Zotero library.",
  write:
    "Mutates Zotero data. Agent clients should show the planned change to the user before calling.",
  destructive:
    "Can remove data or collections. Agent clients should require explicit user confirmation before calling.",
};

export function getToolPolicy(toolName: string): ToolPolicy {
  const risk = getToolRisk(toolName);
  return {
    risk,
    category: TOOL_CATEGORIES[toolName] || "other",
    requiresWriteEnabled: WRITE_TOOL_NAMES.has(toolName),
    requiresConfirmation: WRITE_TOOL_NAMES.has(toolName),
    guidance: TOOL_GUIDANCE[risk],
  };
}

export function applyToolPolicy<
  T extends { name: string; description?: string },
>(tool: T): T & { annotations: ToolAnnotations } {
  const policy = getToolPolicy(tool.name);
  const inputSchema = addConfirmationSchema((tool as any).inputSchema, policy);
  return {
    ...tool,
    ...(inputSchema ? { inputSchema } : {}),
    annotations: getToolAnnotations(tool.name),
  };
}

export function getToolAnnotations(toolName: string): ToolAnnotations {
  const risk = getToolRisk(toolName);
  return {
    title: toolName,
    readOnlyHint: risk === "read",
    destructiveHint: risk === "destructive",
    idempotentHint: risk === "read",
    openWorldHint: (OPEN_WORLD_TOOLS as readonly string[]).includes(toolName),
  };
}

function addConfirmationSchema(inputSchema: any, policy: ToolPolicy): any {
  if (
    !policy.requiresConfirmation ||
    !inputSchema ||
    inputSchema.type !== "object"
  ) {
    return inputSchema;
  }

  const properties = {
    ...(inputSchema.properties || {}),
    confirm: {
      type: "boolean",
      default: false,
      description:
        "Required for real write operations. Set true only after the user explicitly approved this Zotero change.",
    },
  };

  if (policy.risk === "destructive") {
    properties.confirmationText = {
      type: "string",
      description:
        "Required for destructive operations. Must match the target key, e.g. collectionKey.",
    };
  }

  return {
    ...inputSchema,
    properties,
  };
}

export function getToolPolicySummary(toolNames?: string[]) {
  const names = toolNames || [...getAllToolNames()];

  const tools = names.map((name) => ({
    name,
    ...getToolPolicy(name),
  }));

  return {
    counts: {
      total: tools.length,
      readOnly: tools.filter((tool) => tool.risk === "read").length,
      write: tools.filter((tool) => tool.risk === "write").length,
      destructive: tools.filter((tool) => tool.risk === "destructive").length,
    },
    tools,
  };
}

export function getAllToolNames(): string[] {
  return [
    ...READ_ONLY_TOOLS,
    ...COLLECTION_WRITE_TOOLS,
    ...DESTRUCTIVE_TOOLS,
    ...ITEM_WRITE_TOOLS,
  ];
}

function getToolRisk(toolName: string): ToolRisk {
  if ((DESTRUCTIVE_TOOLS as readonly string[]).includes(toolName)) {
    return "destructive";
  }
  if (WRITE_TOOL_NAMES.has(toolName)) {
    return "write";
  }
  return "read";
}
