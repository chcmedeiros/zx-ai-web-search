import { StateGraph, MemorySaver, Annotation } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import chalk from 'chalk';
import {
  AgentState,
  TrademarkSearchParams,
  SearchResults
} from '../schemas/trademarkSchema.js';
import { WIPOScraperTool } from '../tools/scraperTool.js';
import { GeminiFormatter } from '../services/geminiFormatter.js';

const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  agentState: Annotation<AgentState>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({
      currentStep: 'initialize' as const,
      retryCount: 0,
      searchParams: { query: '', searchType: 'brand', limit: 10 } as TrademarkSearchParams
    }),
  }),
  page: Annotation<Page | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  browser: Annotation<Browser | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  context: Annotation<BrowserContext | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
});

type GraphStateType = typeof GraphState.State;

export class WIPOSearchAgent {
  private graph: any;
  private scraper: WIPOScraperTool;
  private formatter: GeminiFormatter;
  private checkpointer: MemorySaver;

  constructor() {
    this.scraper = new WIPOScraperTool();
    this.formatter = new GeminiFormatter();
    this.checkpointer = new MemorySaver();
    this.graph = this.buildGraph();
  }

  private buildGraph() {
    const workflow = new StateGraph(GraphState);

    // Add nodes to the graph
    workflow.addNode("initialize", this.initializeBrowser.bind(this));
    workflow.addNode("authenticate", this.handleAuthentication.bind(this));
    workflow.addNode("search", this.submitSearch.bind(this));
    workflow.addNode("extractResults", this.extractResults.bind(this));
    workflow.addNode("formatResults", this.formatResults.bind(this));

    // Set entry point
    workflow.setEntryPoint("initialize");

    // Define the graph flow
    workflow.addEdge("initialize", "authenticate");
    workflow.addEdge("authenticate", "search");
    workflow.addEdge("search", "extractResults");
    workflow.addEdge("extractResults", "formatResults");

    return workflow.compile({ checkpointer: this.checkpointer });
  }

  private async initializeBrowser(state: GraphStateType): Promise<Partial<GraphStateType>> {
    console.log(chalk.blue('🚀 Initializing browser session...'));

    const browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    return {
      browser,
      context,
      page,
      agentState: {
        ...state.agentState,
        browserSession: {
          sessionId: Math.random().toString(36).substring(7),
          isAuthenticated: false
        }
      }
    };
  }

  private async handleAuthentication(state: GraphStateType): Promise<Partial<GraphStateType>> {
    console.log(chalk.yellow('🔐 Handling authentication...'));

    if (!state.page) throw new Error('Page not initialized');

    const result = await this.scraper.callAction({
      action: 'handleCaptcha',
      page: state.page
    });

    const response = JSON.parse(result);

    if (!response.success) {
      throw new Error(response.message || 'Authentication failed');
    }

    return {
      agentState: {
        ...state.agentState,
        browserSession: {
          ...state.agentState.browserSession!,
          isAuthenticated: true
        }
      },
      messages: [new AIMessage('Authentication successful')]
    };
  }

  private async submitSearch(state: GraphStateType): Promise<Partial<GraphStateType>> {
    console.log(chalk.green(`🔍 Searching for: ${state.agentState.searchParams.query}`));

    if (!state.page) throw new Error('Page not initialized');

    const result = await this.scraper.callAction({
      action: 'searchTrademarks',
      page: state.page,
      query: state.agentState.searchParams.query
    });

    const response = JSON.parse(result);

    if (!response.success) {
      throw new Error(response.message || 'Search failed');
    }

    return {
      messages: [new AIMessage(`Search submitted for: ${state.agentState.searchParams.query}`)]
    };
  }

  private async extractResults(state: GraphStateType): Promise<Partial<GraphStateType>> {
    console.log(chalk.cyan('📊 Extracting search results...'));

    if (!state.page) throw new Error('Page not initialized');

    const result = await this.scraper.callAction({
      action: 'extractResults',
      page: state.page
    });

    const response = JSON.parse(result);

    if (!response.success || !response.results) {
      throw new Error(response.message || 'Failed to extract results');
    }

    return {
      agentState: {
        ...state.agentState,
        rawResults: response.results
      },
      messages: [new AIMessage(`Extracted ${response.results.length} raw results`)]
    };
  }

  private async formatResults(state: GraphStateType): Promise<Partial<GraphStateType>> {
    console.log(chalk.magenta('🤖 Formatting results with AI...'));

    if (!state.agentState.rawResults) {
      throw new Error('No raw results to format');
    }

    // Format results with Gemini AI
    const formattedResults = await this.formatter.formatResults(state.agentState.rawResults);

    const searchResults: SearchResults = {
      query: state.agentState.searchParams.query,
      totalResults: formattedResults.length,
      page: 1,
      results: formattedResults.slice(0, state.agentState.searchParams.limit),
      searchTime: Date.now(),
      timestamp: new Date()
    };

    console.log(chalk.green('✅ Search completed successfully!'));

    // Clean up browser
    if (state.browser) {
      await state.browser.close();
    }

    return {
      agentState: {
        ...state.agentState,
        searchResults
      },
      messages: [new AIMessage(`Formatted and returned ${searchResults.results.length} results`)]
    };
  }

  async search(params: TrademarkSearchParams): Promise<SearchResults | null> {
    try {
      const initialState = {
        messages: [new HumanMessage(`Search for trademark: ${params.query}`)],
        agentState: {
          searchParams: params,
          currentStep: 'initialize' as const,
          retryCount: 0
        }
      };

      // Enhanced configuration for LangSmith tracing
      const config = {
        configurable: {
          thread_id: `search_${Date.now()}`,
          run_name: `WIPO Trademark Search: ${params.query}`
        },
        tags: [
          'trademark-search',
          'wipo',
          'langgraph-workflow',
          `query:${params.query}`,
          `type:${params.searchType}`,
          'web-scraping',
          'browser-automation'
        ],
        metadata: {
          query: params.query,
          searchType: params.searchType,
          limit: params.limit,
          agent: 'WIPOSearchAgent',
          workflow: 'trademark_search',
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'development',
          version: '1.0.0'
        }
      };

      console.log(chalk.blue(`🎯 Starting LangGraph workflow for: ${params.query}`));

      const finalState = await this.graph.invoke(initialState, config);

      if (finalState?.agentState?.searchResults) {
        console.log(chalk.green(`🎉 LangGraph workflow completed successfully`));
        return finalState.agentState.searchResults;
      }

      console.log(chalk.red('❌ Search failed: No results found'));
      return null;

    } catch (error) {
      console.error(chalk.red('❌ LangGraph workflow failed:'), error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }
}