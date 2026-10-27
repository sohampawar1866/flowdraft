import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { ModelInvoker } from './types.js';

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

export class BedrockModelInvoker implements ModelInvoker {
  async preflight(): Promise<void> {
    if (!process.env.BEDROCK_MODEL_ID) throw new Error('The server is missing its Bedrock model configuration.');
    if (process.env.AWS_BEARER_TOKEN_BEDROCK?.trim()) return;
    await client.config.credentials();
  }

  async invoke(input: { system: string; prompt: string; schema: Record<string, unknown>; toolName: string }): Promise<unknown> {
    const modelId = process.env.BEDROCK_MODEL_ID;
    if (!modelId) throw new Error('The server is missing its Bedrock model configuration.');
    const response = await client.send(new ConverseCommand({
      modelId,
      system: [{ text: input.system }],
      messages: [{ role: 'user', content: [{ text: input.prompt }] }],
      toolConfig: {
        tools: [{ toolSpec: {
          name: input.toolName,
          description: 'Return the requested structured result. Do not perform actions.',
          inputSchema: { json: input.schema as never },
        } }],
        toolChoice: { tool: { name: input.toolName } },
      },
      inferenceConfig: { maxTokens: 800, temperature: 0 },
    }));
    const toolUse = response.output?.message?.content?.find((item) => item.toolUse)?.toolUse;
    if (!toolUse || toolUse.name !== input.toolName || typeof toolUse.input !== 'object' || toolUse.input === null) {
      throw new Error('Bedrock did not return a structured result.');
    }
    return toolUse.input;
  }
}
