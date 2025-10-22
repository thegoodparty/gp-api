import { AsyncLocalStorage } from 'async_hooks'
import { FastifyRequest } from 'fastify'

export const requestContextStore = new AsyncLocalStorage<FastifyRequest>()
