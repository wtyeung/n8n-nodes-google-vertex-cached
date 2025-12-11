# Token Usage Logging Fix

## Problem
Token consumption was not appearing in n8n logs when using the Google Vertex AI Chat (Cached) node, while other LLM models displayed token usage correctly.

## Root Cause
The `N8nLlmTracing` callback handler was only checking for token usage at `result.llmOutput.tokenUsage`, which is the standard LangChain format. However, Google Vertex AI returns token usage in **snake_case** format using `usage_metadata`:

```json
{
  "llmOutput": {
    "usage_metadata": {
      "input_tokens": 39,
      "output_tokens": 68,
      "total_tokens": 107,
      "input_token_details": {
        "text": 39
      },
      "output_token_details": {
        "text": 10,
        "reasoning": 58
      }
    }
  }
}
```

The key issue was looking for camelCase field names (`usageMetadata`, `candidatesTokenCount`) when Google Vertex AI actually returns snake_case (`usage_metadata`, `input_tokens`, `output_tokens`).

## Solution
Updated the `tokensUsageParser` function in `N8nLlmTracing.ts` to check multiple possible locations with correct field names:

1. **Path 1**: Standard LangChain format
   - `result.llmOutput.tokenUsage.completionTokens`
   - `result.llmOutput.tokenUsage.promptTokens`

2. **Path 2**: Google Vertex AI snake_case format (llmOutput level) ✅ **This is the working path**
   - `result.llmOutput.usage_metadata.output_tokens`
   - `result.llmOutput.usage_metadata.input_tokens`
   - `result.llmOutput.usage_metadata.input_token_details.cache_read` ✅ **Cached tokens**

3. **Path 3**: Google Vertex AI camelCase format (fallback)
   - `result.llmOutput.usageMetadata.candidatesTokenCount` or `output_tokens`
   - `result.llmOutput.usageMetadata.promptTokenCount` or `input_tokens`

4. **Path 4**: Message-level usage metadata (generation level)
   - `result.generations[0][0].message.kwargs.usage_metadata.output_tokens`
   - `result.generations[0][0].message.kwargs.usage_metadata.input_tokens`
   - `result.generations[0][0].message.kwargs.usage_metadata.input_token_details.cache_read` ✅ **Cached tokens**

The parser now tries each path in sequence until it finds valid token counts.

## Token Details
The fix now properly captures:
- **Input tokens** (`promptTokens`): Prompt tokens consumed (excluding cached content)
- **Output tokens** (`completionTokens`): Response tokens generated (including reasoning tokens for thinking models)
- **Total tokens**: Sum of input and output
- **Cached tokens** (`cachedTokens`): Tokens served from cache when using context caching (only present when using cached content)
- **Token breakdown**: Text vs reasoning tokens (for models like Gemini 2.0 Flash Thinking)

### Understanding Cached Tokens
When using context caching, the response includes `cachedTokens` which shows:
- How many tokens were served from the cache (at ~90% discount)
- The effectiveness of your cache (higher = better cost savings)
- These tokens are NOT included in `promptTokens` (they're separate)

**Example with cache:**
```json
{
  "promptTokens": 50,        // New prompt tokens (full price)
  "completionTokens": 100,   // Response tokens (full price)
  "cachedTokens": 5000,      // Cached context tokens (90% discount)
  "totalTokens": 150         // promptTokens + completionTokens only
}
```

**Important Note about n8n UI Display:**
- n8n's tooltip only shows `Prompt` and `Completion` tokens
- Cached tokens are NOT displayed in the UI tooltip (this is an n8n limitation)
- However, cached tokens ARE:
  - ✅ Logged to console: `💰 Token Usage - Prompt: 50, Completion: 100, Cached: 5000 (90% discount)`
  - ✅ Available in the workflow output data under `metadata.cachedTokens`
  - ✅ Included in the `tokenUsage` object with `cachedTokens` field

To see cached token counts, check your n8n console logs when running workflows with cached content.

## Testing
To test the fix:

1. Restart n8n with the updated node (v0.2.10)
2. Create a workflow with an AI Agent using this node
3. Execute the workflow
4. Check the AI Agent logs - token usage should now be visible

## Files Changed
- `nodes/VertexAiCached/N8nLlmTracing.ts` - Updated token usage parser with correct snake_case field names
- `CHANGELOG.md` - Documented the fix
- `package.json` - Bumped version to 0.2.10
