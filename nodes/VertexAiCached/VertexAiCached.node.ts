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

export class VertexAiCached implements INodeType {
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
						default: 0.2,
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

		// Base configuration
		const baseConfig: any = {
			model: modelName,
			project: projectIdValue,
			location: location,
			authOptions,
		};

		// Critical: Only add generation parameters if NO cache is being used
		// The cache already has these settings baked in and will reject conflicting configs
		if (!cachedContentName || cachedContentName.trim() === '') {
			const temperature = options.temperature !== undefined ? options.temperature : 0.2;
			const maxOutputTokens = options.maxOutputTokens !== undefined ? options.maxOutputTokens : 8192;
			const topP = options.topP !== undefined ? options.topP : 0.95;
			const topK = options.topK !== undefined ? options.topK : 40;

			baseConfig.temperature = temperature;
			baseConfig.maxOutputTokens = maxOutputTokens;
			baseConfig.topP = topP;
			baseConfig.topK = topK;
		}

		// Add thinking budget if specified
		if (options.thinkingBudget !== undefined) {
			baseConfig.thinkingBudget = options.thinkingBudget;
		}

		// Add safety settings if specified
		if (options.safetySettings?.values && options.safetySettings.values.length > 0) {
			baseConfig.safetySettings = options.safetySettings.values.map((setting: any) => ({
				category: setting.category,
				threshold: setting.threshold,
			}));
		}

		// Instantiate the base model
		const model = new ChatVertexAI(baseConfig);

		// THE BIND FIX: Critical for n8n Agent compatibility
		if (cachedContentName && cachedContentName.trim() !== '') {
			console.log(`✅ Vertex AI Cached: Creating Bound Model for Cache: ${cachedContentName}`);

			// Step 1: Create "Bound" Model
			// This is the native LangChain way to attach parameters.
			// It returns a "RunnableBinding" object.
			// cachedContent is valid at runtime but not in type definitions, so we cast to any
			const boundModel = model.bind({
				cachedContent: cachedContentName,
			} as any);

			// Step 2: RESTORE 'bindTools'
			// The "RunnableBinding" loses the 'bindTools' method, which n8n needs.
			// We manually add it back.
			// @ts-ignore
			boundModel.bindTools = function (tools: any, options?: any) {
				console.log('🔧 Vertex AI Cached: Agent is binding tools...');

				// Step A: Bind tools to the ORIGINAL model
				// (The original model knows how to format tools for Gemini)
				const modelWithTools = model.bindTools(tools, options);

				// Step B: Re-apply the Cache ID
				// We wrap the result in another bind() to ensure cache stays attached
				return modelWithTools.bind({
					cachedContent: cachedContentName,
				} as any);
			};

			// Step 3: Restore other properties n8n might check
			// This helps pass "Sanity Checks" that look for specific flags
			// @ts-ignore
			boundModel.lc_namespace = model.lc_namespace;
			// @ts-ignore
			boundModel.withStructuredOutput = model.withStructuredOutput
				? model.withStructuredOutput.bind(model)
				: undefined;

			return { response: boundModel };
		}

		// No cache - return the base model directly
		return { response: model };
	}
}
