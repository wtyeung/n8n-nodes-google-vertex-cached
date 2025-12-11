# Release Notes - v0.2.10

## Summary
Fixed token usage logging and added comprehensive cached token tracking for context caching workflows.

## What's Fixed

### Token Usage Logging
- **Issue**: Token consumption was not appearing in n8n logs
- **Root Cause**: Parser was looking for camelCase field names, but Google Vertex AI returns snake_case (`usage_metadata`, `input_tokens`, `output_tokens`)
- **Solution**: Updated parser to check multiple possible field locations with correct naming conventions

### Cached Token Tracking
- **Issue**: When using context caching, cached token counts were not being reported
- **Root Cause**: Cached tokens are in a nested field `usage_metadata.input_token_details.cache_read` that wasn't being checked
- **Solution**: Added support for reading cached token count from the correct location

## What's New

### Console Logging
When using cached content, you'll now see:
```
💰 Token Usage - Prompt: 55182, Completion: 336, Cached: 55176 (90% discount)
```

This shows:
- **Prompt**: Total input tokens (including cached)
- **Completion**: Response tokens
- **Cached**: Tokens served from cache at 90% discount

### Programmatic Access
Cached token data is available in workflow output:
```json
{
  "tokenUsage": {
    "promptTokens": 55182,
    "completionTokens": 336,
    "totalTokens": 55518,
    "cachedTokens": 55176
  },
  "metadata": {
    "cachedTokens": 55176,
    "cacheHit": true,
    "costSavings": "55176 tokens at 90% discount"
  }
}
```

Access in subsequent nodes:
- `{{ $json.tokenUsage.cachedTokens }}`
- `{{ $json.metadata.cachedTokens }}`

## Important Notes

### n8n UI Limitation
The n8n AI Agent tooltip only displays Prompt and Completion tokens. This is an n8n UI limitation, not a node limitation. Cached tokens are:
- ✅ Logged to console
- ✅ Available in workflow output data
- ✅ Accessible via expressions
- ❌ NOT shown in the UI tooltip

### Google Search Grounding + Cache
Google Search grounding cannot be used with cached content (Vertex AI API limitation). If both are enabled:
- Grounding is automatically disabled
- A warning is logged to console
- Cache continues to work normally

## Cost Savings Example

With the example from testing:
- **Without cache**: $0.0562
- **With cache**: $0.0065
- **Savings**: 88%!

The cached token tracking helps you:
- Verify cache effectiveness
- Calculate actual costs
- Monitor cache hit rates
- Optimize cache usage

## Technical Details

### Token Field Locations
The parser checks these locations in order:
1. `result.llmOutput.tokenUsage.*` (Standard LangChain)
2. `result.llmOutput.usage_metadata.*` (Google Vertex AI - snake_case) ✅ Primary
3. `result.llmOutput.usageMetadata.*` (Google Vertex AI - camelCase) 
4. `result.generations[0][0].message.kwargs.usage_metadata.*` (Message-level)

### Cached Token Field
- Location: `usage_metadata.input_token_details.cache_read`
- Type: Integer
- Only present when using cached content
- Represents tokens served from cache at 90% discount

## Upgrade Instructions

1. Update to v0.2.10:
   ```bash
   npm install n8n-nodes-google-vertex-cached@0.2.10
   ```

2. Restart n8n completely

3. Run workflows with cached content

4. Check console logs for cached token information

## Files Changed
- `nodes/VertexAiCached/N8nLlmTracing.ts` - Token usage parser
- `CHANGELOG.md` - Version history
- `README.md` - Documentation updates
- `TOKEN_USAGE_FIX.md` - Technical details
- `CACHED_TOKENS_GUIDE.md` - Usage guide
- `package.json` - Version bump

## Testing
Tested with:
- Google Vertex AI Gemini 2.5 Flash
- Context caching with 55K+ cached tokens
- Google Search grounding (with and without cache)
- n8n AI Agent workflows

All token counts verified against Google Cloud Console billing data.
