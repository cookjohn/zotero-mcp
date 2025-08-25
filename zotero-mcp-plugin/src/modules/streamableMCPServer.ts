import {
  handleSearch,
  handleGetItem,
  handleGetCollections,
  handleSearchCollections,
  handleGetCollectionDetails,
  handleGetCollectionItems,
  handleSearchFulltext,
  handleGetItemAbstract
} from './apiHandlers';
import { UnifiedContentExtractor } from './unifiedContentExtractor';
import { SmartAnnotationExtractor } from './smartAnnotationExtractor';
import { MCPSettingsService } from './mcpSettingsService';
import { AIInstructionsManager } from './aiInstructionsManager';

export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

/**
 * 统一的MCP响应数据结构
 */
interface UnifiedMCPResponse {
  data: any;
  metadata: {
    extractedAt: string;
    toolName: string;
    responseType: 'search' | 'content' | 'annotation' | 'collection' | 'text' | 'object' | 'array';
    aiGuidelines?: any;
    [key: string]: any;
  };
  _dataIntegrity?: string;
  _instructions?: string;
}

/**
 * Apply global AI instructions and create unified response structure
 */
function applyGlobalAIInstructions(responseData: any, toolName: string): UnifiedMCPResponse {
  if (!responseData) {
    return createUnifiedResponse(null, 'object', toolName);
  }
  
  // 处理字符串响应（如format='text'时的get_content）
  if (typeof responseData === 'string') {
    return createUnifiedResponse(responseData, 'text', toolName);
  }
  
  // 处理数组响应（如某些collection列表）
  if (Array.isArray(responseData)) {
    return createUnifiedResponse(responseData, 'array', toolName, { count: responseData.length });
  }
  
  // 处理对象响应
  if (typeof responseData === 'object') {
    // 检查是否是SmartAnnotationExtractor或UnifiedContentExtractor的完整结构
    if (responseData.metadata && (responseData.data !== undefined || responseData.content !== undefined)) {
      // 已有完整结构，只需增强metadata并保护数据
      const enhanced = {
        ...responseData,
        metadata: AIInstructionsManager.enhanceMetadataWithAIGuidelines({
          ...responseData.metadata,
          toolName,
          responseType: determineResponseType(toolName),
          toolGuidance: getToolSpecificGuidance(toolName)
        })
      };
      return AIInstructionsManager.protectResponseData(enhanced);
    }
    
    // 否则包装为统一结构
    return createUnifiedResponse(responseData, 'object', toolName);
  }
  
  // 其他类型的响应（数字、布尔等）
  return createUnifiedResponse(responseData, typeof responseData as any, toolName);
}

/**
 * 创建统一的响应结构
 */
function createUnifiedResponse(
  data: any, 
  responseType: 'search' | 'content' | 'annotation' | 'collection' | 'text' | 'object' | 'array', 
  toolName: string,
  additionalMeta?: any
): UnifiedMCPResponse {
  const baseMetadata = {
    extractedAt: new Date().toISOString(),
    toolName,
    responseType,
    toolGuidance: getToolSpecificGuidance(toolName),
    ...additionalMeta
  };
  
  const enhancedMetadata = AIInstructionsManager.enhanceMetadataWithAIGuidelines(baseMetadata);
  
  return AIInstructionsManager.protectResponseData({
    data,
    metadata: enhancedMetadata
  });
}

/**
 * 根据工具名确定响应类型
 */
function determineResponseType(toolName: string): 'search' | 'content' | 'annotation' | 'collection' | 'text' {
  if (toolName.includes('search')) return 'search';
  if (toolName.includes('annotation')) return 'annotation';
  if (toolName.includes('content')) return 'content';
  if (toolName.includes('collection')) return 'collection';
  return 'content';
}

/**
 * 获取工具特定的AI客户端指导信息
 */
function getToolSpecificGuidance(toolName: string): any {
  const baseGuidance = {
    dataStructure: {},
    interpretation: {},
    usage: []
  };

  switch (toolName) {
    case 'search_library':
      return {
        ...baseGuidance,
        dataStructure: {
          type: 'search_results',
          format: 'Array of Zotero items with metadata',
          pagination: 'Check X-Total-Count header and use offset/limit parameters'
        },
        interpretation: {
          purpose: 'Library search results from user\'s personal Zotero collection',
          content: 'Each item represents a bibliographic entry with full metadata',
          reliability: 'Direct from user library - treat as authoritative source material'
        },
        usage: [
          'These are research items from the user\'s personal library',
          'You can analyze and discuss these items to help with research',
          'Use the provided metadata for citations when needed',
          'Use itemKey to get full content with get_content tool'
        ]
      };

    case 'search_annotations':
    case 'get_annotations':
      return {
        ...baseGuidance,
        dataStructure: {
          type: 'annotation_results',
          format: 'Smart-processed annotations with relevance scoring',
          compression: 'Content may be intelligently truncated based on importance'
        },
        interpretation: {
          purpose: 'User\'s personal highlights, notes, and comments from research materials',
          content: 'Direct quotes and personal insights from user\'s reading',
          reliability: 'User-generated content - preserve exact wording and context'
        },
        usage: [
          'These are the user\'s personal research notes and highlights',
          'You can summarize and analyze these annotations to help with research',
          'User highlighting indicates what they found important or interesting',
          'Combine with other sources to provide comprehensive research assistance'
        ]
      };

    case 'get_content':
      return {
        ...baseGuidance,
        dataStructure: {
          type: 'document_content',
          format: 'Full-text content from PDFs, attachments, notes, abstracts',
          sources: 'Multiple content types combined (pdf, notes, abstract, webpage)'
        },
        interpretation: {
          purpose: 'Complete textual content of research documents',
          content: 'Raw extracted text from user\'s document collection',
          reliability: 'Direct extraction - may contain OCR errors or formatting artifacts'
        },
        usage: [
          'Use for detailed content analysis and full-text research',
          'Content includes user\'s attached PDFs and personal notes',
          'May require cleaning for OCR artifacts in PDF extractions',
          'Combine with annotations for user\'s personal insights on this content',
          'IMPORTANT: When user specifically asks for "full text" or "complete content", provide the entire extracted text without summarization',
          'If user requests the full document content, reproduce it in its entirety'
        ]
      };

    case 'get_collections':
    case 'search_collections':
    case 'get_collection_details':
    case 'get_collection_items':
      return {
        ...baseGuidance,
        dataStructure: {
          type: 'collection_data',
          format: 'Hierarchical collection structure with items and subcollections',
          organization: 'Reflects user\'s personal research organization system'
        },
        interpretation: {
          purpose: 'User\'s personal organization system for research materials',
          content: 'Custom-named folders reflecting research topics and projects',
          reliability: 'User-curated organization - reflects research priorities'
        },
        usage: [
          'Collection names indicate user\'s research areas and interests',
          'Use collection structure to understand research project organization',
          'Respect user\'s categorization decisions in your responses',
          'Collections show thematic relationships between documents'
        ]
      };

    case 'search_fulltext':
      return {
        ...baseGuidance,
        dataStructure: {
          type: 'fulltext_search',
          format: 'Full-text search results with content snippets',
          relevance: 'Results ranked by text matching and relevance'
        },
        interpretation: {
          purpose: 'Deep content search across all document texts',
          content: 'Matching text passages from user\'s entire document collection',
          reliability: 'Search-based - results depend on query accuracy'
        },
        usage: [
          'Use for finding specific concepts across entire research collection',
          'Results show where user has relevant materials on specific topics',
          'Combine with other tools for complete context',
          'Good for discovering connections between different documents',
          'When user asks for full content from search results, use get_content with the itemKey to retrieve complete text'
        ]
      };

    case 'get_item_details':
      return {
        ...baseGuidance,
        dataStructure: {
          type: 'item_metadata',
          format: 'Complete bibliographic metadata for single item',
          completeness: 'Full citation information and item relationships'
        },
        interpretation: {
          purpose: 'Detailed metadata for specific research item',
          content: 'Publication details, authors, dates, identifiers, relationships',
          reliability: 'Curated metadata - suitable for citations and references'
        },
        usage: [
          'Use for generating proper citations and references',
          'Contains all bibliographic data needed for academic writing',
          'Use itemKey to access full content via get_content',
          'Check for related items and collections for broader context'
        ]
      };

    case 'get_item_abstract':
      return {
        ...baseGuidance,
        dataStructure: {
          type: 'abstract_content',
          format: 'Academic abstract or summary text',
          source: 'Publisher-provided or user-entered abstract'
        },
        interpretation: {
          purpose: 'Summary of research paper or document main points',
          content: 'Concise overview of research objectives, methods, results',
          reliability: 'Authoritative summary - typically from original publication'
        },
        usage: [
          'Use for quick understanding of paper\'s main contributions',
          'Suitable for literature reviews and research summaries',
          'Abstract represents author\'s own summary of their work',
          'Combine with full content and annotations for complete understanding'
        ]
      };

    default:
      return baseGuidance;
  }
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

/**
 * Streamable HTTP-based MCP Server integrated into Zotero Plugin
 * 
 * This provides a complete MCP (Model Context Protocol) server implementation
 * that runs directly within the Zotero plugin. AI clients can connect using
 * streamable HTTP requests for real-time bidirectional communication.
 * 
 * Architecture: AI Client (streamable HTTP) ↔ Zotero Plugin (integrated MCP server)
 */
export class StreamableMCPServer {
  private isInitialized: boolean = false;
  private serverInfo = {
    name: 'zotero-integrated-mcp',
    version: '1.1.0',
  };

  constructor() {
    // No initialization needed - using direct function calls
  }

  /**
   * Handle incoming MCP requests and return HTTP response
   */
  async handleMCPRequest(requestBody: string): Promise<{ status: number; statusText: string; headers: any; body: string }> {
    try {
      const request = JSON.parse(requestBody) as MCPRequest;
      ztoolkit.log(`[StreamableMCP] Received: ${request.method}`);

      const response = await this.processRequest(request);
      
      return {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(response)
      };
      
    } catch (error) {
      ztoolkit.log(`[StreamableMCP] Error handling request: ${error}`);
      
      const errorResponse: MCPResponse = {
        jsonrpc: '2.0',
        id: 'unknown',
        error: {
          code: -32700,
          message: 'Parse error'
        }
      };
      
      return {
        status: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(errorResponse)
      };
    }
  }

  /**
   * Process individual MCP requests
   */
  private async processRequest(request: MCPRequest): Promise<MCPResponse> {
    try {
      switch (request.method) {
        case 'initialize':
          return this.handleInitialize(request);

        case 'initialized':
          this.isInitialized = true;
          ztoolkit.log('[StreamableMCP] Client initialized');
          return this.createResponse(request.id, { success: true });

        case 'tools/list':
          return this.handleToolsList(request);

        case 'tools/call':
          return await this.handleToolCall(request);

        case 'ping':
          return this.createResponse(request.id, { status: 'ok' });

        default:
          return this.createError(request.id, -32601, `Method not found: ${request.method}`);
      }
    } catch (error) {
      ztoolkit.log(`[StreamableMCP] Error processing ${request.method}: ${error}`);
      return this.createError(request.id, -32603, 'Internal error');
    }
  }

  private handleInitialize(request: MCPRequest): MCPResponse {
    return this.createResponse(request.id, {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {
          listChanged: false,
        },
        logging: {},
        prompts: {},
        resources: {},
      },
      serverInfo: this.serverInfo,
    });
  }

  private handleToolsList(request: MCPRequest): MCPResponse {
    const tools = [
      {
        name: 'search_library',
        description: 'Search the Zotero library with advanced parameters including boolean operators, relevance scoring, and pagination. Returns results with attachment filePath information.',
        inputSchema: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'General search query' },
            title: { type: 'string', description: 'Title search' },
            titleOperator: { 
              type: 'string', 
              enum: ['contains', 'exact', 'startsWith', 'endsWith', 'regex'],
              description: 'Title search operator' 
            },
            yearRange: { type: 'string', description: 'Year range (e.g., "2020-2023")' },
            relevanceScoring: { type: 'boolean', description: 'Enable relevance scoring' },
            sort: { 
              type: 'string', 
              enum: ['relevance', 'date', 'title', 'year'],
              description: 'Sort order' 
            },
            limit: { type: 'number', description: 'Maximum results to return' },
            offset: { type: 'number', description: 'Pagination offset' },
          },
        },
      },
      {
        name: 'search_annotations',
        description: 'Search annotations and notes with intelligent ranking and content management',
        inputSchema: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Search query' },
            itemKeys: {
              type: 'array',
              items: { type: 'string' },
              description: 'Limit search to specific items'
            },
            types: {
              type: 'array',
              items: { 
                type: 'string',
                enum: ['note', 'highlight', 'annotation', 'ink', 'text', 'image']
              },
              description: 'Types of annotations to search'
            },
            outputMode: {
              type: 'string',
              enum: ['smart', 'preview', 'full', 'minimal'],
              description: 'Content processing mode (uses user setting default if not specified)'
            },
            maxTokens: {
              type: 'number',
              description: 'Token budget (uses user setting default if not specified)'
            },
            minRelevance: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              default: 0.1,
              description: 'Minimum relevance threshold'
            },
            limit: { type: 'number', default: 15, description: 'Maximum results' },
            offset: { type: 'number', default: 0, description: 'Pagination offset' }
          },
          required: ['q']
        },
      },
      {
        name: 'get_item_details',
        description: 'Get detailed information for a specific item including metadata, abstract, attachments, notes, and tags but not fulltext content',
        inputSchema: {
          type: 'object',
          properties: {
            itemKey: { type: 'string', description: 'Unique item key' },
          },
          required: ['itemKey'],
        },
      },
      {
        name: 'get_annotations',
        description: 'Get annotations and notes with intelligent content management (PDF annotations, highlights, notes)',
        inputSchema: {
          type: 'object',
          properties: {
            itemKey: { type: 'string', description: 'Get all annotations for this item' },
            annotationId: { type: 'string', description: 'Get specific annotation by ID' },
            annotationIds: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Get multiple annotations by IDs'
            },
            types: {
              type: 'array',
              items: { 
                type: 'string',
                enum: ['note', 'highlight', 'annotation', 'ink', 'text', 'image']
              },
              default: ['note', 'highlight', 'annotation'],
              description: 'Types of annotations to include'
            },
            outputMode: {
              type: 'string',
              enum: ['smart', 'preview', 'full', 'minimal'],
              description: 'Content processing mode (uses user setting default if not specified)'
            },
            maxTokens: {
              type: 'number',
              description: 'Token budget (uses user setting default if not specified)'
            },
            limit: { type: 'number', default: 20, description: 'Maximum results' },
            offset: { type: 'number', default: 0, description: 'Pagination offset' }
          },
          anyOf: [
            { required: ['itemKey'] },
            { required: ['annotationId'] },
            { required: ['annotationIds'] }
          ]
        },
      },
      {
        name: 'get_content',
        description: 'Unified content extraction tool: get PDF, attachments, notes, abstract etc. from items or specific attachments',
        inputSchema: {
          type: 'object',
          properties: {
            itemKey: { type: 'string', description: 'Item key to get all content from this item' },
            attachmentKey: { type: 'string', description: 'Attachment key to get content from specific attachment' },
            include: {
              type: 'object',
              properties: {
                pdf: { type: 'boolean', default: true, description: 'Include PDF attachments content' },
                attachments: { type: 'boolean', default: true, description: 'Include other attachments content' },
                notes: { type: 'boolean', default: true, description: 'Include notes content' },
                abstract: { type: 'boolean', default: true, description: 'Include abstract' },
                webpage: { type: 'boolean', default: false, description: 'Include webpage snapshots' }
              },
              description: 'Content types to include (only applies to itemKey)'
            },
            format: { 
              type: 'string', 
              enum: ['json', 'text'],
              default: 'json',
              description: 'Output format: json (structured) or text (plain text)' 
            }
          },
          anyOf: [
            { required: ['itemKey'] },
            { required: ['attachmentKey'] }
          ]
        },
      },
      {
        name: 'get_collections',
        description: 'Get list of all collections in the library',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Maximum results to return' },
            offset: { type: 'number', description: 'Pagination offset' },
          },
        },
      },
      {
        name: 'search_collections',
        description: 'Search collections by name',
        inputSchema: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Collection name search query' },
            limit: { type: 'number', description: 'Maximum results to return' },
          },
        },
      },
      {
        name: 'get_collection_details',
        description: 'Get detailed information about a specific collection',
        inputSchema: {
          type: 'object',
          properties: {
            collectionKey: { type: 'string', description: 'Collection key' },
          },
          required: ['collectionKey'],
        },
      },
      {
        name: 'get_collection_items',
        description: 'Get items in a specific collection',
        inputSchema: {
          type: 'object',
          properties: {
            collectionKey: { type: 'string', description: 'Collection key' },
            limit: { type: 'number', description: 'Maximum results to return' },
            offset: { type: 'number', description: 'Pagination offset' },
          },
          required: ['collectionKey'],
        },
      },
      {
        name: 'search_fulltext',
        description: 'Search within fulltext content of items with context and relevance scoring',
        inputSchema: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Search query' },
            itemKeys: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Limit search to specific items (optional)' 
            },
            contextLength: { type: 'number', description: 'Context length around matches (default: 200)' },
            maxResults: { type: 'number', description: 'Maximum results to return (default: 50)' },
            caseSensitive: { type: 'boolean', description: 'Case sensitive search (default: false)' },
          },
          required: ['q'],
        },
      },
      {
        name: 'get_item_abstract',
        description: 'Get the abstract/summary of a specific item',
        inputSchema: {
          type: 'object',
          properties: {
            itemKey: { type: 'string', description: 'Item key' },
            format: { 
              type: 'string', 
              enum: ['json', 'text'],
              description: 'Response format (default: json)' 
            },
          },
          required: ['itemKey'],
        },
      },
    ];

    return this.createResponse(request.id, { tools });
  }

  private async handleToolCall(request: MCPRequest): Promise<MCPResponse> {
    const { name, arguments: args } = request.params;
    
    try {
      let result;
      
      switch (name) {
        case 'search_library':
          result = await this.callSearchLibrary(args);
          break;

        case 'search_annotations':
          if (!args?.q) {
            throw new Error('q (query) is required');
          }
          result = await this.callSearchAnnotations(args);
          break;

        case 'get_item_details':
          if (!args?.itemKey) {
            throw new Error('itemKey is required');
          }
          result = await this.callGetItemDetails(args.itemKey);
          break;

        case 'get_annotations':
          if (!args?.itemKey && !args?.annotationId && !args?.annotationIds) {
            throw new Error('Either itemKey, annotationId, or annotationIds is required');
          }
          result = await this.callGetAnnotations(args);
          break;

        case 'get_content':
          if (!args?.itemKey && !args?.attachmentKey) {
            throw new Error('Either itemKey or attachmentKey is required');
          }
          result = await this.callGetContent(args);
          break;

        case 'get_collections':
          result = await this.callGetCollections(args);
          break;

        case 'search_collections':
          result = await this.callSearchCollections(args);
          break;

        case 'get_collection_details':
          if (!args?.collectionKey) {
            throw new Error('collectionKey is required');
          }
          result = await this.callGetCollectionDetails(args.collectionKey);
          break;

        case 'get_collection_items':
          if (!args?.collectionKey) {
            throw new Error('collectionKey is required');
          }
          result = await this.callGetCollectionItems(args);
          break;

        case 'search_fulltext':
          if (!args?.q) {
            throw new Error('q (query) is required');
          }
          result = await this.callSearchFulltext(args);
          break;

        case 'get_item_abstract':
          if (!args?.itemKey) {
            throw new Error('itemKey is required');
          }
          result = await this.callGetItemAbstract(args);
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return this.createResponse(request.id, {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
        isError: false,
      });

    } catch (error) {
      ztoolkit.log(`[StreamableMCP] Tool call error for ${name}: ${error}`);
      return this.createResponse(request.id, {
        content: [
          {
            type: 'text',
            text: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      });
    }
  }

  private async callSearchLibrary(args: any): Promise<any> {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(args || {})) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const response = await handleSearch(searchParams);
    const result = response.body ? JSON.parse(response.body) : response;
    return applyGlobalAIInstructions(result, 'search_library');
  }

  private async callSearchAnnotations(args: any): Promise<any> {
    const extractor = new SmartAnnotationExtractor();
    const { q, ...options } = args;
    const result = await extractor.searchAnnotations(q, options);
    return applyGlobalAIInstructions(result, 'search_annotations');
  }

  private async callGetItemDetails(itemKey: string): Promise<any> {
    // Import the specific handler for item details
    const { handleGetItem } = await import('./apiHandlers');
    
    // Call the dedicated item details handler
    const response = await handleGetItem({ 1: itemKey }, new URLSearchParams());
    const result = response.body ? JSON.parse(response.body) : response;
    return applyGlobalAIInstructions(result, 'get_item_details');
  }

  private async callGetAnnotations(args: any): Promise<any> {
    const extractor = new SmartAnnotationExtractor();
    const result = await extractor.getAnnotations(args);
    return applyGlobalAIInstructions(result, 'get_annotations');
  }

  private async callGetContent(args: any): Promise<any> {
    const { itemKey, attachmentKey, include, format } = args;
    const extractor = new UnifiedContentExtractor();
    
    try {
      let result;
      
      if (itemKey) {
        // Get content from item
        result = await extractor.getItemContent(itemKey, include || {});
      } else if (attachmentKey) {
        // Get content from specific attachment
        result = await extractor.getAttachmentContent(attachmentKey);
      } else {
        throw new Error('Either itemKey or attachmentKey must be provided');
      }
      
      // Apply format conversion if requested
      if (format === 'text' && itemKey) {
        return extractor.convertToText(result);
      } else if (format === 'text' && attachmentKey) {
        return result.content || '';
      }
      
      return applyGlobalAIInstructions(result, 'get_content');
    } catch (error) {
      ztoolkit.log(`[StreamableMCP] Error in callGetContent: ${error}`, 'error');
      throw error;
    }
  }

  private async callGetCollections(args: any): Promise<any> {
    const collectionParams = new URLSearchParams();
    for (const [key, value] of Object.entries(args || {})) {
      if (value !== undefined && value !== null) {
        collectionParams.append(key, String(value));
      }
    }
    const response = await handleGetCollections(collectionParams);
    const result = response.body ? JSON.parse(response.body) : response;
    return applyGlobalAIInstructions(result, 'get_collections');
  }

  private async callSearchCollections(args: any): Promise<any> {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(args || {})) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const response = await handleSearchCollections(searchParams);
    const result = response.body ? JSON.parse(response.body) : response;
    return applyGlobalAIInstructions(result, 'search_collections');
  }

  private async callGetCollectionDetails(collectionKey: string): Promise<any> {
    const response = await handleGetCollectionDetails({ 1: collectionKey }, new URLSearchParams());
    const result = response.body ? JSON.parse(response.body) : response;
    return applyGlobalAIInstructions(result, 'get_collection_details');
  }

  private async callGetCollectionItems(args: any): Promise<any> {
    const { collectionKey, ...otherArgs } = args;
    const itemParams = new URLSearchParams();
    for (const [key, value] of Object.entries(otherArgs)) {
      if (value !== undefined && value !== null) {
        itemParams.append(key, String(value));
      }
    }
    const response = await handleGetCollectionItems({ 1: collectionKey }, itemParams);
    const result = response.body ? JSON.parse(response.body) : response;
    return applyGlobalAIInstructions(result, 'get_collection_items');
  }


  private async callSearchFulltext(args: any): Promise<any> {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(args || {})) {
      if (value !== undefined && value !== null) {
        if (key === 'itemKeys' && Array.isArray(value)) {
          searchParams.append(key, value.join(','));
        } else {
          searchParams.append(key, String(value));
        }
      }
    }
    const response = await handleSearchFulltext(searchParams);
    const result = response.body ? JSON.parse(response.body) : response;
    return applyGlobalAIInstructions(result, 'search_fulltext');
  }

  private async callGetItemAbstract(args: any): Promise<any> {
    const { itemKey, ...otherArgs } = args;
    const abstractParams = new URLSearchParams();
    for (const [key, value] of Object.entries(otherArgs)) {
      if (value !== undefined && value !== null) {
        abstractParams.append(key, String(value));
      }
    }
    const response = await handleGetItemAbstract({ 1: itemKey }, abstractParams);
    const result = response.body ? JSON.parse(response.body) : response;
    return applyGlobalAIInstructions(result, 'get_item_abstract');
  }

  private createResponse(id: string | number, result: any): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  private createError(id: string | number, code: number, message: string, data?: any): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    };
  }

  /**
   * Get server status and capabilities
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      serverInfo: this.serverInfo,
      protocolVersion: '2024-11-05',
      supportedMethods: [
        'initialize',
        'initialized', 
        'tools/list',
        'tools/call',
        'ping'
      ],
      availableTools: [
        'search_library',
        'search_annotations',
        'get_item_details',
        'get_annotations',
        'get_content',
        'get_collections',
        'search_collections',
        'get_collection_details',
        'get_collection_items',
        'search_fulltext',
        'get_item_abstract'
      ]
    };
  }
}