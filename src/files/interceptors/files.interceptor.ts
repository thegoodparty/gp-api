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
import { MimeTypes, Headers } from 'http-constants-ts'

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
 * and can be accessed with '@ReqFile' or '@ReqFiles' param decorators
 * @param key The key on the body to look for files. Files found on other keys will be ignored.
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
 */
export function FilesInterceptor(
  key: string = 'file',
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
      const contentType = req.headers[Headers.CONTENT_TYPE]
      if (!contentType || !contentType.includes(MimeTypes.IMAGE_FORM_DATA)) {
        return next.handle()
      }

      req.fileUploads = []
      req.body ??= {}

      const parts = req.parts({
        limits: { files: numFiles, fileSize: sizeLimit },
      })

      for await (const part of parts) {
        if (part.type === 'file') {
          // Check that submitted file is using expected field name
          // or if bodyOnly mode, ignore any files
          if (key !== part.fieldname || mode === 'bodyOnly') {
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
          // set multipart fields directly on request body
          req.body[part.fieldname] = part.value
        }
      }

      return next.handle()
    }
  }
}
