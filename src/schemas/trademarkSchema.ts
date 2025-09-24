import { z } from 'zod';

export const TrademarkStatusSchema = z.enum([
  'Active',
  'Registered',
  'Pending',
  'Expired',
  'Cancelled',
  'Unknown'
]);

export const TrademarkSearchParamsSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  searchType: z.enum(['brand', 'owner', 'number']).default('brand'),
  country: z.string().optional(),
  nice: z.string().optional(),
  status: TrademarkStatusSchema.optional(),
  limit: z.number().min(1).max(100).default(10)
});

export const TrademarkResultSchema = z.object({
  applicationNumber: z.string(),
  registrationNumber: z.string().optional(),
  mark: z.string(),
  owner: z.string(),
  country: z.string(),
  filingDate: z.string(),
  registrationDate: z.string().optional(),
  expiryDate: z.string().optional(),
  status: TrademarkStatusSchema,
  niceClasses: z.array(z.number()),
  goodsServices: z.string().optional(),
  imageUrl: z.string().url().optional(),
  detailsUrl: z.string().url().optional()
});

export const SearchResultsSchema = z.object({
  query: z.string(),
  totalResults: z.number(),
  page: z.number(),
  results: z.array(TrademarkResultSchema),
  searchTime: z.number(),
  timestamp: z.date()
});

export const AgentStateSchema = z.object({
  searchParams: TrademarkSearchParamsSchema,
  searchResults: SearchResultsSchema.optional(),
  browserSession: z.object({
    sessionId: z.string(),
    isAuthenticated: z.boolean(),
    cookies: z.array(z.object({
      name: z.string(),
      value: z.string(),
      domain: z.string()
    })).optional()
  }).optional(),
  currentStep: z.enum([
    'initialize',
    'authenticate',
    'search',
    'extractResults',
    'parseData',
    'complete',
    'error'
  ]),
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
    retry: z.boolean().default(false)
  }).optional(),
  retryCount: z.number().default(0)
});

export type TrademarkStatus = z.infer<typeof TrademarkStatusSchema>;
export type TrademarkSearchParams = z.infer<typeof TrademarkSearchParamsSchema>;
export type TrademarkResult = z.infer<typeof TrademarkResultSchema>;
export type SearchResults = z.infer<typeof SearchResultsSchema>;
export type AgentState = z.infer<typeof AgentStateSchema>;