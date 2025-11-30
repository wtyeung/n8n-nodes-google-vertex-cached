# Implementation Notes

## Project Structure

```
n8n-nodes-google-vertex-cached/
├── nodes/
│   └── VertexAiCached/
│       ├── VertexAiCached.node.ts    # Main node implementation
│       └── vertexai.svg               # Node icon
├── dist/                              # Built files (generated)
├── package.json                       # Dependencies and n8n metadata
├── tsconfig.json                      # TypeScript configuration
└── README.md                          # Documentation
```

## Key Implementation Details

### 1. AI Agent Compatibility

The node is configured as an **AI Language Model** sub-node:

```typescript
inputs: [],
outputs: [NodeConnectionTypes.AiLanguageModel],
```

This allows it to be used within n8n's AI Agent workflows.

### 2. Credential Reuse

Uses n8n's existing `googleVertexAiOAuth2Api` credential instead of creating a new one:

```typescript
credentials: [
  {
    name: 'googleVertexAiOAuth2Api',
    required: true,
  },
],
```

### 3. The "Bind Fix" Pattern

**Critical for n8n Agent compatibility**: When using cached content, the node applies a special pattern to restore the `bindTools` method:

```typescript
// Step 1: Bind cache to model
const boundModel = model.bind({ cachedContent: cachedContentName } as any);

// Step 2: Manually restore bindTools method
boundModel.bindTools = function (tools: any, options?: any) {
  const modelWithTools = model.bindTools(tools, options);
  return modelWithTools.bind({ cachedContent: cachedContentName } as any);
};

// Step 3: Restore metadata
boundModel.lc_namespace = model.lc_namespace;
```

This is necessary because LangChain's `.bind()` method returns a `RunnableBinding` that strips the `bindTools` method, which n8n's AI Agent requires for tool calling.

### 4. Cache-Aware Configuration

When a cached content name is provided:
- Generation parameters (temperature, topK, topP, maxOutputTokens) are **not** passed to the model
- These settings are inherited from the cached content itself
- Attempting to override them would cause API errors

### 5. TypeScript Workarounds

The `cachedContent` parameter is valid at runtime but not in LangChain's type definitions, so we use `as any` casting:

```typescript
model.bind({ cachedContent: cachedContentName } as any)
```

## Testing the Node

### In n8n

1. Install the node in your n8n instance:
   ```bash
   npm install /path/to/n8n-nodes-google-vertex-cached
   ```

2. Restart n8n

3. Create a workflow with an **AI Agent** node

4. Under **Language Model**, select **Google Vertex AI Chat (Cached)**

5. Configure credentials and test with/without cached content

### Build Commands

- `npm run build` - Build the node
- `npm run dev` - Development mode with watch
- `npm run lint` - Lint the code
- `npm run lint:fix` - Auto-fix linting issues

## Dependencies

- **@langchain/google-vertexai**: ^0.0.18 - Google Vertex AI integration for LangChain
- **langchain**: ^0.1.0 - LangChain core library
- **n8n-workflow**: * (peer) - n8n workflow types
- **n8n-core**: * (peer) - n8n core functionality

## Known Limitations

1. Context caching must be set up separately in Google Cloud Console or via API
2. Cached content has expiration times that must be managed externally
3. When using cache, generation parameters cannot be overridden (by design)

## Future Enhancements

Potential improvements:
- Add cache creation/management directly in the node
- Display cache metadata (expiration, token count, etc.)
- Support for multiple cache configurations
- Automatic cache refresh before expiration
