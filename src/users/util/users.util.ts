import { User, UserRole } from '@prisma/client'

export const getUserFullName = (user: User) =>
  !user
    ? ''
    : user.firstName
      ? `${user.firstName} ${user.lastName || ''}`.trim()
      : user.name
        ? user.name
        : ''

/** Helper to check a User's roles against one or many roles */
export function userHasRole(user: User, roleOrRoles: UserRole | UserRole[]) {
  const userRoles = user.roles

  if (!userRoles || userRoles.length === 0) return false

  if (Array.isArray(roleOrRoles)) {
    return roleOrRoles.some((element) => userRoles.includes(element))
  }

  return userRoles.includes(roleOrRoles)
}

export function isAdmin(user: User) {
  return userHasRole(user, UserRole.admin)
}
