import { FastifyReply } from 'fastify'

export const setTokenCookie = (response: FastifyReply, token: string) =>
  response.setCookie('token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  })
