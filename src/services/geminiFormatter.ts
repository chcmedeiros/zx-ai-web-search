import { GoogleGenerativeAI } from '@google/generative-ai';
import { TrademarkResult } from '../schemas/trademarkSchema.js';

export class GeminiFormatter {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY || '';
    if (!apiKey) {
      console.warn('No Gemini API key found, using fallback formatting');
      this.genAI = new GoogleGenerativeAI('');
      this.model = null;
    } else {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    }
  }

  async formatResults(rawResults: any[]): Promise<TrademarkResult[]> {
    if (!this.model) {
      return this.fallbackFormat(rawResults);
    }

    try {
      const formattedResults: TrademarkResult[] = [];

      for (const rawResult of rawResults) {
        const formatted = await this.formatSingleResult(rawResult);
        if (formatted) {
          formattedResults.push(formatted);
        }
      }

      return formattedResults;
    } catch (error) {
      console.error('Gemini formatting failed, using fallback:', error);
      return this.fallbackFormat(rawResults);
    }
  }

  private async formatSingleResult(rawResult: any): Promise<TrademarkResult | null> {
    try {
      // If the result is already well-structured, just clean it up
      if (rawResult.owner && rawResult.applicationNumber && rawResult.country) {
        return this.cleanResult(rawResult);
      }

      // If mark field contains concatenated text, use AI to parse it
      if (rawResult.mark && rawResult.mark.length > 50) {
        const prompt = `
Parse this trademark data into structured fields. Extract the following information:
- Brand name/mark (just the trademark name, e.g., "NIKE")
- Owner (company name and country)
- Application/Registration number
- Nice classes (comma-separated numbers)
- Country of filing
- Status (Registered/Pending/etc)
- Registration date

Raw data: "${rawResult.mark}"

Return as JSON with fields: mark, owner, applicationNumber, niceClasses, country, status, registrationDate
`;

        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Parse AI response
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return this.mapToTrademarkResult(parsed);
          }
        } catch (e) {
          console.error('Failed to parse AI response:', e);
        }
      }

      return this.cleanResult(rawResult);
    } catch (error) {
      console.error('Error formatting single result:', error);
      return this.cleanResult(rawResult);
    }
  }

  private cleanResult(rawResult: any): TrademarkResult {
    // Clean up the mark field if it contains concatenated text
    let mark = rawResult.mark || '';
    if (mark.includes('Owner')) {
      mark = mark.split('Owner')[0].trim();
    }

    // Extract owner from concatenated text if needed
    let owner = rawResult.owner || '';
    if (!owner && rawResult.mark && rawResult.mark.includes('Owner')) {
      const ownerMatch = rawResult.mark.match(/Owner([^N]*)(Nice|$)/);
      if (ownerMatch) {
        owner = ownerMatch[1].trim();
      }
    }

    // Extract application number
    let applicationNumber = rawResult.applicationNumber || '';
    if (!applicationNumber && rawResult.mark && rawResult.mark.includes('Number')) {
      const numberMatch = rawResult.mark.match(/Number(\d+)/);
      if (numberMatch) {
        applicationNumber = numberMatch[1];
      }
    }

    // Extract country
    let country = rawResult.country || '';
    if (!country && rawResult.mark) {
      if (rawResult.mark.includes('Qatar')) country = 'Qatar';
      else if (rawResult.mark.includes('Egypt')) country = 'Egypt';
      else if (rawResult.mark.includes('USA')) country = 'USA';
    }

    // Extract status
    let status = rawResult.status || 'Unknown';
    if (status === 'Unknown' && rawResult.mark && rawResult.mark.includes('Registered')) {
      status = 'Registered';
    }

    // Extract nice classes
    let niceClasses = rawResult.niceClasses || [];
    if (!niceClasses.length && rawResult.mark && rawResult.mark.includes('Nice class')) {
      const niceMatch = rawResult.mark.match(/Nice class\s*([\d,\s]+)/);
      if (niceMatch) {
        niceClasses = niceMatch[1].split(',').map((n: string) => parseInt(n.trim())).filter((n: number) => !isNaN(n));
      }
    }

    return {
      applicationNumber: applicationNumber || rawResult.applicationNumber || '',
      registrationNumber: rawResult.registrationNumber,
      mark: mark || 'Unknown',
      owner: owner || rawResult.owner || '',
      country: country || rawResult.country || '',
      filingDate: rawResult.filingDate || rawResult.registrationDate || '',
      registrationDate: rawResult.registrationDate,
      expiryDate: rawResult.expiryDate,
      status: status as any,
      niceClasses: niceClasses,
      goodsServices: rawResult.goodsServices,
      imageUrl: rawResult.imageUrl,
      detailsUrl: rawResult.detailsUrl
    };
  }

  private mapToTrademarkResult(parsed: any): TrademarkResult {
    return {
      applicationNumber: parsed.applicationNumber || parsed.number || '',
      registrationNumber: parsed.registrationNumber,
      mark: parsed.mark || parsed.brand || '',
      owner: parsed.owner || '',
      country: parsed.country || parsed.countryOfFiling || '',
      filingDate: parsed.filingDate || parsed.registrationDate || '',
      registrationDate: parsed.registrationDate,
      expiryDate: parsed.expiryDate,
      status: parsed.status || 'Unknown',
      niceClasses: Array.isArray(parsed.niceClasses)
        ? parsed.niceClasses
        : typeof parsed.niceClasses === 'string'
          ? parsed.niceClasses.split(',').map((n: string) => parseInt(n.trim())).filter((n: number) => !isNaN(n))
          : [],
      goodsServices: parsed.goodsServices,
      imageUrl: parsed.imageUrl,
      detailsUrl: parsed.detailsUrl
    };
  }

  private fallbackFormat(rawResults: any[]): TrademarkResult[] {
    return rawResults.map(r => this.cleanResult(r));
  }
}