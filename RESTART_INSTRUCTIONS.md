# How to Properly Restart n8n to Load Updated Node

The node has been rebuilt with new debug logging, but n8n needs to be fully restarted to load it.

## Steps:

### 1. Stop n8n completely
```bash
# If running in terminal, press Ctrl+C
# Or if running as a service:
pkill -f n8n
```

### 2. Clear n8n's cache (if installed locally)
```bash
# If you installed the node via npm link or local install:
cd ~/.n8n/nodes
rm -rf node_modules/n8n-nodes-google-vertex-cached
```

### 3. Reinstall the updated node
```bash
# From this project directory:
cd /Users/timyeung/Documents/repo/n8n-nodes-google-vertex-cached
npm run build

# Then reinstall in n8n:
# Option A - If using npm link:
npm link
cd ~/.n8n/nodes
npm link n8n-nodes-google-vertex-cached

# Option B - If using direct install:
cd ~/.n8n
npm install /Users/timyeung/Documents/repo/n8n-nodes-google-vertex-cached
```

### 4. Start n8n fresh
```bash
n8n start
```

### 5. Run your workflow

You should now see NEW debug output like:
```
🔍 DEBUG: All LLMResult keys: [...]
🔍 DEBUG: All llmOutput keys: [...]
🔍 DEBUG: First generation keys: [...]
🔍 DEBUG: First generation full object: {...}
```

If you still see ONLY the old output:
```
📊 Path 1 (llmOutput.tokenUsage): { completionTokens: 0, promptTokens: 0 }
```

Then n8n is still loading the old version. Try:
```bash
# Nuclear option - clear all n8n cache
rm -rf ~/.n8n/cache
rm -rf ~/.n8n/.cache
```
