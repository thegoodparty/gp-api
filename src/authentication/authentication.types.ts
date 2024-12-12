import { FastifyRequest } from 'fastify'
import { User } from '@prisma/client'
import { ReadUserOutput } from '../users/schemas/ReadUserOutput.schema'

export type LoginResult = { user: ReadUserOutput; token: string }
export type RequestWithUser = FastifyRequest & { user: User }
