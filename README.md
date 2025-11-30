# n8n-nodes-google-vertex-cached

This is an n8n community node that provides **Google Vertex AI Chat with Context Caching** support for n8n workflows.

Google Vertex AI is Google Cloud's unified AI platform that provides access to powerful language models like Gemini. This node implements native support for **Context Caching**, which allows you to cache large contexts (like documents, codebases, or conversation history) and reuse them across multiple API calls, significantly reducing costs and latency.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation) | [Operations](#operations) | [Credentials](#credentials) | [Usage](#usage) | [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

### Manual Installation

```bash
npm install n8n-nodes-google-vertex-cached
```

## Development

### Prerequisites

- Node.js (>= 18)
- npm
- n8n installed globally or locally for testing

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/wtyeung/n8n-nodes-google-vertex-cached.git
   cd n8n-nodes-google-vertex-cached
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the node:
   ```bash
   npm run build
   ```

### Testing Locally

To test this node in your local n8n instance:

1. Link the package:
   ```bash
   npm link
   ```
2. Go to your n8n nodes directory (usually `~/.n8n/custom`) and link it:
   ```bash
   npm link n8n-nodes-google-vertex-cached
   ```
   *Alternatively, use the built-in dev server:*
   ```bash
   npm run dev
   ```

## Operations

This node provides a **Chat Model** that can be used as a sub-node in n8n's AI Agent workflows:

- **Chat Completion**: Generate responses using Google's Gemini models
- **Context Caching**: Reuse cached contexts to reduce API costs and improve response times
- **Tool Binding**: Full support for n8n AI Agent tool calling

## Credentials

This node uses n8n's built-in **Google Service Account** credential (`googleApi`). This is the same credential used by the standard Google Vertex AI Chat Model node.

### Prerequisites

1. A Google Cloud Platform account
2. Vertex AI API enabled in your GCP project
3. Service account with Vertex AI permissions (e.g. `Vertex AI User`)

### Setup

1. In n8n, go to **Credentials** → **New**
2. Search for **"Google Service Account"**
3. Provide:
   - **Service Account Email**: Your service account email
   - **Private Key**: Your service account private key (from JSON key file)
   - **Project ID**: Your GCP project ID (optional, can be auto-detected)

## Usage

### Basic Chat (No Cache)

1. Add an **AI Agent** node to your workflow
2. Under **Language Model**, select **Google Vertex AI Chat (Cached)**
3. Configure:
   - **Model**: `gemini-1.5-flash-001` (or other Gemini model)
   - **Temperature**: Control randomness (0-2)
   - Leave **Cached Content Name** empty

### Using Context Caching

1. First, create a cached content resource in Vertex AI (via API or Console)
2. Copy the full resource name (format: `projects/{project}/locations/{location}/cachedContents/{cache-id}`)
3. In the node configuration:
   - **Cached Content Name**: Paste the full resource name
   - **Temperature/TopK**: These are ignored when using cache (settings come from the cache itself)

### Important Notes

- When using a cache, generation parameters (temperature, topK, topP, maxOutputTokens) are inherited from the cached content and cannot be overridden
- The node automatically handles the "bind fix" to ensure compatibility with n8n's AI Agent tool calling
- Cached content has an expiration time - check your cache status in GCP Console

## Technical Deep Dive: How Cache + Tools Work Together

This node solves a tricky technical challenge: **using Context Caching while maintaining full n8n AI Agent tool support**. Here's how it works:

### The Problem

In LangChain, non-standard parameters like `cachedContent` must be passed via `.bind()`:

```javascript
model.bind({ cachedContent: 'projects/.../cachedContents/...' })
```

However, `.bind()` creates a generic `RunnableBinding` wrapper that **strips away specialized methods**:
- ❌ Lost: `bindTools` (required by n8n AI Agent)
- ❌ Lost: `withStructuredOutput`
- ❌ Lost: Model-specific identity

When n8n's AI Agent checks for tool support, it fails because the wrapper doesn't have `bindTools`.

### The Solution: Smart Wrapper Pattern

This node uses a **hybrid approach** that satisfies both LangChain's API and n8n's requirements:

#### Step 1: Create the Cache Wrapper using RunnableBinding
We use `RunnableBinding` directly instead of `.bind()` to avoid method existence issues and version compatibility problems.

```javascript
const boundModel = new RunnableBinding({
  bound: model,
  kwargs: { cachedContent: cacheId },
  config: {}
});
```
✅ Cache works  
❌ Tools broken

#### Step 2: Restore `bindTools` Method
We manually restore `bindTools` and use a **Flattened Binding** strategy to merge tool arguments with cache arguments. This prevents nesting issues that cause message propagation failures.

```javascript
boundModel.bindTools = function(tools, options) {
  // 1. Delegate tool formatting to the original model
  const modelWithTools = model.bindTools(tools, options);
  
  // 2. Extract the underlying model and kwargs
  const bound = modelWithTools.bound || modelWithTools;
  const toolKwargs = modelWithTools.kwargs || {};
  
  // 3. Merge tool arguments with cache ID
  const combinedKwargs = {
    ...toolKwargs,
    cachedContent: cacheId
  };

  // 4. Create a single, flat RunnableBinding
  return new RunnableBinding({
    bound: bound,
    kwargs: combinedKwargs,
    config: modelWithTools.config || {}
  });
};
```
✅ Cache works  
✅ Tools work

#### Step 3: Restore Other Methods
```javascript
boundModel.lc_namespace = model.lc_namespace;
boundModel.withStructuredOutput = model.withStructuredOutput?.bind(model);
```

### The Object Chain

When the AI Agent runs, the request flows through multiple layers:

```
┌─────────────────────────────────────┐
│ 1. n8n AI Agent                     │
│    Calls: boundModel.bindTools()    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│ 2. Restored bindTools Method        │
│    Formats tools for Gemini         │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│ 3. Cache Binding Layer              │
│    Injects cachedContent parameter  │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│ 4. ChatVertexAI Core                │
│    Sends request to Vertex AI       │
└─────────────────────────────────────┘
```

### Why This Works

**Previous approaches failed:**
- **Monkey Patching**: Tried to hack internal methods (`_generate`, `invoke`), but n8n calls different methods at different times
- **Subclassing**: Created inheritance issues with LangChain's type system

**This solution succeeds:**
- ✅ Uses official LangChain `.bind()` API for cache injection
- ✅ Manually restores required methods to satisfy n8n's checks
- ✅ Maintains full compatibility with both systems
- ✅ No internal method hacking required

### Benefits

1. **Cost Reduction**: Cache large contexts once, reuse across multiple calls
2. **Lower Latency**: Cached content doesn't need to be reprocessed
3. **Full Agent Support**: Works seamlessly with n8n's AI Agent tools
4. **Future-Proof**: Uses official APIs, not internal hacks

## Compatibility

- **Minimum n8n version**: 1.0.0
- **Tested with**: n8n 1.x
- **LangChain version**: ^0.3.0
- **@langchain/google-vertexai**: ^0.2.18
- **@langchain/core**: ^0.3.68

## Known Limitations

### Tools + Context Caching
Due to current Vertex AI API restrictions, **you cannot use dynamic tools (n8n AI Agent Tools) alongside a Context Cache**.
The API returns an error: `"Tool config, tools and system instruction should not be set in the request when using cached content."`

If you need to use tools with cached content, the tools must be defined **at the time of cache creation**, which is not currently supported by this node's dynamic tool binding.

**Workaround:** Use the node for Chat (RAG/QA) with Cache, but handle Tool Calling in a separate non-cached step or agent if needed.

### Recommended Architecture: Agent as a Tool

To use **both** Context Caching and Dynamic Tools (like Calculator, Web Search, etc.) in the same workflow, use the **"Agent as a Tool"** pattern:

1.  **Main AI Agent**:
    - Connect your dynamic tools here (e.g., "Date & Time").
    - Use a standard Chat Model (non-cached).
2.  **Sub-Agent (The "Secretary")**:
    - Create a second AI Agent node.
    - Connect the **Google Vertex AI Chat (Cached)** model to this agent.
    - **Do not connect any tools** to this sub-agent.
    - Configure this agent's system prompt to answer questions based on the cache.
3.  **Connect**:
    - Connect the Sub-Agent to the Main Agent's **"Tool"** input.
    - Describe the tool as "A meeting secretary that has access to the full meeting transcripts and notes."

**Result**: The Main Agent can look up the time using its own tool, then ask the "Secretary" tool to retrieve information from the large cached context. This bypasses the API limitation because the Cached Model never sees the dynamic tools.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [Google Vertex AI Context Caching](https://cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview)
* [Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
* [LangChain Google Vertex AI](https://js.langchain.com/docs/integrations/chat/google_vertex_ai)

## Version History

### 0.2.6 (Latest)

- **Developer Experience**: Enhanced the Tools + Cache conflict error. It now automatically converts your n8n tools into **Vertex AI Function Declaration JSON**, which you can directly copy and paste into your cache creation request to enable tools with cached content.

### 0.2.4

- **Developer Experience**: Added a helpful error message when attempting to use Tools + Cache. The error now includes the **JSON Tool Schema**, allowing users to copy it and use it for creating a cache with baked-in tools.
- **Documentation**: Added the "Agent as a Tool" architecture guide to help users implement RAG + Dynamic Tools workflows.

### 0.2.1

- Documentation updates to reflect correct technical implementation and dependency versions.

- **Major Stability Fix**: Downgraded internal dependencies to align with n8n's core (`@langchain/core` 0.3.x), resolving "Unsupported message type" and "SystemMessage.isInstance" errors.
- **Critical Fix**: Fixed parameter passing (Temperature, TopP, etc.) so the model respects user settings and doesn't get stuck in cached personas.
- **Improved Defaults**: Default temperature increased to 0.9 for better responsiveness.
- **Robust Binding**: Implemented "Flattened Binding" strategy for tools + cache to ensure reliability.

### 0.1.0 - 0.1.3 (Beta)

- Initial development and binding fixes.
