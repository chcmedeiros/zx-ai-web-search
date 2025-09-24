import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const ConfigSchema = z.object({
  HEADLESS: z.string().default('true'),
  BROWSER_TIMEOUT: z.string().default('30000'),
  RETRY_ATTEMPTS: z.string().default('3'),
  USER_AGENT: z.string().default('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
  VIEWPORT_WIDTH: z.string().default('1920'),
  VIEWPORT_HEIGHT: z.string().default('1080'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info')
});

const rawConfig = {
  HEADLESS: process.env.HEADLESS || 'true',
  BROWSER_TIMEOUT: process.env.BROWSER_TIMEOUT || '30000',
  RETRY_ATTEMPTS: process.env.RETRY_ATTEMPTS || '3',
  USER_AGENT: process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  VIEWPORT_WIDTH: process.env.VIEWPORT_WIDTH || '1920',
  VIEWPORT_HEIGHT: process.env.VIEWPORT_HEIGHT || '1080',
  LOG_LEVEL: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info'
};

const validatedConfig = ConfigSchema.parse(rawConfig);

export const config = {
  browser: {
    headless: validatedConfig.HEADLESS === 'true',
    timeout: parseInt(validatedConfig.BROWSER_TIMEOUT),
    userAgent: validatedConfig.USER_AGENT,
    viewport: {
      width: parseInt(validatedConfig.VIEWPORT_WIDTH),
      height: parseInt(validatedConfig.VIEWPORT_HEIGHT)
    }
  },
  agent: {
    retryAttempts: parseInt(validatedConfig.RETRY_ATTEMPTS),
    logLevel: validatedConfig.LOG_LEVEL
  },
  wipo: {
    baseUrl: 'https://branddb.wipo.int/branddb/en/',
    searchEndpoint: '/search',
    detailsEndpoint: '/details'
  }
};

export type Config = typeof config;