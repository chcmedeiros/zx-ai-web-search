import { chromium } from 'playwright';
import chalk from 'chalk';
import { TrademarkSearchParams, SearchResults } from '../schemas/trademarkSchema.js';
import { WIPOScraperTool } from '../tools/scraperTool.js';
import { GeminiFormatter } from '../services/geminiFormatter.js';

export class SimpleWIPOAgent {
  private scraper: WIPOScraperTool;
  private formatter: GeminiFormatter;

  constructor() {
    this.scraper = new WIPOScraperTool();
    this.formatter = new GeminiFormatter();
  }

  async search(params: TrademarkSearchParams): Promise<SearchResults | null> {
    let browser;
    try {
      console.log(chalk.blue('🚀 Starting WIPO search...'));

      // Initialize browser
      browser = await chromium.launch({
        headless: process.env.HEADLESS !== 'false',
        args: ['--disable-blink-features=AutomationControlled']
      });

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        viewport: { width: 1920, height: 1080 }
      });

      const page = await context.newPage();

      // Step 1: Handle authentication/captcha
      console.log(chalk.yellow('🔐 Handling authentication...'));
      const authResult = await this.scraper.callAction({
        action: 'handleCaptcha',
        page: page
      });

      const authResponse = JSON.parse(authResult);
      if (!authResponse.success) {
        throw new Error(`Authentication failed: ${authResponse.message}`);
      }

      // Step 2: Submit search
      console.log(chalk.green(`🔍 Searching for: ${params.query}`));
      const searchResult = await this.scraper.callAction({
        action: 'searchTrademarks',
        page: page,
        query: params.query
      });

      const searchResponse = JSON.parse(searchResult);
      if (!searchResponse.success) {
        throw new Error(`Search failed: ${searchResponse.message}`);
      }

      // Step 3: Extract results
      console.log(chalk.cyan('📊 Extracting search results...'));
      const extractResult = await this.scraper.callAction({
        action: 'extractResults',
        page: page
      });

      const extractResponse = JSON.parse(extractResult);
      if (!extractResponse.success || !extractResponse.results) {
        throw new Error(`Result extraction failed: ${extractResponse.message || 'No results found'}`);
      }

      // Step 4: Format results with AI
      console.log(chalk.magenta('🤖 Formatting results with AI...'));
      const formattedResults = await this.formatter.formatResults(extractResponse.results);

      // Step 5: Create final search results
      const searchResults: SearchResults = {
        query: params.query,
        totalResults: formattedResults.length,
        page: 1,
        results: formattedResults.slice(0, params.limit),
        searchTime: Date.now(),
        timestamp: new Date()
      };

      console.log(chalk.green('✅ Search completed successfully!'));
      return searchResults;

    } catch (error) {
      console.error(chalk.red('❌ Search failed:'), error instanceof Error ? error.message : 'Unknown error');
      return null;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}