import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Logger,
  NestInterceptor,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { omit } from 'es-toolkit'
import { FastifyRequest } from 'fastify'
import { Headers, MimeTypes } from 'http-constants-ts'
import { PassThrough } from 'stream'
import { FileUpload } from '../files.types'

type FilesInterceptorOpts = {
  /**
   * Specifies the mode in which files should be processed.
   *
   * - `'buffer'` - Files will be read into in memory and provided as buffers. Fields added to request body.
   * - `'stream'` - Files will be not be read into memory and are provided as readable streams.  Fields added to request body.
   * - `'bodyOnly'` - Only the multipart fields will be parsed and added to request body. Any files are ignored.
   *
   * @default 'buffer'
   */
  mode?: 'buffer' | 'stream' | 'bodyOnly'
  /** Max number of files to accept, an error will be thrown if more are sent. */
  numFiles?: number
  /** Maximum file size to allow, an error will be thrown if files are larger. */
  sizeLimit?: number
  /** Array of mimetypes to accept, an error will be thrown if any files do not match. */
  mimeTypes?: string[]
}

/**
 * Interceptor to parse mulitpart form data and files from a request.
 * Fields are added to the request body, files are added to the request object
 * and can be accessed with '@ReqFile' or '@ReqFiles' param decorators.
 * Nested fields using standard HTML bracket notation (e.g., 'user[name]')
 * are automatically parsed into nested objects.
 * @param key The key(s) on the body to look for files. Files found on other keys will be ignored. Can be a single string or array of strings.
 * @param {FilesInterceptorOpts} options Options for the interceptor
 * @example
 * \@Post('upload/documents')
 * \@UseInterceptors(FilesInterceptor('files', { numFiles: 2, sizeLimit: 1_000_000 }))
 * uploadDocuments(@ReqFiles() documents?: FileUpload[]) {
 *   if(documents) {
 *     // parser found files uploaded with `files` field name
 *   }
 * }
 *
 * \@Post('upload/multiple')
 * \@UseInterceptors(FilesInterceptor(['images', 'documents'], { numFiles: 5 }))
 * uploadMultiple(@ReqFiles() files?: FileUpload[]) {
 *   if(files) {
 *     // parser found files uploaded with either `images` or `documents` field names
 *   }
 * }
 *
 */
export function FilesInterceptor(
  key: string | string[] = 'file',
  {
    mode = 'buffer',
    numFiles,
    sizeLimit,
    mimeTypes,
  }: FilesInterceptorOpts = {},
) {
  return class MixinInterceptor implements NestInterceptor {
    logger = new Logger(FilesInterceptor.name)

    async intercept(ctx: ExecutionContext, next: CallHandler) {
      const req = ctx.switchToHttp().getRequest<
        FastifyRequest & {
          fileUploads?: FileUpload[]
          body?: Record<string, Prisma.JsonValue>
        }
      >()

      const contentType = req.headers[Headers.CONTENT_TYPE.toLowerCase()]
      if (!contentType || !contentType.includes(MimeTypes.IMAGE_FORM_DATA)) {
        return next.handle()
      }

      req.fileUploads = []
      req.body ??= {} as Record<string, Prisma.JsonValue>

      const parts = req.parts({
        limits: { files: numFiles, fileSize: sizeLimit },
      })

      const keys = Array.isArray(key) ? key : [key]

      for await (const part of parts) {
        if (part.type === 'file') {
          if (!keys.includes(part.fieldname) || mode === 'bodyOnly') {
            part.file.resume()
            continue
          }

          if (mimeTypes && !mimeTypes?.includes(part.mimetype)) {
            throw new BadRequestException(
              `Invalid file type. Must be one of: ${mimeTypes?.join(', ')}`,
            )
          }

          let data: FileUpload['data']
          if (mode === 'stream') {
            const passThrough = new PassThrough()
            part.file.pipe(passThrough)
            data = passThrough
          } else {
            data = await part.toBuffer()
          }

          req.fileUploads.push({
            data,
            ...omit(part, ['file', 'toBuffer', 'type', 'fields']),
          })
        } else {
          if (part.fieldname.includes('[') && part.fieldname.includes(']')) {
            setNestedProperty(
              req.body,
              part.fieldname,
              part.value as Prisma.JsonValue,
            )
          } else {
            req.body[part.fieldname] = part.value as Prisma.JsonValue
          }
        }
      }

      return next.handle()
    }
  }
}

/**
 * Helper function to set nested object properties
 * @param obj The object to set the property on
 * @param path The field name with bracket notation (e.g., 'user[name]', 'items[0]')
 * @param value The value to set
 */
function setNestedProperty(
  obj: Prisma.JsonObject,
  path: string,
  value: Prisma.JsonValue,
) {
  if (!path.includes('[') || !path.includes(']')) {
    obj[path] = value
    return
  }

  const keys = path.split(/[[\]]/).filter((key) => key !== '')

  let current = obj

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const nextKey = keys[i + 1]

    const isNextKeyNumeric = !isNaN(Number(nextKey))

    if (!(key in current)) {
      current[key] = isNextKeyNumeric ? [] : {}
    } else if (typeof current[key] !== 'object') {
      current[key] = isNextKeyNumeric ? [] : {}
    } else if (isNextKeyNumeric && !Array.isArray(current[key])) {
      current[key] = []
    } else if (!isNextKeyNumeric && Array.isArray(current[key])) {
      current[key] = {}
    }

    current = current[key] as Prisma.JsonObject
  }

  current[keys[keys.length - 1]] = value
}
