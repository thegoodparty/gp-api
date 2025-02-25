import { FastifyReply } from 'fastify'

export const setTokenCookie = (response: FastifyReply, token: string) =>
  response.setCookie('token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  })

export const deleteTokenCookie = (response: FastifyReply) => {
  response.clearCookie('token', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  })
  return response.clearCookie('user', {
    secure: true,
    sameSite: 'lax',
  })
}
