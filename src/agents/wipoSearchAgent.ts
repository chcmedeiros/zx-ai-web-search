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
  private checkpointer: MemorySaver;

  constructor() {
    this.scraper = new WIPOScraperTool();
    this.checkpointer = new MemorySaver();
    this.graph = this.buildGraph();
  }

  private buildGraph() {
    const graph = new StateGraph(GraphState);

    graph.addNode('initialize', async (state: GraphStateType) => {
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
          currentStep: 'authenticate' as const,
          browserSession: {
            sessionId: Math.random().toString(36).substring(7),
            isAuthenticated: false
          }
        }
      };
    });

    graph.addNode('authenticate', async (state: GraphStateType) => {
      console.log(chalk.yellow('🔐 Handling authentication...'));

      if (!state.page) throw new Error('Page not initialized');

      const result = await this.scraper.callAction({
        action: 'handleCaptcha',
        page: state.page
      });

      const response = JSON.parse(result);

      if (response.success) {
        return {
          agentState: {
            ...state.agentState,
            currentStep: 'search' as const,
            browserSession: {
              ...state.agentState.browserSession!,
              isAuthenticated: true
            }
          },
          messages: [new AIMessage('Authentication successful')]
        };
      }

      return {
        agentState: {
          ...state.agentState,
          currentStep: 'error' as const,
          error: {
            message: response.message || 'Authentication failed',
            retry: true
          }
        }
      };
    });

    graph.addNode('search', async (state: GraphStateType) => {
      console.log(chalk.green(`🔍 Searching for: ${state.agentState.searchParams.query}`));

      if (!state.page) throw new Error('Page not initialized');

      const result = await this.scraper.callAction({
        action: 'searchTrademarks',
        page: state.page,
        query: state.agentState.searchParams.query
      });

      const response = JSON.parse(result);

      if (response.success) {
        return {
          agentState: {
            ...state.agentState,
            currentStep: 'extractResults' as const
          },
          messages: [new AIMessage(`Search submitted for: ${state.agentState.searchParams.query}`)]
        };
      }

      return {
        agentState: {
          ...state.agentState,
          currentStep: 'error' as const,
          error: {
            message: response.message || 'Search failed',
            retry: true
          }
        }
      };
    });

    graph.addNode('extractResults', async (state: GraphStateType) => {
      console.log(chalk.cyan('📊 Extracting search results...'));

      if (!state.page) throw new Error('Page not initialized');

      const result = await this.scraper.callAction({
        action: 'extractResults',
        page: state.page
      });

      const response = JSON.parse(result);

      if (response.success && response.results) {
        const searchResults: SearchResults = {
          query: state.agentState.searchParams.query,
          totalResults: response.results.length,
          page: 1,
          results: response.results,
          searchTime: Date.now() - (state.agentState.browserSession?.sessionId.length || 0) * 1000,
          timestamp: new Date()
        };

        return {
          agentState: {
            ...state.agentState,
            currentStep: 'complete' as const,
            searchResults
          },
          messages: [new AIMessage(`Found ${response.results.length} results`)]
        };
      }

      return {
        agentState: {
          ...state.agentState,
          currentStep: 'error' as const,
          error: {
            message: response.message || 'Failed to extract results',
            retry: false
          }
        }
      };
    });

    graph.addNode('complete', async (state: GraphStateType) => {
      console.log(chalk.green('✅ Search completed successfully!'));

      if (state.browser) {
        await state.browser.close();
      }

      return {
        messages: [new AIMessage('Search completed successfully')]
      };
    });

    graph.addNode('error', async (state: GraphStateType) => {
      console.log(chalk.red(`❌ Error: ${state.agentState.error?.message}`));

      if (state.browser) {
        await state.browser.close();
      }

      if (state.agentState.error?.retry && state.agentState.retryCount < 3) {
        return {
          agentState: {
            ...state.agentState,
            currentStep: 'initialize' as const,
            retryCount: state.agentState.retryCount + 1
          }
        };
      }

      return {};
    });

    // Simple linear flow for now
    graph.addEdge('initialize', 'authenticate');
    graph.addEdge('authenticate', 'search');
    graph.addEdge('search', 'extractResults');
    graph.addEdge('extractResults', 'complete');

    return graph.compile({
      checkpointer: this.checkpointer
    });
  }

  async search(params: TrademarkSearchParams): Promise<SearchResults | null> {
    const initialState = {
      messages: [new HumanMessage(`Search for trademark: ${params.query}`)],
      agentState: {
        searchParams: params,
        currentStep: 'initialize' as const,
        retryCount: 0
      }
    };

    const config = {
      configurable: {
        thread_id: `search_${Date.now()}`
      }
    };

    const finalState = await this.graph.invoke(initialState, config);

    if (finalState.agentState.searchResults) {
      return finalState.agentState.searchResults;
    }

    console.log(chalk.red('Search failed:', finalState.agentState.error?.message));
    return null;
  }
}