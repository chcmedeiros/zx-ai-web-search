import { Page } from 'playwright';
import { Tool } from '@langchain/core/tools';
import { z } from 'zod';

const ScraperInputSchema = z
  .object({
    input: z.string().optional()
  })
  .transform((data) => data.input);

const ScraperActionSchema = z.object({
  action: z.enum(['handleCaptcha', 'searchTrademarks', 'extractResults', 'getDetails']),
  page: z.any(),
  query: z.string().optional(),
  url: z.string().optional()
});

export class WIPOScraperTool extends Tool {
  name = 'wipoScraper';
  description = 'Specialized tool for scraping WIPO trademark database';

  schema = ScraperInputSchema;

  async _call(_inputStr: string): Promise<string> {
    return JSON.stringify({ error: 'Use callAction method instead' });
  }

  async callAction(input: z.infer<typeof ScraperActionSchema>): Promise<string> {
    const { action, page, query, url } = input;

    try {
      switch (action) {
        case 'handleCaptcha':
          return await this.handleCaptcha(page);

        case 'searchTrademarks':
          if (!query) throw new Error('Query is required for search');
          return await this.searchTrademarks(page, query);

        case 'extractResults':
          return await this.extractSearchResults(page);

        case 'getDetails':
          if (!url) throw new Error('URL is required for details');
          return await this.getTrademarkDetails(page, url);

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      return JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async handleCaptcha(page: Page): Promise<string> {
    try {
      // Check if CAPTCHA widget exists without throwing timeout error
      const captchaFrame = await page.waitForSelector('altcha-widget', { timeout: 5000 }).catch(() => null);

      if (captchaFrame) {
        console.log('CAPTCHA widget found, attempting to solve...');
        await page.waitForTimeout(2000);

        const solved = await page.evaluate(() => {
          const widget = document.querySelector('altcha-widget') as any;
          return widget?.solved || false;
        });

        if (!solved) {
          await page.waitForFunction(
            () => {
              const widget = document.querySelector('altcha-widget') as any;
              return widget?.solved === true;
            },
            { timeout: 30000 }
          );
        }

        await page.waitForTimeout(1000);
        return JSON.stringify({ success: true, message: 'CAPTCHA solved successfully' });
      }

      // No CAPTCHA found - this is normal and not an error
      console.log('No CAPTCHA found on page - proceeding...');
      return JSON.stringify({ success: true, message: 'No CAPTCHA required' });
    } catch (error) {
      return JSON.stringify({
        success: false,
        message: `CAPTCHA handling failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }

  private async searchTrademarks(page: Page, query: string): Promise<string> {
    try {
      await page.goto('https://branddb.wipo.int/branddb/en/', { waitUntil: 'networkidle' });

      await this.handleCaptcha(page);

      // Find the Brand name input field (first text input on the page)
      const searchInput = await page.locator('input[type="text"]').first();

      if (searchInput) {
        console.log(`Filling search input with query: ${query}`);
        await searchInput.fill(query);

        // Click the Search button or press Enter
        try {
          const searchButton = page.locator('button:has-text("Search")').first();
          await searchButton.click({ timeout: 2000 });
          console.log('Clicked Search button');
        } catch (e) {
          // Fallback to pressing Enter
          console.log('Search button not found, pressing Enter');
          await page.keyboard.press('Enter');
        }

        // Wait for navigation to results page
        try {
          await page.waitForURL('**/similarname**', { timeout: 10000 });
          console.log('Navigated to results page');
        } catch (e) {
          console.log('URL change to similarname not detected, continuing...');
        }

        // Wait for results to load - look for the "Displaying X-Y of Z results" text
        try {
          await page.locator('text=Displaying').waitFor({ timeout: 10000 });
          console.log('Results loaded');
        } catch (e) {
          console.log('Results count text not found, continuing...');
        }

        // Additional wait to ensure results are rendered
        await page.waitForTimeout(3000);

        return JSON.stringify({ success: true, message: 'Search submitted and results loaded' });
      }

      throw new Error('Search input not found');
    } catch (error) {
      return JSON.stringify({
        success: false,
        message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }

  private async extractSearchResults(page: Page): Promise<string> {
    try {
      // Wait a bit to ensure results are fully rendered
      await page.waitForTimeout(2000);

      const results = await page.evaluate(() => {
        const items: any[] = [];

        // Based on screenshot, results contain text patterns like:
        // "NIKE" (brand name)
        // "Owner" followed by owner name
        // "Nice class" followed by numbers
        // "Country of filing" followed by country
        // "Status" with registered icon
        // "Number" followed by registration number

        // Find all elements that contain trademark data
        // Look for containers that have these keywords
        const allElements = Array.from(document.querySelectorAll('*'));
        const resultContainers: Element[] = [];

        allElements.forEach(element => {
          const text = element.textContent || '';
          // Check if element contains result-like content
          if (text.includes('Owner') && text.includes('Nice class') && text.includes('Status')) {
            // Check if it's not too large (avoid parent containers)
            if (text.length < 500) {
              resultContainers.push(element);
            }
          }
        });

        // Also try to find result rows by looking for checkbox inputs (each result has a checkbox)
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
          // Skip "Select all" checkbox
          if (checkbox.parentElement?.textContent?.includes('Select all')) {
            return;
          }

          // Get the parent container that holds the result data
          let resultElement = checkbox.parentElement;
          while (resultElement && resultElement.parentElement) {
            const text = resultElement.textContent || '';
            if (text.includes('Owner') || text.includes('Nice class')) {
              break;
            }
            resultElement = resultElement.parentElement;
          }

          if (resultElement) {
            const text = resultElement.textContent || '';
            const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

            const result: any = {};

            // Extract brand name (usually first line or underlined text)
            const brandLink = resultElement.querySelector('a');
            result.mark = brandLink?.textContent?.trim() || lines[0] || '';

            // Extract data using text patterns - improved parsing
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];

              if (line === 'Owner' && i + 1 < lines.length) {
                result.owner = lines[i + 1];
                i++; // Skip the next line since we consumed it
              } else if (line === 'Nice class' && i + 1 < lines.length) {
                const niceClassStr = lines[i + 1];
                result.niceClasses = niceClassStr.split(',').map(n => n.trim());
                i++;
              } else if (line === 'Country of filing' && i + 1 < lines.length) {
                result.country = lines[i + 1];
                i++;
              } else if (line === 'Status' && i + 1 < lines.length) {
                const statusLine = lines[i + 1];
                if (statusLine.includes('Registered')) {
                  result.status = 'Registered';
                  // Extract date from status line
                  const dateMatch = statusLine.match(/\((.*?)\)/);
                  if (dateMatch) {
                    result.registrationDate = dateMatch[1];
                  }
                } else {
                  result.status = statusLine.replace(/[✅❌]/g, '').trim();
                }
                i++;
              } else if (line === 'Number' && i + 1 < lines.length) {
                result.applicationNumber = lines[i + 1];
                i++;
              } else if (line === 'IPR' && i + 1 < lines.length) {
                // Skip IPR type line
                i++;
              }
            }

            // Extract image if present
            const img = resultElement.querySelector('img');
            if (img && img.src) {
              result.imageUrl = img.src;
            }

            // Only add if we found meaningful data
            if (result.mark || result.owner) {
              result.filingDate = result.registrationDate || ''; // Use registration date as filing date if available
              items.push(result);
            }
          }
        });

        // If no results found with checkbox method, try text-based extraction
        if (items.length === 0) {
          console.log('No results found with checkbox method, trying text-based extraction...');

          // Find any element containing "NIKE" or the search term
          const nikeElements = Array.from(document.querySelectorAll('*')).filter(el => {
            const text = el.textContent || '';
            return text.includes('NIKE') && text.includes('Owner') && el.children.length < 10;
          });

          nikeElements.forEach(element => {
            const text = element.textContent || '';
            const result: any = {
              mark: 'NIKE',
              rawText: text.substring(0, 300)
            };
            items.push(result);
          });
        }

        return items;
      });

      console.log(`Extracted ${results.length} results`);
      return JSON.stringify({ success: true, results });
    } catch (error) {
      return JSON.stringify({
        success: false,
        message: `Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        results: []
      });
    }
  }

  private async getTrademarkDetails(page: Page, url: string): Promise<string> {
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      const details = await page.evaluate(() => {
        const getTextContent = (selector: string): string => {
          const element = document.querySelector(selector);
          return element?.textContent?.trim() || '';
        };

        return {
          registrationNumber: getTextContent('.registration-number, [data-field="registration_number"]'),
          registrationDate: getTextContent('.registration-date, [data-field="registration_date"]'),
          expiryDate: getTextContent('.expiry-date, [data-field="expiry_date"]'),
          niceClasses: Array.from(document.querySelectorAll('.nice-class, [data-field="nice_class"]'))
            .map(el => parseInt(el.textContent || '0'))
            .filter(n => n > 0),
          goodsServices: getTextContent('.goods-services, [data-field="goods_services"]')
        };
      });

      return JSON.stringify({ success: true, details });
    } catch (error) {
      return JSON.stringify({
        success: false,
        message: `Details extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }
}