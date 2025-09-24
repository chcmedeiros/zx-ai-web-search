import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { Tool } from '@langchain/core/tools';
import { z } from 'zod';

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  sessionId: string;
}

const BrowserInputSchema = z
  .object({
    input: z.string().optional()
  })
  .transform((data) => data.input);

const BrowserActionSchema = z.object({
  action: z.enum(['navigate', 'click', 'fill', 'wait', 'screenshot', 'extract']),
  selector: z.string().optional(),
  value: z.string().optional(),
  url: z.string().optional(),
  timeout: z.number().default(30000)
});

export class BrowserTool extends Tool {
  name = 'browser';
  description = 'Interact with web pages using Playwright browser automation';

  private session: BrowserSession | null = null;
  schema = BrowserInputSchema;

  async _call(_inputStr: string): Promise<string> {
    return 'Use callAction method instead';
  }

  async callAction(input: z.infer<typeof BrowserActionSchema>): Promise<string> {
    try {
      if (!this.session) {
        await this.initializeSession();
      }

      const { action, selector, value, url, timeout } = input;
      const page = this.session!.page;

      switch (action) {
        case 'navigate':
          if (!url) throw new Error('URL is required for navigate action');
          await page.goto(url, { waitUntil: 'networkidle', timeout });
          return `Navigated to ${url}`;

        case 'click':
          if (!selector) throw new Error('Selector is required for click action');
          await page.click(selector, { timeout });
          return `Clicked on ${selector}`;

        case 'fill':
          if (!selector || !value) throw new Error('Selector and value are required for fill action');
          await page.fill(selector, value, { timeout });
          return `Filled ${selector} with value`;

        case 'wait':
          if (selector) {
            await page.waitForSelector(selector, { timeout });
            return `Element ${selector} is visible`;
          } else if (value) {
            await page.waitForTimeout(parseInt(value));
            return `Waited for ${value}ms`;
          }
          throw new Error('Either selector or value (timeout) is required for wait action');

        case 'screenshot':
          const screenshot = await page.screenshot({ fullPage: true });
          return `Screenshot taken (${screenshot.length} bytes)`;

        case 'extract':
          if (!selector) throw new Error('Selector is required for extract action');
          const elements = await page.$$(selector);
          const texts = await Promise.all(elements.map(el => el.textContent()));
          return JSON.stringify(texts.filter(Boolean));

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async initializeSession(): Promise<void> {
    const browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    this.session = {
      browser,
      context,
      page,
      sessionId: Math.random().toString(36).substring(7)
    };
  }

  async cleanup(): Promise<void> {
    if (this.session) {
      await this.session.browser.close();
      this.session = null;
    }
  }
}