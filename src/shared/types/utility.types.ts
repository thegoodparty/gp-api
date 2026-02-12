/**
 * Utility to reuse a type but make some fields optional
 */
export type WithOptional<T, F extends keyof T> = Omit<T, F> &
  Partial<Pick<T, F>>

/**
 * Utility to reuse a type but make some fields required
 */
export type WithRequired<T, F extends keyof T> = Omit<T, F> &
  Required<Pick<T, F>>

export type PaginationOptions = {
  offset?: number
  limit?: number
}

export type PaginationMeta = {
  total: number
  offset: number
  limit: number
}

export type PaginatedResults<T> = {
  data: T[]
  meta: PaginationMeta
}
