/**
 * AI Instructions Manager for Zotero MCP Plugin
 * 
 * Provides unified AI guidance to prevent hallucination and ensure data integrity
 * across all MCP tool responses
 */

declare let ztoolkit: ZToolkit;

export interface AIGuidelines {
  dataIntegrity: string;
  usage: string[];
  verification: {
    extractedAt: string;
    sourceSystem: string;
    userLibrary: boolean;
    contentHash?: string;
  };
  constraints: string[];
  warnings: string[];
}

export class AIInstructionsManager {
  /**
   * Get global AI instructions for all MCP responses
   */
  static getGlobalInstructions(): Omit<AIGuidelines, 'verification'> {
    return {
      dataIntegrity: "VERIFIED_FROM_ZOTERO_USER_LIBRARY",
      usage: [
        "This content is from the user's personal Zotero research library",
        "You can analyze, summarize, and interpret this content to help the user",
        "When quoting directly, use proper attribution to the source",
        "Feel free to extract key insights and connections between sources",
        "Use pagination when needed to access complete datasets"
      ],
      constraints: [
        "Maintain accuracy when referencing specific details from sources",
        "Distinguish between user's personal notes and published content when relevant",
        "Preserve important citation metadata for academic references",
        "Respect the user's research organization and collection structure"
      ],
      warnings: [
        "Large datasets may be paginated - check metadata for pagination info",
        "Content from PDFs may contain OCR errors or formatting artifacts",
        "Annotation content represents user's personal research insights",
        "Some results may be compressed based on relevance and importance"
      ]
    };
  }

  /**
   * Enhance any metadata object with AI guidelines (全局应用)
   */
  static enhanceMetadataWithAIGuidelines(metadata: any): any {
    const globalInstructions = this.getGlobalInstructions();
    
    return {
      ...metadata,
      aiGuidelines: {
        ...globalInstructions,
        verification: {
          extractedAt: metadata.extractedAt || new Date().toISOString(),
          sourceSystem: "Zotero Personal Library", 
          userLibrary: true,
          contentHash: this.generateContentHash(metadata)
        }
      }
    };
  }

  /**
   * Generate a simple content hash for verification
   */
  private static generateContentHash(data: any): string {
    try {
      const content = JSON.stringify(data);
      // Simple hash for content verification
      let hash = 0;
      for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return Math.abs(hash).toString(16);
    } catch (error) {
      ztoolkit.log(`[AIInstructions] Error generating content hash: ${error}`, 'warn');
      return 'unknown';
    }
  }

  /**
   * Apply global protection to any response data
   */
  static protectResponseData(responseData: any): any {
    // 为所有响应数据添加适度的标记
    return {
      ...responseData,
      _dataIntegrity: 'VERIFIED_FROM_ZOTERO_LIBRARY',
      _instructions: 'RESEARCH_DATA_FROM_USER_LIBRARY'
    };
  }
}