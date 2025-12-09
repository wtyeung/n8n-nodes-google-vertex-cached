import {
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
	type ILoadOptionsFunctions,
	type INodeListSearchResult,
	NodeConnectionTypes,
} from 'n8n-workflow';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { ProjectsClient } from '@google-cloud/resource-manager';
import { RunnableBinding } from '@langchain/core/runnables';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { N8nLlmTracing } from './N8nLlmTracing';

export class VertexAiCached implements INodeType {
	usableAsTool = true;
	
	description: INodeTypeDescription = {
		displayName: 'Google Vertex AI Chat (Cached)',
		name: 'vertexAiCachedChat',
		icon: 'file:vertexai.svg',
		group: ['transform'],
		version: 1,
		description: 'Chat model with native Cached Content support for Google Vertex AI',
		defaults: {
			name: 'Google Vertex AI Chat (Cached)',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Language Models'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview',
					},
				],
			},
		},
		credentials: [
			{
				name: 'googleApi',
				required: true,
			},
		],
		// This is crucial for AI Agent compatibility
		inputs: [],
		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		properties: [
			{
				displayName: 'Project ID',
				name: 'projectId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						placeholder: 'Select a project...',
						typeOptions: {
							searchListMethod: 'getProjects',
							searchable: true,
						},
					},
					{
						displayName: 'ID',
						name: 'id',
						type: 'string',
						placeholder: 'my-project-id',
					},
				],
			},
			{
				displayName: 'Model Name',
				name: 'model',
				type: 'string',
				default: 'gemini-2.5-flash',
				description: 'The model to use for chat completion',
				placeholder: 'gemini-2.5-flash',
			},
			{
				displayName: 'Cached Content Name',
				name: 'cachedContentName',
				type: 'string',
				default: '',
				placeholder: 'projects/.../locations/.../cachedContents/...',
				description: 'Full resource name of the cache. If provided, generation parameters are ignored.',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Location',
						name: 'location',
						type: 'string',
						default: 'us-central1',
						description: 'Google Cloud region for Vertex AI',
						placeholder: 'us-central1',
					},
					{
						displayName: 'Sampling Temperature',
						name: 'temperature',
						type: 'number',
						default: 0.9,
						typeOptions: {
							minValue: 0,
							maxValue: 2,
							numberPrecision: 1,
						},
						description: 'Controls randomness in the output. Higher values make output more random.',
					},
					{
						displayName: 'Maximum Number of Tokens',
						name: 'maxOutputTokens',
						type: 'number',
						default: 8192,
						description: 'Maximum number of tokens to generate',
					},
					{
						displayName: 'Top P',
						name: 'topP',
						type: 'number',
						default: 0.95,
						typeOptions: {
							minValue: 0,
							maxValue: 1,
							numberPrecision: 2,
						},
						description: 'Nucleus sampling parameter',
					},
					{
						displayName: 'Top K',
						name: 'topK',
						type: 'number',
						default: 40,
						description: 'Enter the number of token choices the model uses to generate the next token',
					},
					{
						displayName: 'Thinking Budget',
						name: 'thinkingBudget',
						type: 'number',
						default: undefined,
						description: 'Controls reasoning tokens for thinking models. Set to 0 to disable automatic thinking. Set to -1 for dynamic thinking. Leave empty for auto mode.',
						placeholder: 'Leave empty for auto',
					},
					{
						displayName: 'Google Search Grounding',
						name: 'useGoogleSearchGrounding',
						type: 'boolean',
						default: false,
						description: 'Whether to ground responses with Google Search results. When enabled, the model will search Google and use the results to provide more accurate, up-to-date information. Note: Cannot be used with cached content.',
					},
					{
						displayName: 'Safety Settings',
						name: 'safetySettings',
						type: 'fixedCollection',
						default: {},
						description: 'Gemini supports adjustable safety settings',
						placeholder: 'Add Safety Setting',
						typeOptions: {
							multipleValues: true,
						},
						options: [
							{
								name: 'values',
								displayName: 'Values',
								values: [
									{
										displayName: 'Category',
										name: 'category',
										type: 'options',
										default: 'HARM_CATEGORY_HATE_SPEECH',
										options: [
											{
												name: 'Hate Speech',
												value: 'HARM_CATEGORY_HATE_SPEECH',
											},
											{
												name: 'Dangerous Content',
												value: 'HARM_CATEGORY_DANGEROUS_CONTENT',
											},
											{
												name: 'Harassment',
												value: 'HARM_CATEGORY_HARASSMENT',
											},
											{
												name: 'Sexually Explicit',
												value: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
											},
										],
										description: 'The category of harmful content to filter',
									},
									{
										displayName: 'Threshold',
										name: 'threshold',
										type: 'options',
										default: 'BLOCK_MEDIUM_AND_ABOVE',
										options: [
											{
												name: 'Block None',
												value: 'BLOCK_NONE',
											},
											{
												name: 'Block Low and Above',
												value: 'BLOCK_LOW_AND_ABOVE',
											},
											{
												name: 'Block Medium and Above',
												value: 'BLOCK_MEDIUM_AND_ABOVE',
											},
											{
												name: 'Block Only High',
												value: 'BLOCK_ONLY_HIGH',
											},
										],
										description: 'The threshold for blocking content',
									},
								],
							},
						],
					},
				],
			},
		],
	};

	methods = {
		listSearch: {
			async getProjects(this: ILoadOptionsFunctions): Promise<INodeListSearchResult> {
				const results: Array<{ name: string; value: string }> = [];

				const credentials = await this.getCredentials('googleApi');
				const privateKey = (credentials.privateKey as string).replace(/\\n/g, '\n');
				const email = (credentials.email as string).trim();

				const client = new ProjectsClient({
					credentials: {
						client_email: email,
						private_key: privateKey,
					},
				});

				const [projects] = await client.searchProjects();

				for (const project of projects) {
					if (project.projectId) {
						results.push({
							name: project.displayName ?? project.projectId,
							value: project.projectId,
						});
					}
				}

				return { results };
			},
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		// Get credentials (Google Service Account)
		const credentials = await this.getCredentials('googleApi');

		// Get Project ID from resource locator
		const projectIdValue = this.getNodeParameter('projectId', itemIndex, '', {
			extractValue: true,
		}) as string;

		// Get node parameters
		const modelName = this.getNodeParameter('model', itemIndex) as string;
		const cachedContentName = this.getNodeParameter('cachedContentName', itemIndex, '') as string;
		const options = this.getNodeParameter('options', itemIndex, {}) as any;
		const location = options.location || 'us-central1';

		// Apply defaults if not set in options (matching UI defaults)
		// This is crucial because getNodeParameter for collections only returns explicitly set values
		const temperature = options.temperature !== undefined ? options.temperature : 0.9;
		const topP = options.topP !== undefined ? options.topP : 0.95;
		const topK = options.topK !== undefined ? options.topK : 40;
		const maxOutputTokens = options.maxOutputTokens || 8192;

		// Parse the service account credentials
		const serviceAccountEmail = credentials.email as string;
		const privateKey = (credentials.privateKey as string).replace(/\\n/g, '\n');

		// Map credentials to ChatVertexAI auth format
		const authOptions = {
			projectId: projectIdValue,
			credentials: {
				client_email: serviceAccountEmail,
				private_key: privateKey,
			},
		};

		// Base configuration - ALWAYS include all parameters
		const baseConfig: any = {
			model: modelName,
			project: projectIdValue,
			location: location,
			maxOutputTokens,
			temperature,
			topP,
			topK,
			authOptions,
			callbacks: [new N8nLlmTracing(this)],
		};

		// Add optional parameters if they exist
		if (options.thinkingBudget !== undefined) {
			// @ts-ignore - New parameter might not be in types yet
			baseConfig.thinkingBudget = options.thinkingBudget;
		}
		
		if (options.safetySettings) {
			baseConfig.safetySettings = options.safetySettings.values;
		}

		// Add Google Search grounding if enabled (only works without cache)
		if (options.useGoogleSearchGrounding === true) {
			if (cachedContentName && cachedContentName.trim() !== '') {
				console.warn('⚠️ WARNING: Google Search grounding is enabled but will be ignored because cached content is being used. Tools cannot be used with cached content.');
			} else {
				console.log('🔍 Google Search Grounding ENABLED');
				
				// Based on Google AI Studio example, use googleSearch as a tool
				// @ts-ignore - googleSearch may not be in types yet
				baseConfig.tools = [{
					googleSearch: {}
				}];
				
				console.log('📝 Base config with grounding:', JSON.stringify(baseConfig.tools, null, 2));
			}
		}

		// Instantiate the base model
		const model = new ChatVertexAI(baseConfig);

		// Store if grounding is enabled for later use
		const hasGrounding = options.useGoogleSearchGrounding === true;
		
		// THE BIND FIX: Critical for n8n Agent compatibility
		if (cachedContentName && cachedContentName.trim() !== '') {
			// Step 1: Create "Bound" Model
			// We use RunnableBinding to inject cachedContent parameter
			const boundModel = new RunnableBinding({
				bound: model,
				kwargs: {
					cachedContent: cachedContentName,
				},
				config: {},
			});
			
			// CRITICAL: Override withConfig to ensure callbacks are properly forwarded
			// n8n attaches callbacks at runtime via withConfig, so we need to intercept this
			const originalWithConfig = boundModel.withConfig.bind(boundModel);
			// @ts-ignore
			boundModel.withConfig = function(config: any) {
				// Apply config to the underlying model, not just the wrapper
				const configuredModel = originalWithConfig(config);
				// Also apply to the bound model directly
				if (config?.callbacks) {
					(model as any).callbacks = config.callbacks;
				}
				return configuredModel;
			};

			// Step 2: RESTORE 'bindTools'
			// The "RunnableBinding" loses the 'bindTools' method, which n8n needs.
			// We manually add it back.
			
			// Verify the original model has bindTools
			if (typeof (model as any).bindTools !== 'function') {
				console.error('❌ ERROR: Original model does not have bindTools method!');
				throw new Error('ChatVertexAI model does not support tool binding');
			}
			
			// @ts-ignore
			boundModel.bindTools = function (tools: any, options?: any) {
				// If grounding is enabled, we need to preserve the googleSearch tool
				if (hasGrounding) {
					console.log('⚠️ WARNING: Cannot use both grounding and dynamic tools with cached content');
				}
				
				// Step A: Bind tools to the ORIGINAL model
				const modelWithTools = model.bindTools(tools, options);
				
				// Inspect the 'tools' argument directly as it comes from n8n (fallback)
				const toolsList = Array.isArray(tools) ? tools : [];
				
				if (toolsList.length > 0 && cachedContentName) {
					let toolConfigJson = 'Could not serialize tools.';
					try {
						// Try to convert tools manually using Zod schema if available
						// This matches Vertex AI FunctionDeclaration format
						const manualConversion = toolsList.map((t: any) => {
							let parameters = {};
							if (t.schema) {
								try {
									parameters = zodToJsonSchema(t.schema);
								} catch (zodError) {
									console.warn('Error converting Zod schema:', zodError);
								}
							}
							return {
								name: t.name || t.constructor.name,
								description: t.description || '',
								parameters,
							};
						});

						toolConfigJson = JSON.stringify(manualConversion, null, 2);
						
					} catch (e) {
						console.error('Error serializing tools:', e);
						// Fallback to simple names if conversion fails
						const names = toolsList.map((t: any) => t.name || t.constructor.name).join(', ');
						toolConfigJson = `(Serialization failed)\nTools: ${names}`;
					}

					throw new Error(
						`❌ CONFLICT: Tools + Cache detected.\n\n` +
						`You cannot use dynamic tools with an existing Context Cache.\n` +
						`Use this JSON in the 'tools' field when creating your cache:\n\n` +
						`${toolConfigJson}`
					);
				}
				
				// Step B: Re-apply the Cache ID using standard .bind()
				// Since we fixed the dependency versions, this standard chaining should work
				// and is safer than manual RunnableBinding construction for tools.
				// @ts-ignore
				return modelWithTools.bind({
					cachedContent: cachedContentName,
				});
			};

			// Step 3: Restore other properties n8n might check
			// This helps pass "Sanity Checks" that look for specific flags
			// @ts-ignore
			boundModel.lc_namespace = model.lc_namespace;
			// @ts-ignore
			boundModel.withStructuredOutput = model.withStructuredOutput
				? model.withStructuredOutput.bind(model)
				: undefined;
			
			// Copy additional properties that n8n might check
			// @ts-ignore
			boundModel._modelType = model._modelType;
			// @ts-ignore
			boundModel._llmType = model._llmType;
			// @ts-ignore
			boundModel.caller = model.caller;
			// @ts-ignore
			boundModel.verbose = model.verbose;
			// @ts-ignore
			boundModel.name = model.name;

			return { response: boundModel };
		}

		// No cache - but if grounding is enabled, we need to preserve it when bindTools is called
		if (hasGrounding) {
			const originalBindTools = model.bindTools.bind(model);
			// @ts-ignore
			model.bindTools = function(tools: any, options?: any) {
				console.log('🔧 Preserving googleSearch tool when binding n8n tools');
				// Bind the n8n tools first
				const modelWithTools = originalBindTools(tools, options);
				// Then re-add the googleSearch tool
				// @ts-ignore
				const existingTools = (modelWithTools as any).kwargs?.tools || [];
				const mergedTools = [...existingTools, { googleSearch: {} }];
				// @ts-ignore
				if ((modelWithTools as any).kwargs) {
					(modelWithTools as any).kwargs.tools = mergedTools;
				}
				console.log('✅ Merged tools:', JSON.stringify(mergedTools, null, 2));
				return modelWithTools;
			};
		}

		return { response: model };
	}
}
