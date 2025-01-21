import {
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common'
import { FastifyRequest } from 'fastify'
import { FileUpload } from '../files.types'
import { omit } from 'es-toolkit'
import { PassThrough } from 'stream'

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
}

/**
 * Interceptor to parse mulitpart form data and files from a request.
 * Fields are added to the request body, files are added to the request object
 * and can be accessed with '@ReqFile' or '@ReqFiles' param decorators
 * @param key The key on the body to look for files. Files found on other keys will be ignored.
 * @param {FilesInterceptorOpts} options Options for the interceptor
 */
export function FilesInterceptor(
  key: string = 'file',
  { mode = 'buffer', numFiles, sizeLimit }: FilesInterceptorOpts = {},
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

      req.fileUploads = []
      req.body ??= {}

      const parts = req.parts({
        limits: { files: numFiles, fileSize: sizeLimit },
      })

      for await (const part of parts) {
        if (part.type === 'file') {
          if (key !== part.fieldname || mode === 'bodyOnly') {
            part.file.resume()
            continue
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
          req.body[part.fieldname] = part.value
        }
      }

      return next.handle()
    }
  }
}
