import { z } from 'zod'
import { UserRole } from '@prisma/client'

export const RolesSchema = z.array(z.nativeEnum(UserRole)).optional()
