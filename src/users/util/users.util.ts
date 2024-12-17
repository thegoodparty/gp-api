import { User } from '@prisma/client'

export function getFullName(user: User) {
  return `${user.firstName} ${user.lastName}`
}
