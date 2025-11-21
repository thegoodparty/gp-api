import { z } from 'zod'

export const SpanInputSchema = z.object({
  substring: z.string().min(1),
  reason: z.string().min(1),
  suggestion: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().optional(),
  ),
})

export const BiasAnalysisInputSchema = z.object({
  bias_spans: z.array(SpanInputSchema),
  grammar_spans: z.array(SpanInputSchema),
  rewritten_text: z.string().min(1),
})

export const SpanSchema = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  reason: z.string().min(1),
  suggestion: z.string().optional(),
})

export const BiasAnalysisResponseSchema = z.object({
  bias_spans: z.array(SpanSchema),
  grammar_spans: z.array(SpanSchema),
  rewritten_text: z.string().min(1),
})

export type SpanInput = z.infer<typeof SpanInputSchema>
export type BiasAnalysisInput = z.infer<typeof BiasAnalysisInputSchema>
export type Span = z.infer<typeof SpanSchema>
export type BiasAnalysisResponse = z.infer<typeof BiasAnalysisResponseSchema>
