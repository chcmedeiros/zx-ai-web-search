#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as dotenv from 'dotenv';
import { WIPOSearchAgent } from './agents/wipoSearchAgent.js';
import { TrademarkSearchParams, TrademarkSearchParamsSchema } from './schemas/trademarkSchema.js';

dotenv.config();

const program = new Command();

program
  .name('zx-ai-web-search')
  .description('AI-powered trademark search agent using LangGraph and web scraping')
  .version('1.0.0');

program
  .command('search')
  .description('Search for trademarks on WIPO database')
  .requiredOption('-q, --query <query>', 'Search query (trademark name)')
  .option('-t, --type <type>', 'Search type (brand, owner, number)', 'brand')
  .option('-c, --country <country>', 'Country code filter')
  .option('-n, --nice <nice>', 'Nice classification filter')
  .option('-l, --limit <limit>', 'Maximum number of results', '10')
  .option('--headless <headless>', 'Run browser in headless mode', 'true')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🔍 ZX AI Web Search - WIPO Trademark Agent'));
      console.log(chalk.gray('=====================================\n'));

      // Set headless mode
      process.env.HEADLESS = options.headless;

      // Validate and parse search parameters
      const searchParams: TrademarkSearchParams = TrademarkSearchParamsSchema.parse({
        query: options.query,
        searchType: options.type,
        country: options.country,
        nice: options.nice,
        limit: parseInt(options.limit)
      });

      console.log(chalk.cyan('Search Parameters:'));
      console.log(`  Query: ${chalk.white(searchParams.query)}`);
      console.log(`  Type: ${chalk.white(searchParams.searchType)}`);
      if (searchParams.country) console.log(`  Country: ${chalk.white(searchParams.country)}`);
      if (searchParams.nice) console.log(`  Nice Classification: ${chalk.white(searchParams.nice)}`);
      console.log(`  Limit: ${chalk.white(searchParams.limit)}\n`);

      // Initialize and run agent
      const agent = new WIPOSearchAgent();
      const results = await agent.search(searchParams);

      if (results) {
        console.log(chalk.green(`\n✅ Search completed successfully!`));
        console.log(chalk.blue(`Found ${results.totalResults} results:\n`));

        results.results.forEach((result, index) => {
          console.log(chalk.yellow(`${index + 1}. ${result.mark || 'Unknown Mark'}`));
          console.log(`   Application: ${result.applicationNumber || 'N/A'}`);
          console.log(`   Owner: ${result.owner || 'N/A'}`);
          console.log(`   Country: ${result.country || 'N/A'}`);
          console.log(`   Status: ${result.status || 'Unknown'}`);
          console.log(`   Filing Date: ${result.filingDate || 'N/A'}`);
          if (result.imageUrl) console.log(`   Image: ${result.imageUrl}`);
          if (result.detailsUrl) console.log(`   Details: ${result.detailsUrl}`);
          console.log('');
        });

        console.log(chalk.gray(`Search completed in ${results.searchTime}ms`));
        console.log(chalk.gray(`Timestamp: ${results.timestamp}`));
      } else {
        console.log(chalk.red('\n❌ Search failed. Please try again.'));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Show configuration information')
  .action(() => {
    console.log(chalk.blue('🔧 Configuration:'));
    console.log(`  Headless Mode: ${process.env.HEADLESS !== 'false' ? 'enabled' : 'disabled'}`);
    console.log(`  Node Version: ${process.version}`);
    console.log(`  Platform: ${process.platform}`);
  });

program
  .command('test')
  .description('Test the agent with a sample search')
  .action(async () => {
    try {
      console.log(chalk.blue('🧪 Running test search...'));

      const agent = new WIPOSearchAgent();
      const testParams: TrademarkSearchParams = {
        query: 'Nike',
        searchType: 'brand',
        limit: 5
      };

      console.log(chalk.yellow('Testing with query: Nike'));
      const results = await agent.search(testParams);

      if (results && results.results.length > 0) {
        console.log(chalk.green('✅ Test passed! Agent is working correctly.'));
        console.log(`Found ${results.results.length} results for test query.`);
      } else {
        console.log(chalk.yellow('⚠️  Test completed but no results found.'));
      }
    } catch (error) {
      console.error(chalk.red('❌ Test failed:'), error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:'), error);
  process.exit(1);
});

program.parse();