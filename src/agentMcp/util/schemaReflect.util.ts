/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-type-assertion */
// Reflection-driven schema extraction: Reflect.getMetadata returns `any`, so casting to the
// expected metadata shape (ROUTE_ARGS_METADATA, design:paramtypes) is unavoidable here.
import 'reflect-metadata'
import { ZodSchema } from 'zod'
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants'
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum'
import { RESPONSE_SCHEMA_KEY } from '@/shared/decorators/ResponseSchema.decorator'
import { RegisteredMcpTool } from '../agentMcp.types'

type ZodDtoClass = { schema?: ZodSchema } & (new (
  ...args: unknown[]
) => unknown)

const PARAM_TYPE_TO_INPUT_KEY: Record<number, 'body' | 'query' | 'params'> = {
  [RouteParamtypes.BODY]: 'body',
  [RouteParamtypes.QUERY]: 'query',
  [RouteParamtypes.PARAM]: 'params',
}

export const reflectOutputSchema = (
  handler: (...args: unknown[]) => unknown,
): ZodSchema | null => {
  const schema = Reflect.getMetadata(RESPONSE_SCHEMA_KEY, handler)
  return (schema as ZodSchema | undefined) ?? null
}

export const reflectInputDeclarations = (
  controllerProto: object,
  methodName: string,
  routePath: string,
): RegisteredMcpTool['inputDeclarations'] => {
  const result: RegisteredMcpTool['inputDeclarations'] = {
    body: { declared: false, schema: null },
    query: { declared: false, schema: null },
    params: { declared: false, schema: null },
  }

  if (/[/](:)[a-zA-Z]/.test(routePath)) {
    result.params.declared = true
  }

  const paramMeta = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    controllerProto.constructor,
    methodName,
  ) as Record<string, { index: number; pipes?: unknown[] }> | undefined

  if (!paramMeta) return result

  const paramTypes = (Reflect.getMetadata(
    'design:paramtypes',
    controllerProto,
    methodName,
  ) ?? []) as ZodDtoClass[]

  for (const key of Object.keys(paramMeta)) {
    const [paramTypeStr] = key.split(':')
    const paramType = Number(paramTypeStr)
    const inputKey = PARAM_TYPE_TO_INPUT_KEY[paramType]
    if (!inputKey) continue

    result[inputKey].declared = true

    const { index } = paramMeta[key]
    const dto = paramTypes[index]
    if (dto?.schema) {
      result[inputKey].schema = dto.schema
    }
  }

  return result
}
