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
We manually restore `bindTools` to ensure n8n's AI Agent can attach tools.

```javascript
boundModel.bindTools = function(tools, options) {
  // Delegate tool formatting to the original model
  const modelWithTools = model.bindTools(tools, options);
  
  // Re-apply the cache to the tool-enabled model
  return new RunnableBinding({
    bound: modelWithTools,
    kwargs: { cachedContent: cacheId },
    config: {}
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
- **LangChain version**: ^1.1.1
- **@langchain/google-vertexai**: ^1.0.4
- **@langchain/core**: ^0.3.0

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [Google Vertex AI Context Caching](https://cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview)
* [Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
* [LangChain Google Vertex AI](https://js.langchain.com/docs/integrations/chat/google_vertex_ai)

## Version History

### 0.1.2 (Latest)

- Bump version to ensure clean installation for users encountering module loading errors.

### 0.1.1

- Upgraded to `@langchain/google-vertexai` v1.0.4+ for better stability
- Fixed cache parameter binding using `RunnableBinding`
- Improved tool compatibility logic
- Aligned credential handling with n8n standards

### 0.1.0 (Initial Release)

- Google Vertex AI Chat integration with Context Caching support
- Full n8n AI Agent compatibility with tool binding
- Support for Gemini models (1.5 Flash, 1.5 Pro, etc.)
