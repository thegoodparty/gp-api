import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { FastifyRequest } from 'fastify'
import { FileUpload } from '../files.types'

/** param decorator to pull in uploaded files from request */
export const ReqFiles = createParamDecorator(
  (count: undefined, ctx: ExecutionContext) => {
    const req = ctx
      .switchToHttp()
      .getRequest<FastifyRequest & { fileUploads?: FileUpload[] }>()

    return req.fileUploads
  },
)

/** param decorator to pull in single uploaded file from request */
export const ReqFile = createParamDecorator(
  (count: undefined, ctx: ExecutionContext) => {
    const req = ctx
      .switchToHttp()
      .getRequest<FastifyRequest & { fileUploads?: FileUpload[] }>()

    return req.fileUploads?.[0]
  },
)
