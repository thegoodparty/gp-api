/* eslint-disable @typescript-eslint/no-empty-function */
// Test fixtures define decorated controller stubs whose method bodies don't matter.
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { Body, Query } from '@nestjs/common'
import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { reflectInputSchema, reflectOutputSchema } from './schemaReflect.util'

const BodySchema = z.object({ slogan: z.string().max(255) })
class BodyDto extends createZodDto(BodySchema) {}

const QuerySchema = z.object({ limit: z.coerce.number().int().positive() })
class QueryDto extends createZodDto(QuerySchema) {}

const OutputSchema = z.object({ id: z.string(), updated: z.boolean() })

describe('reflectOutputSchema', () => {
  it('returns the Zod schema set by @ResponseSchema', () => {
    class C {
      @ResponseSchema(OutputSchema)
      handler() {}
    }
    expect(reflectOutputSchema(C.prototype.handler)).toBe(OutputSchema)
  })

  it('returns null when no @ResponseSchema is present', () => {
    class C {
      handler() {}
    }
    expect(reflectOutputSchema(C.prototype.handler)).toBeNull()
  })
})

describe('reflectInputSchema', () => {
  it('combines body + query DTO schemas into a single object schema', () => {
    class C {
      handler(@Body() _b: BodyDto, @Query() _q: QueryDto) {}
    }
    const schema = reflectInputSchema(C.prototype, 'handler')
    expect(schema).not.toBeNull()
    const parsed = schema!.parse({
      body: { slogan: 'Vote for me' },
      query: { limit: 10 },
    })
    expect(parsed).toEqual({
      body: { slogan: 'Vote for me' },
      query: { limit: 10 },
    })
  })

  it('returns null when handler has no Zod-DTO parameters', () => {
    class C {
      handler(_a: string) {}
    }
    expect(reflectInputSchema(C.prototype, 'handler')).toBeNull()
  })
})
