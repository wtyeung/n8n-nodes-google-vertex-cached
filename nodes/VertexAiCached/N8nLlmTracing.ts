import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { SerializedFields } from '@langchain/core/dist/load/map_keys';
import type {
	Serialized,
	SerializedNotImplemented,
	SerializedSecret,
} from '@langchain/core/load/serializable';
import type { BaseMessage } from '@langchain/core/messages';
import type { LLMResult } from '@langchain/core/outputs';
import pick from 'lodash/pick';
import type { IDataObject, ISupplyDataFunctions, JsonObject } from 'n8n-workflow';
import { NodeConnectionTypes, NodeError, NodeOperationError } from 'n8n-workflow';

type TokensUsageParser = (result: LLMResult) => {
	completionTokens: number;
	promptTokens: number;
	totalTokens: number;
};

type RunDetail = {
	index: number;
	messages: BaseMessage[] | string[] | string;
	options: SerializedSecret | SerializedNotImplemented | SerializedFields;
};

export class N8nLlmTracing extends BaseCallbackHandler {
	name = 'N8nLlmTracing';

	awaitHandlers = true;

	connectionType = NodeConnectionTypes.AiLanguageModel;

	promptTokensEstimate = 0;

	completionTokensEstimate = 0;

	#parentRunIndex?: number;

	runsMap: Record<string, RunDetail> = {};

	options = {
		tokensUsageParser: (result: LLMResult) => {
			// Google Vertex AI returns token usage in multiple possible locations
			// Try different paths to find the token usage information
			
			// Path 1: Standard LangChain format (result.llmOutput.tokenUsage)
			let completionTokens = (result?.llmOutput?.tokenUsage?.completionTokens as number) ?? 0;
			let promptTokens = (result?.llmOutput?.tokenUsage?.promptTokens as number) ?? 0;
			let cachedTokens = 0;
			
			// Path 2: Google Vertex AI format with snake_case (result.llmOutput.usage_metadata)
			if (completionTokens === 0 && promptTokens === 0) {
				const usageMetadata = (result?.llmOutput as any)?.usage_metadata;
				if (usageMetadata) {
					completionTokens = usageMetadata.output_tokens ?? 0;
					promptTokens = usageMetadata.input_tokens ?? 0;
					// Cached tokens are in input_token_details.cache_read
					cachedTokens = usageMetadata.input_token_details?.cache_read ?? 0;
				}
			}
			
			// Path 3: Google Vertex AI format with camelCase (result.llmOutput.usageMetadata)
			if (completionTokens === 0 && promptTokens === 0) {
				const usageMetadata = (result?.llmOutput as any)?.usageMetadata;
				if (usageMetadata) {
					completionTokens = usageMetadata.candidatesTokenCount ?? usageMetadata.output_tokens ?? 0;
					promptTokens = usageMetadata.promptTokenCount ?? usageMetadata.input_tokens ?? 0;
					cachedTokens = usageMetadata.cachedContentTokenCount ?? usageMetadata.cached_content_token_count ?? 0;
				}
			}
			
			// Path 4: Check message.kwargs.usage_metadata in the first generation
			if (completionTokens === 0 && promptTokens === 0 && result?.generations?.[0]?.[0]) {
				const firstGen = result.generations[0][0] as any;
				const messageUsage = firstGen?.message?.kwargs?.usage_metadata;
				if (messageUsage) {
					completionTokens = messageUsage.output_tokens ?? 0;
					promptTokens = messageUsage.input_tokens ?? 0;
					cachedTokens = messageUsage.input_token_details?.cache_read ?? 0;
				}
			}

			// Build the response with cached token information
			const tokenUsage: any = {
				completionTokens,
				promptTokens,
				totalTokens: completionTokens + promptTokens,
			};
			
			// Add cached tokens if present (important for cost tracking)
			if (cachedTokens > 0) {
				tokenUsage.cachedTokens = cachedTokens;
				// Log for visibility since n8n UI doesn't show custom fields
				console.log(`💰 Token Usage - Prompt: ${promptTokens}, Completion: ${completionTokens}, Cached: ${cachedTokens} (90% discount)`);
			}

			return tokenUsage;
		},
		errorDescriptionMapper: (error: NodeError) => error.description,
	};

	constructor(
		private executionFunctions: ISupplyDataFunctions,
		options?: {
			tokensUsageParser?: TokensUsageParser;
			errorDescriptionMapper?: (error: NodeError) => string;
		},
	) {
		super();
		this.options = { ...this.options, ...options };
	}

	async handleLLMEnd(output: LLMResult, runId: string) {
		const runDetails = this.runsMap[runId] ?? { index: Object.keys(this.runsMap).length };

		output.generations = output.generations.map((gen) =>
			gen.map((g) => pick(g, ['text', 'generationInfo'])),
		);

		const tokenUsageEstimate = {
			completionTokens: 0,
			promptTokens: 0,
			totalTokens: 0,
		};
		const tokenUsage = this.options.tokensUsageParser(output);

		const response: {
			response: { generations: LLMResult['generations'] };
			tokenUsageEstimate?: typeof tokenUsageEstimate;
			tokenUsage?: typeof tokenUsage;
		} = {
			response: { generations: output.generations },
		};

		if (tokenUsage.completionTokens > 0) {
			response.tokenUsage = tokenUsage;
			
			// If cached tokens are present, also log them in a format n8n might display
			if (tokenUsage.cachedTokens > 0) {
				// Add to response metadata for potential visibility
				(response as any).metadata = {
					cachedTokens: tokenUsage.cachedTokens,
					cacheHit: true,
					costSavings: `${tokenUsage.cachedTokens} tokens at 90% discount`,
				};
			}
		} else {
			response.tokenUsageEstimate = tokenUsageEstimate;
		}

		const sourceNodeRunIndex =
			this.#parentRunIndex !== undefined ? this.#parentRunIndex + runDetails.index : undefined;

		this.executionFunctions.addOutputData(
			this.connectionType,
			runDetails.index,
			[[{ json: { ...response } }]],
			undefined,
			sourceNodeRunIndex,
		);
	}

	async handleLLMStart(llm: Serialized, prompts: string[], runId: string) {
		const sourceNodeRunIndex =
			this.#parentRunIndex !== undefined
				? this.#parentRunIndex + this.executionFunctions.getNextRunIndex()
				: undefined;

		const options = llm.type === 'constructor' ? llm.kwargs : llm;
		const { index } = this.executionFunctions.addInputData(
			this.connectionType,
			[
				[
					{
						json: {
							messages: prompts,
							options,
						},
					},
				],
			],
			sourceNodeRunIndex,
		);

		this.runsMap[runId] = {
			index,
			options,
			messages: prompts,
		};
	}

	async handleLLMError(error: IDataObject | Error, runId: string, parentRunId?: string) {
		const runDetails = this.runsMap[runId] ?? { index: Object.keys(this.runsMap).length };

		if (typeof error === 'object' && error?.hasOwnProperty('headers')) {
			const errorWithHeaders = error as { headers: Record<string, unknown> };

			Object.keys(errorWithHeaders.headers).forEach((key) => {
				if (!key.startsWith('x-')) {
					delete errorWithHeaders.headers[key];
				}
			});
		}

		if (error instanceof NodeError) {
			if (this.options.errorDescriptionMapper) {
				error.description = this.options.errorDescriptionMapper(error);
			}

			this.executionFunctions.addOutputData(this.connectionType, runDetails.index, error);
		} else {
			this.executionFunctions.addOutputData(
				this.connectionType,
				runDetails.index,
				new NodeOperationError(this.executionFunctions.getNode(), error as JsonObject, {
					functionality: 'configuration-node',
				}),
			);
		}
	}

	setParentRunIndex(runIndex: number) {
		this.#parentRunIndex = runIndex;
	}
}
