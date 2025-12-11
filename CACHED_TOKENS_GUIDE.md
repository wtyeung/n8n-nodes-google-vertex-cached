# How to View Cached Token Usage

When using context caching with this node, Google Vertex AI returns information about how many tokens were served from cache. However, **n8n's UI tooltip only displays Prompt and Completion tokens** - it doesn't show custom fields like cached tokens.

## Where to Find Cached Token Information

### 1. Console Logs (Easiest)
When you run a workflow with cached content, look at your n8n console output:

```
💰 Token Usage - Prompt: 50, Completion: 100, Cached: 5000 (90% discount)
```

This shows:
- **Prompt**: New input tokens (full price)
- **Completion**: Response tokens (full price)  
- **Cached**: Tokens from cache (90% discount)

### 2. Workflow Output Data
The cached token count is available in the workflow execution data:

```json
{
  "tokenUsage": {
    "promptTokens": 50,
    "completionTokens": 100,
    "totalTokens": 150,
    "cachedTokens": 5000
  },
  "metadata": {
    "cachedTokens": 5000,
    "cacheHit": true,
    "costSavings": "5000 tokens at 90% discount"
  }
}
```

You can access this in subsequent nodes using expressions like:
- `{{ $json.tokenUsage.cachedTokens }}`
- `{{ $json.metadata.cachedTokens }}`

### 3. Why the UI Doesn't Show It
n8n's AI Agent tooltip is hardcoded to display only:
- Prompt tokens
- Completion tokens
- Total tokens

The tooltip doesn't support custom fields. This is a limitation of n8n's UI, not this node.

## Understanding the Numbers

Looking at the example:
- **Total**: 55,518 tokens
- **Prompt**: 55,182 tokens  
- **Completion**: 336 tokens

The math adds up: 55,182 + 336 = 55,518

This means:
- ✅ All tokens are being counted correctly
- ✅ The "Prompt" includes both new prompt tokens AND cached tokens
- ❌ The UI doesn't break down cached vs. new prompt tokens

**To see the breakdown**, check the console logs where you'll see:
```
💰 Token Usage - Prompt: 55182, Completion: 336, Cached: 55176 (90% discount)
```

This shows that of the 55,182 "prompt" tokens:
- 6 are new prompt tokens (full price)
- 55,176 are from cache (90% discount)

### Technical Details
The cached token count is read from `usage_metadata.input_token_details.cache_read` in the Google Vertex AI response.

## Cost Calculation

With cached tokens, your actual cost is much lower:

**Without cache:**
- 55,182 input tokens × $0.001 = $0.0552
- 336 output tokens × $0.003 = $0.0010
- **Total: $0.0562**

**With cache (55,176 cached):**
- 6 new input tokens × $0.001 = $0.000006
- 55,176 cached tokens × $0.0001 = $0.0055 (90% discount)
- 336 output tokens × $0.003 = $0.0010
- **Total: $0.0065** (88% savings!)

## Recommendation

For accurate cost tracking with cached content:
1. Monitor the console logs during development
2. Use a subsequent node to log `{{ $json.tokenUsage }}` to a database
3. Calculate costs based on the breakdown: new prompt + cached + completion tokens
