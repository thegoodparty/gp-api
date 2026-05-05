import 'reflect-metadata'
import { ZodSchema, z } from 'zod'
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants'
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum'
import { RESPONSE_SCHEMA_KEY } from '@/shared/decorators/ResponseSchema.decorator'

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

export const reflectInputSchema = (
  controllerProto: object,
  methodName: string,
): ZodSchema | null => {
  const paramMeta = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    controllerProto.constructor,
    methodName,
  ) as Record<string, { index: number; pipes?: unknown[] }> | undefined

  if (!paramMeta) return null

  const paramTypes = (Reflect.getMetadata(
    'design:paramtypes',
    controllerProto,
    methodName,
  ) ?? []) as ZodDtoClass[]

  const collected: Partial<Record<'body' | 'query' | 'params', ZodSchema>> = {}

  for (const key of Object.keys(paramMeta)) {
    const [paramTypeStr] = key.split(':')
    const paramType = Number(paramTypeStr)
    const inputKey = PARAM_TYPE_TO_INPUT_KEY[paramType]
    if (!inputKey) continue

    const { index } = paramMeta[key]
    const dto = paramTypes[index]
    if (!dto?.schema) continue

    collected[inputKey] = dto.schema
  }

  if (Object.keys(collected).length === 0) return null

  return z.object(collected as Record<string, ZodSchema>)
}
