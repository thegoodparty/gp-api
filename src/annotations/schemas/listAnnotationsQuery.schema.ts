import { z } from 'zod'
import { AnnotationKindSchema } from '@goodparty_org/contracts'

// `kinds` arrives either as a comma-separated string (?kinds=review) or a
// repeated query param (?kinds=note&kinds=chat). Normalize both to an array
// and validate each value against AnnotationKind.
export const ListAnnotationsQuerySchema = z.object({
  kinds: z
    .preprocess(
      (v) => (typeof v === 'string' && v.length > 0 ? v.split(',') : v),
      z.array(AnnotationKindSchema),
    )
    .optional(),
})

export type ListAnnotationsQuery = z.infer<typeof ListAnnotationsQuerySchema>
