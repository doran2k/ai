import { z } from 'zod';
import {
  generateText,
  generateObject,
  streamText,
  streamObject,
  embed,
  embedMany,
  APICallError,
} from 'ai';
import fs from 'fs';
import { describe, it, expect, vi } from 'vitest';
import type { LanguageModelV1, EmbeddingModelV1 } from '@ai-sdk/provider';

export interface ModelVariants {
  chat?: string[];
  completion?: string[];
  embedding?: string[];
}

export interface TestSuiteOptions {
  name: string;
  createChatModelFn: (modelId: string) => LanguageModelV1;
  createCompletionModelFn: (modelId: string) => LanguageModelV1;
  createEmbeddingModelFn: (modelId: string) => EmbeddingModelV1<string>;
  models: ModelVariants;
  timeout?: number;
  customAssertions?: {
    skipUsage?: boolean;
    errorValidator?: (error: APICallError) => void;
  };
}

export function createFeatureTestSuite({
  name,
  createChatModelFn,
  createCompletionModelFn,
  createEmbeddingModelFn,
  models,
  timeout = 10000,
  customAssertions = { skipUsage: false },
}: TestSuiteOptions) {
  return () => {
    const errorValidator =
      customAssertions.errorValidator ||
      ((error: APICallError) => {
        throw new Error('errorValidator not implemented');
      });
    describe(`${name} Feature Test Suite`, () => {
      vi.setConfig({ testTimeout: timeout });

      // Chat Model Tests
      if (models.chat?.length) {
        describe.each(models.chat)('Chat Model: %s', modelId => {
          const model = createChatModelFn(modelId);

          it('should generate text', async () => {
            const result = await generateText({
              model,
              prompt: 'Write a haiku about programming.',
            });

            expect(result.text).toBeTruthy();
            if (!customAssertions.skipUsage) {
              expect(result.usage?.totalTokens).toBeGreaterThan(0);
            }
          });

          it('should generate text with tool calls', async () => {
            const result = await generateText({
              model,
              prompt: 'What is 2+2? Use the calculator tool to compute this.',
              tools: {
                calculator: {
                  parameters: z.object({
                    expression: z
                      .string()
                      .describe('The mathematical expression to evaluate'),
                  }),
                  execute: async ({ expression }) =>
                    eval(expression).toString(),
                },
              },
            });

            expect(result.toolCalls?.[0]).toMatchObject({
              toolName: 'calculator',
              args: { expression: '2+2' },
            });
            expect(result.toolResults?.[0].result).toBe('4');
            if (!customAssertions.skipUsage) {
              expect(result.usage?.totalTokens).toBeGreaterThan(0);
            }
          });

          it('should generate object', async () => {
            const result = await generateObject({
              model,
              schema: z.object({
                title: z.string(),
                tags: z.array(z.string()),
              }),
              prompt: 'Generate metadata for a blog post about TypeScript.',
            });

            expect(result.object.title).toBeTruthy();
            expect(Array.isArray(result.object.tags)).toBe(true);
            if (!customAssertions.skipUsage) {
              expect(result.usage?.totalTokens).toBeGreaterThan(0);
            }
          });

          it('should stream text', async () => {
            const result = streamText({
              model,
              prompt: 'Count from 1 to 5 slowly.',
            });

            const chunks: string[] = [];
            for await (const chunk of result.textStream) {
              chunks.push(chunk);
            }

            expect(chunks.length).toBeGreaterThan(0);
            if (!customAssertions.skipUsage) {
              expect((await result.usage)?.totalTokens).toBeGreaterThan(0);
            }
          });

          it('should stream text with tool calls', async () => {
            const result = streamText({
              model,
              prompt: 'Calculate 5+7 and 3*4 using the calculator tool.',
              tools: {
                calculator: {
                  parameters: z.object({
                    expression: z.string(),
                  }),
                  execute: async ({ expression }) =>
                    eval(expression).toString(),
                },
              },
            });

            const parts = [];
            for await (const part of result.fullStream) {
              parts.push(part);
            }

            expect(parts.some(part => part.type === 'tool-call')).toBe(true);
            if (!customAssertions.skipUsage) {
              expect((await result.usage).totalTokens).toBeGreaterThan(0);
            }
          });

          it('should stream object', async () => {
            const result = streamObject({
              model,
              schema: z.object({
                characters: z.array(
                  z.object({
                    name: z.string(),
                    class: z
                      .string()
                      .describe(
                        'Character class, e.g. warrior, mage, or thief.',
                      ),
                    description: z.string(),
                  }),
                ),
              }),
              prompt: 'Generate 3 RPG character descriptions.',
            });

            const parts = [];
            for await (const part of result.partialObjectStream) {
              parts.push(part);
            }

            expect(parts.length).toBeGreaterThan(0);
            if (!customAssertions.skipUsage) {
              expect((await result.usage).totalTokens).toBeGreaterThan(0);
            }
          });

          it('should generate text with image URL input', async () => {
            const result = await generateText({
              model,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: 'Describe the image in detail.' },
                    {
                      type: 'image',
                      image:
                        'https://github.com/vercel/ai/blob/main/examples/ai-core/data/comic-cat.png?raw=true',
                    },
                  ],
                },
              ],
            });

            expect(result.text).toBeTruthy();
            expect(result.text.toLowerCase()).toContain('cat');
            if (!customAssertions.skipUsage) {
              expect(result.usage?.totalTokens).toBeGreaterThan(0);
            }
          });

          it('should generate text with image input', async () => {
            const result = await generateText({
              model,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: 'Describe the image in detail.' },
                    {
                      type: 'image',
                      // TODO(shaper): Some tests omit the .toString() below.
                      image: fs
                        .readFileSync('./data/comic-cat.png')
                        .toString('base64'),
                    },
                  ],
                },
              ],
            });

            expect(result.text.toLowerCase()).toContain('cat');
            if (!customAssertions.skipUsage) {
              expect(result.usage?.totalTokens).toBeGreaterThan(0);
            }
          });

          it('should stream text with image URL input', async () => {
            const result = streamText({
              model,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: 'Describe the image in detail.' },
                    {
                      type: 'image',
                      image:
                        'https://github.com/vercel/ai/blob/main/examples/ai-core/data/comic-cat.png?raw=true',
                    },
                  ],
                },
              ],
            });

            const chunks: string[] = [];
            for await (const chunk of result.textStream) {
              chunks.push(chunk);
            }

            const fullText = chunks.join('');
            expect(chunks.length).toBeGreaterThan(0);
            expect(fullText.toLowerCase()).toContain('cat');
            expect((await result.usage)?.totalTokens).toBeGreaterThan(0);
          });

          it('should stream text with image input', async () => {
            const result = streamText({
              model,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: 'Describe the image in detail.' },
                    {
                      type: 'image',
                      image: fs.readFileSync('./data/comic-cat.png'),
                    },
                  ],
                },
              ],
            });

            const chunks: string[] = [];
            for await (const chunk of result.textStream) {
              chunks.push(chunk);
            }

            const fullText = chunks.join('');
            expect(fullText.toLowerCase()).toContain('cat');
            expect(chunks.length).toBeGreaterThan(0);
            if (!customAssertions.skipUsage) {
              expect((await result.usage)?.totalTokens).toBeGreaterThan(0);
            }
          });
        });
      }

      describe('Chat Model Error Handling:', () => {
        it('should throw error on generate text attempt with invalid model ID', async () => {
          const invalidModel = createChatModelFn('no-such-model');

          try {
            await generateText({
              model: invalidModel,
              prompt: 'This should fail',
            });
            // If we reach here, the test should fail
            expect(true).toBe(false); // Force test to fail if no error is thrown
          } catch (error) {
            expect(error).toBeInstanceOf(APICallError);
            errorValidator(error as APICallError);
          }
        });

        it('should throw error on stream text attempt with invalid model ID', async () => {
          const invalidModel = createChatModelFn('no-such-model');

          try {
            const result = streamText({
              model: invalidModel,
              prompt: 'This should fail',
            });

            // Try to consume the stream to trigger the error
            for await (const _ of result.textStream) {
              // Do nothing with the chunks
            }

            // If we reach here, the test should fail
            expect(true).toBe(false); // Force test to fail if no error is thrown
          } catch (error) {
            expect(error).toBeInstanceOf(APICallError);
            errorValidator(error as APICallError);
          }
        });
      });

      // Embedding Model Tests
      if (models.embedding?.length) {
        describe.each(models.embedding)('Embedding Model: %s', modelId => {
          const model = createEmbeddingModelFn(modelId);

          it('should generate single embedding', async () => {
            const result = await embed({
              model,
              value: 'This is a test sentence for embedding.',
            });

            expect(Array.isArray(result.embedding)).toBe(true);
            expect(result.embedding.length).toBeGreaterThan(0);
            if (!customAssertions.skipUsage) {
              expect(result.usage?.tokens).toBeGreaterThan(0);
            }
          });

          it('should generate multiple embeddings', async () => {
            const result = await embedMany({
              model,
              values: [
                'First test sentence.',
                'Second test sentence.',
                'Third test sentence.',
              ],
            });

            expect(Array.isArray(result.embeddings)).toBe(true);
            expect(result.embeddings.length).toBe(3);
            if (!customAssertions.skipUsage) {
              expect(result.usage?.tokens).toBeGreaterThan(0);
            }
          });
        });
      }

      if (models.completion?.length) {
        describe.each(models.completion)('Completion Model: %s', modelId => {
          const model = createCompletionModelFn(modelId);

          it('should generate text', async () => {
            const result = await generateText({
              model,
              prompt: 'Complete this code: function fibonacci(n) {',
            });

            expect(result.text).toBeTruthy();
            expect(result.usage?.totalTokens).toBeGreaterThan(0);
          });

          it('should stream text', async () => {
            const result = streamText({
              model,
              prompt: 'Write a Python function that sorts a list:',
            });

            const chunks: string[] = [];
            for await (const chunk of result.textStream) {
              chunks.push(chunk);
            }

            expect(chunks.length).toBeGreaterThan(0);
            if (!customAssertions.skipUsage) {
              expect((await result.usage)?.totalTokens).toBeGreaterThan(0);
            }
          });
        });

        // New separate error handling describe block
        describe('Completion Model Error Handling:', () => {
          it('should throw error on generate text attempt with invalid model ID', async () => {
            const invalidModel = createCompletionModelFn('no-such-model');

            try {
              await generateText({
                model: invalidModel,
                prompt: 'This should fail',
              });
              // If we reach here, the test should fail
              expect(true).toBe(false); // Force test to fail if no error is thrown
            } catch (error) {
              expect(error).toBeInstanceOf(APICallError);
              errorValidator(error as APICallError);
            }
          });

          it('should throw error on stream text attempt with invalid model ID', async () => {
            const invalidModel = createCompletionModelFn('no-such-model');

            try {
              const result = streamText({
                model: invalidModel,
                prompt: 'This should fail',
              });

              // Try to consume the stream to trigger the error
              for await (const _ of result.textStream) {
                // Do nothing with the chunks
              }

              // If we reach here, the test should fail
              expect(true).toBe(false); // Force test to fail if no error is thrown
            } catch (error) {
              expect(error).toBeInstanceOf(APICallError);
              errorValidator(error as APICallError);
            }
          });
        });
      }
    });
  };
}
