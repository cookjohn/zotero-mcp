import {
  handleSearch,
  handleSearchAnnotations,
  handleGetItemNotes,
  handleGetItemAnnotations,
  handleGetAnnotationById,
  handleGetAnnotationsBatch,
  handleGetPDFContent,
  handleGetCollections,
  handleSearchCollections,
  handleGetCollectionDetails,
  handleGetCollectionItems,
  handleGetItemFulltext,
  handleGetAttachmentContent,
  handleSearchFulltext,
  handleGetItemAbstract
} from './apiHandlers';

export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
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
        description: 'Search all notes, PDF annotations and highlights with smart content processing',
        inputSchema: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Search query for content, comments, and tags' },
            type: { 
              type: 'string', 
              enum: ['note', 'highlight', 'annotation', 'ink', 'text', 'image'],
              description: 'Filter by annotation type' 
            },
            detailed: { type: 'boolean', description: 'Return detailed content (default: false for preview)' },
            limit: { type: 'number', description: 'Maximum results (preview: 20, detailed: 50)' },
            offset: { type: 'number', description: 'Pagination offset' },
          },
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
        name: 'get_annotation_by_id',
        description: 'Get complete content of a specific annotation by ID',
        inputSchema: {
          type: 'object',
          properties: {
            annotationId: { type: 'string', description: 'Annotation ID' },
          },
          required: ['annotationId'],
        },
      },
      {
        name: 'get_annotations_batch',
        description: 'Get complete content of multiple annotations by IDs',
        inputSchema: {
          type: 'object',
          properties: {
            ids: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Array of annotation IDs' 
            },
          },
          required: ['ids'],
        },
      },
      {
        name: 'get_item_pdf_content',
        description: 'Extract text content from PDF attachments',
        inputSchema: {
          type: 'object',
          properties: {
            itemKey: { type: 'string', description: 'Item key' },
            page: { type: 'number', description: 'Specific page number (optional)' },
          },
          required: ['itemKey'],
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
        name: 'get_item_fulltext',
        description: 'Get comprehensive fulltext content from item including attachments, notes, abstracts, and webpage snapshots. Returns data with filePath included for all attachments.',
        inputSchema: {
          type: 'object',
          properties: {
            itemKey: { type: 'string', description: 'Item key' },
            attachments: { type: 'boolean', description: 'Include attachment content (default: true)' },
            notes: { type: 'boolean', description: 'Include notes content (default: true)' },
            webpage: { type: 'boolean', description: 'Include webpage snapshots (default: true)' },
            abstract: { type: 'boolean', description: 'Include abstract (default: true)' },
          },
          required: ['itemKey'],
        },
      },
      {
        name: 'get_attachment_content',
        description: 'Extract text content from a specific attachment (PDF, HTML, text files). Returns content with filePath included.',
        inputSchema: {
          type: 'object',
          properties: {
            attachmentKey: { type: 'string', description: 'Attachment key' },
            format: { 
              type: 'string', 
              enum: ['json', 'text'],
              description: 'Response format (default: json)' 
            },
          },
          required: ['attachmentKey'],
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
          result = await this.callSearchAnnotations(args);
          break;

        case 'get_item_details':
          if (!args?.itemKey) {
            throw new Error('itemKey is required');
          }
          result = await this.callGetItemDetails(args.itemKey);
          break;

        case 'get_annotation_by_id':
          if (!args?.annotationId) {
            throw new Error('annotationId is required');
          }
          result = await this.callGetAnnotationById(args.annotationId);
          break;

        case 'get_annotations_batch':
          if (!args?.ids || !Array.isArray(args.ids)) {
            throw new Error('ids array is required');
          }
          result = await this.callGetAnnotationsBatch(args.ids);
          break;

        case 'get_item_pdf_content':
          if (!args?.itemKey) {
            throw new Error('itemKey is required');
          }
          result = await this.callGetPDFContent(args);
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

        case 'get_item_fulltext':
          if (!args?.itemKey) {
            throw new Error('itemKey is required');
          }
          result = await this.callGetItemFulltext(args);
          break;

        case 'get_attachment_content':
          if (!args?.attachmentKey) {
            throw new Error('attachmentKey is required');
          }
          result = await this.callGetAttachmentContent(args);
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
    return response.body ? JSON.parse(response.body) : response;
  }

  private async callSearchAnnotations(args: any): Promise<any> {
    const annotationParams = new URLSearchParams();
    for (const [key, value] of Object.entries(args || {})) {
      if (value !== undefined && value !== null) {
        annotationParams.append(key, String(value));
      }
    }
    const response = await handleSearchAnnotations(annotationParams);
    return response.body ? JSON.parse(response.body) : response;
  }

  private async callGetItemDetails(itemKey: string): Promise<any> {
    // Import the specific handler for item details
    const { handleGetItem } = await import('./apiHandlers');
    
    // Call the dedicated item details handler
    const response = await handleGetItem({ 1: itemKey }, new URLSearchParams());
    return response.body ? JSON.parse(response.body) : response;
  }

  private async callGetAnnotationById(annotationId: string): Promise<any> {
    const response = await handleGetAnnotationById({ 1: annotationId });
    return response.body ? JSON.parse(response.body) : response;
  }

  private async callGetAnnotationsBatch(ids: string[]): Promise<any> {
    const response = await handleGetAnnotationsBatch(JSON.stringify({ ids }));
    return response.body ? JSON.parse(response.body) : response;
  }

  private async callGetPDFContent(args: any): Promise<any> {
    const { itemKey, page } = args;
    const pdfParams = new URLSearchParams();
    if (page) {
      pdfParams.append('page', String(page));
    }
    pdfParams.append('format', 'json');
    
    const response = await handleGetPDFContent({ 1: itemKey }, pdfParams);
    return response.body ? JSON.parse(response.body) : response;
  }

  private async callGetCollections(args: any): Promise<any> {
    const collectionParams = new URLSearchParams();
    for (const [key, value] of Object.entries(args || {})) {
      if (value !== undefined && value !== null) {
        collectionParams.append(key, String(value));
      }
    }
    const response = await handleGetCollections(collectionParams);
    return response.body ? JSON.parse(response.body) : response;
  }

  private async callSearchCollections(args: any): Promise<any> {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(args || {})) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const response = await handleSearchCollections(searchParams);
    return response.body ? JSON.parse(response.body) : response;
  }

  private async callGetCollectionDetails(collectionKey: string): Promise<any> {
    const response = await handleGetCollectionDetails({ 1: collectionKey }, new URLSearchParams());
    return response.body ? JSON.parse(response.body) : response;
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
    return response.body ? JSON.parse(response.body) : response;
  }

  private async callGetItemFulltext(args: any): Promise<any> {
    const { itemKey, ...otherArgs } = args;
    const fulltextParams = new URLSearchParams();
    for (const [key, value] of Object.entries(otherArgs)) {
      if (value !== undefined && value !== null) {
        fulltextParams.append(key, String(value));
      }
    }
    const response = await handleGetItemFulltext({ 1: itemKey }, fulltextParams);
    return response.body ? JSON.parse(response.body) : response;
  }

  private async callGetAttachmentContent(args: any): Promise<any> {
    const { attachmentKey, ...otherArgs } = args;
    const contentParams = new URLSearchParams();
    for (const [key, value] of Object.entries(otherArgs)) {
      if (value !== undefined && value !== null) {
        contentParams.append(key, String(value));
      }
    }
    const response = await handleGetAttachmentContent({ 1: attachmentKey }, contentParams);
    return response.body ? JSON.parse(response.body) : response;
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
    return response.body ? JSON.parse(response.body) : response;
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
    return response.body ? JSON.parse(response.body) : response;
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
        'get_annotation_by_id',
        'get_annotations_batch',
        'get_item_pdf_content',
        'get_collections',
        'search_collections',
        'get_collection_details',
        'get_collection_items',
        'get_item_fulltext',
        'get_attachment_content',
        'search_fulltext',
        'get_item_abstract'
      ]
    };
  }
}