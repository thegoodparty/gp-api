import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Logger,
  NestInterceptor,
} from '@nestjs/common'
import { FastifyRequest } from 'fastify'
import { FileUpload } from '../files.types'
import { omit } from 'es-toolkit'
import { PassThrough } from 'stream'
import { Headers, MimeTypes } from 'http-constants-ts'

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
          body?: Record<string, any>
        }
      >()

      // Check if the Content-Type is 'multipart/form-data', bail if not
      const contentType = req.headers[Headers.CONTENT_TYPE.toLowerCase()]
      if (!contentType || !contentType.includes(MimeTypes.IMAGE_FORM_DATA)) {
        return next.handle()
      }

      req.fileUploads = []
      req.body ??= {}

      const parts = req.parts({
        limits: { files: numFiles, fileSize: sizeLimit },
      })

      // Convert key to array for easier checking
      const keys = Array.isArray(key) ? key : [key]

      for await (const part of parts) {
        if (part.type === 'file') {
          // Check that submitted file is using one of the expected field names
          // or if bodyOnly mode, ignore any files
          if (!keys.includes(part.fieldname) || mode === 'bodyOnly') {
            part.file.resume()
            continue
          }

          // validate that file's mimetype is one of the accepted types if specified
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
          // set multipart fields on request body, automatically parsing nested fields
          if (part.fieldname.includes('[') && part.fieldname.includes(']')) {
            setNestedProperty(req.body, part.fieldname, part.value)
          } else {
            req.body[part.fieldname] = part.value
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
function setNestedProperty(obj: any, path: string, value: any) {
  // Parse bracket notation: user[name] -> ['user', 'name']
  if (!path.includes('[') || !path.includes(']')) {
    // No brackets, set directly
    obj[path] = value
    return
  }

  // Handle bracket notation: user[name][email] -> ['user', 'name', 'email']
  const keys = path.split(/[\[\]]/).filter((key) => key !== '')

  let current = obj

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const nextKey = keys[i + 1]

    // Check if we need an array or object
    const isNextKeyNumeric = !isNaN(Number(nextKey))

    if (!(key in current)) {
      // Create new array or object based on next key
      current[key] = isNextKeyNumeric ? [] : {}
    } else if (typeof current[key] !== 'object') {
      // Convert existing value to array or object
      current[key] = isNextKeyNumeric ? [] : {}
    } else if (isNextKeyNumeric && !Array.isArray(current[key])) {
      // Convert object to array if next key is numeric
      current[key] = []
    } else if (!isNextKeyNumeric && Array.isArray(current[key])) {
      // Convert array to object if next key is not numeric
      current[key] = {}
    }

    current = current[key]
  }

  current[keys[keys.length - 1]] = value
}
