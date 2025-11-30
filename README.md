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

## Operations

This node provides a **Chat Model** that can be used as a sub-node in n8n's AI Agent workflows:

- **Chat Completion**: Generate responses using Google's Gemini models
- **Context Caching**: Reuse cached contexts to reduce API costs and improve response times
- **Tool Binding**: Full support for n8n AI Agent tool calling

## Credentials

This node uses n8n's built-in **Google Vertex AI OAuth2** credential (`googleVertexAiOAuth2Api`).

### Prerequisites

1. A Google Cloud Platform account
2. Vertex AI API enabled in your GCP project
3. Service account with Vertex AI permissions

### Setup

1. In n8n, go to **Credentials** → **New**
2. Search for "Google Vertex AI OAuth2 API"
3. Provide:
   - **Project ID**: Your GCP project ID
   - **Service Account Email**: Your service account email
   - **Private Key**: Your service account private key (JSON format)

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

## Compatibility

- **Minimum n8n version**: 1.0.0
- **Tested with**: n8n 1.x
- **LangChain version**: ^0.1.0
- **@langchain/google-vertexai**: ^0.0.18

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [Google Vertex AI Context Caching](https://cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview)
* [Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
* [LangChain Google Vertex AI](https://js.langchain.com/docs/integrations/chat/google_vertex_ai)

## Version History

### 0.1.0 (Initial Release)

- Google Vertex AI Chat integration with Context Caching support
- Full n8n AI Agent compatibility with tool binding
- Support for Gemini models (1.5 Flash, 1.5 Pro, etc.)
