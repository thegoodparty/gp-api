import { z } from 'zod'
import { UserRoleSchema } from '../generated/enums'

export const RolesSchema = z.array(UserRoleSchema).optional()
