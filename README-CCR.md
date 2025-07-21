# GCR-Gemini: Third-Party Provider Proxy for Gemini CLI

A clean proxy system that routes Gemini CLI requests to third-party AI providers without modifying the official code.

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install -g @google/gemini-cli
   cd proxy-service && npm install
   ```

2. **Setup**
   ```bash
   ./setup-proxy.sh
   ```

3. **Usage**
   ```bash
   ./gcr-gemini -p "Hello, world!"
   GCR_DEBUG=true ./gcr-gemini -p "Test message"
   ```

## How It Works

```
User Input → gcr-gemini → Proxy Service → Third-Party API → Response
```

1. `gcr-gemini` starts the proxy service and sets environment variables
2. Official gemini-cli is called with redirected API endpoints
3. Proxy service translates between API formats and forwards requests
4. Responses are translated back and returned to user

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GCR_PROVIDER` | `shuaihong` | Target provider (shuaihong, deepseek, openai, claude) |
| `GCR_API_KEY` | (required) | API key for target provider |
| `GCR_MODEL` | `gpt-4o` | Model to use |
| `GCR_DEBUG` | `false` | Enable debug logging |

## Files

- `gcr-gemini` - Main wrapper script
- `proxy-service/` - Proxy server with API translation
- `setup-proxy.sh` - Installation script
- `test-proxy.js` - Testing utility

## Testing

```bash
node test-proxy.js                           # Test proxy service
./gcr-gemini -p "Hello"                      # Test complete workflow
GCR_DEBUG=true ./gcr-gemini --help           # Debug mode
```

---

**Author**: Jason Zhang  
**License**: MIT