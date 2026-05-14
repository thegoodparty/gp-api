/* eslint-disable @typescript-eslint/no-empty-function */
// Test fixtures define decorated controller stubs whose method bodies don't matter.
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { Body, Param, Query } from '@nestjs/common'
import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import {
  reflectInputDeclarations,
  reflectOutputSchema,
} from './schemaReflect.util'

const BodySchema = z.object({ slogan: z.string().max(255) })
class BodyDto extends createZodDto(BodySchema) {}

const ParamsSchema = z.object({ id: z.string() })
class ParamsDto extends createZodDto(ParamsSchema) {}

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

describe('reflectInputDeclarations', () => {
  it('marks body declared and captures its schema when @Body is present', () => {
    class C {
      handler(@Body() _b: BodyDto) {}
    }
    const decls = reflectInputDeclarations(C.prototype, 'handler', '/foo')
    expect(decls.body.declared).toBe(true)
    expect(decls.body.schema).toBe(BodySchema)
    expect(decls.query.declared).toBe(false)
    expect(decls.params.declared).toBe(false)
  })

  it('returns all-undeclared when handler has no params and path has no placeholder', () => {
    class C {
      handler() {}
    }
    const decls = reflectInputDeclarations(C.prototype, 'handler', '/foo')
    expect(decls.body.declared).toBe(false)
    expect(decls.body.schema).toBeNull()
    expect(decls.query.declared).toBe(false)
    expect(decls.query.schema).toBeNull()
    expect(decls.params.declared).toBe(false)
    expect(decls.params.schema).toBeNull()
  })

  it('marks params declared (schema=null) when path contains :placeholder but @Param is missing', () => {
    class C {
      handler() {}
    }
    const decls = reflectInputDeclarations(C.prototype, 'handler', '/foo/:id')
    expect(decls.params.declared).toBe(true)
    expect(decls.params.schema).toBeNull()
  })

  it('marks params declared and captures schema when @Param Zod DTO is present alongside :placeholder', () => {
    class C {
      handler(@Param() _p: ParamsDto) {}
    }
    const decls = reflectInputDeclarations(C.prototype, 'handler', '/foo/:id')
    expect(decls.params.declared).toBe(true)
    expect(decls.params.schema).toBe(ParamsSchema)
  })

  it('marks query declared without a schema when @Query has no Zod DTO', () => {
    class C {
      handler(@Query() _q: object) {}
    }
    const decls = reflectInputDeclarations(C.prototype, 'handler', '/foo')
    expect(decls.query.declared).toBe(true)
    expect(decls.query.schema).toBeNull()
  })
})
