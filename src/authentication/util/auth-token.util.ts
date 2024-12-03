import { FastifyReply } from 'fastify'

export const setAuthToken = (token: string, resp: FastifyReply) =>
  resp.setCookie('token', token, { httpOnly: true, secure: true, path: '/' })
export const clearAuthToken = (resp: FastifyReply) =>
  resp.clearCookie('token', { path: '/' })
