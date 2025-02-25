import { HttpException } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { deleteTokenCookie } from '../util/setTokenCookie.util'

export class TokenException extends HttpException {
  constructor(response?: FastifyReply) {
    super(
      {
        statusCode: 498,
        message: 'Invalid or expired token',
      },
      498,
    )

    if (response) {
      deleteTokenCookie(response)
    }
  }
}
