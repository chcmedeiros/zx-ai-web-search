# ZX AI Web Search - WIPO Trademark Agent

An AI-powered trademark search agent built with LangGraph and Playwright that searches the WIPO (World Intellectual Property Organization) Global Brand Database without requiring API access.

## Features

- 🤖 **LangGraph Agent Workflow**: Stateful, multi-step agent with automatic retry logic
- 🌐 **Web Scraping**: Automated browser interaction using Playwright
- 🛡️ **CAPTCHA Handling**: Automatic ALTCHA widget verification
- 📊 **Structured Results**: Type-safe data extraction with Zod schemas
- 🎯 **Multiple Search Types**: Brand name, owner, and application number searches
- 🔧 **Configurable**: Environment-based configuration with sensible defaults
- 📝 **CLI Interface**: Easy-to-use command-line interface

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd zx-ai-web-search
```

2. Install dependencies:
```bash
npm install
```

3. Install Playwright browsers:
```bash
npx playwright install
```

4. Copy environment configuration:
```bash
cp .env.example .env
```

## Usage

### Basic Search

Search for a trademark by brand name:
```bash
npm run dev search -q "Nike"
```

### Advanced Search Options

```bash
# Search by owner name
npm run dev search -q "Apple Inc" -t owner

# Search with country filter
npm run dev search -q "Coca Cola" -c US

# Search with Nice classification
npm run dev search -q "Software" -n 42

# Limit results
npm run dev search -q "Microsoft" -l 5

# Run with visible browser (non-headless)
npm run dev search -q "Google" --headless false
```

### Available Commands

- `search`: Search for trademarks
- `config`: Show current configuration
- `test`: Run a test search with sample data

### Command Options

| Option | Description | Default |
|--------|-------------|---------|
| `-q, --query <query>` | Search query (required) | - |
| `-t, --type <type>` | Search type: brand, owner, number | brand |
| `-c, --country <country>` | Country code filter | - |
| `-n, --nice <nice>` | Nice classification filter | - |
| `-l, --limit <limit>` | Maximum number of results | 10 |
| `--headless <boolean>` | Run browser in headless mode | true |

## Project Structure

```
src/
├── agents/
│   └── wipoSearchAgent.ts    # Main LangGraph agent
├── tools/
│   ├── browserTool.ts        # Playwright browser automation
│   └── scraperTool.ts        # WIPO-specific scraping logic
├── schemas/
│   └── trademarkSchema.ts    # Zod schemas for type safety
├── config/
│   └── config.ts             # Configuration management
└── index.ts                  # CLI entry point
```

## Architecture

### LangGraph Workflow

The agent follows a structured workflow:

1. **Initialize**: Set up browser session
2. **Authenticate**: Handle CAPTCHA verification
3. **Search**: Submit search query
4. **Extract Results**: Parse search results
5. **Complete**: Clean up and return data

### Error Handling

- Automatic retry logic for transient failures
- CAPTCHA handling with timeout protection
- Graceful browser cleanup on errors
- Structured error reporting

## Configuration

Configure the application using environment variables:

```bash
# Browser settings
HEADLESS=true
BROWSER_TIMEOUT=30000
VIEWPORT_WIDTH=1920
VIEWPORT_HEIGHT=1080

# Agent settings
RETRY_ATTEMPTS=3
LOG_LEVEL=info
```

## Example Output

```bash
$ npm run dev search -q "Nike"

🔍 ZX AI Web Search - WIPO Trademark Agent
=====================================

Search Parameters:
  Query: Nike
  Type: brand
  Limit: 10

🚀 Initializing browser session...
🔐 Handling authentication...
🔍 Searching for: Nike
📊 Extracting search results...
✅ Search completed successfully!

✅ Search completed successfully!
Found 10 results:

1. NIKE
   Application: 1234567
   Owner: Nike, Inc.
   Country: US
   Status: Registered
   Filing Date: 2020-01-15

2. NIKE AIR
   Application: 2345678
   Owner: Nike, Inc.
   Country: US
   Status: Active
   Filing Date: 2019-05-22

...
```

## Development

### Building

```bash
npm run build
```

### Type Checking

```bash
npm run typecheck
```

### Running in Development Mode

```bash
npm run dev search -q "your-query"
```

## Technical Details

### Dependencies

- **@langchain/langgraph**: Agent workflow orchestration
- **playwright**: Browser automation
- **zod**: Runtime type validation
- **commander**: CLI interface
- **chalk**: Terminal styling
- **dotenv**: Environment configuration

### Browser Automation

The agent uses Playwright with:
- Chromium browser for consistency
- Anti-detection measures
- Configurable headless/headed mode
- Session persistence for multiple searches

### Data Extraction

Search results include:
- Application/Registration numbers
- Trademark names and images
- Owner information
- Status and dates
- Nice classifications
- Country information

## Limitations

- Depends on WIPO website structure (may break if they change their HTML)
- CAPTCHA solving is automated but may occasionally fail
- Rate limiting may apply (built-in delays help mitigate this)
- Some detailed information requires additional page visits

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Disclaimer

This tool is for educational and research purposes. Users should respect WIPO's terms of service and rate limits. The authors are not responsible for any misuse of this tool.