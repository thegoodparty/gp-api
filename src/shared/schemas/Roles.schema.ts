import { UserRole } from '@prisma/client'
import { z } from 'zod'

export const RolesSchema = z.array(z.nativeEnum(UserRole)).optional()
