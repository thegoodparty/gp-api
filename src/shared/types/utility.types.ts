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

/**
 * Wrapper type for circular Nest dependencies with SWC.
 *
 * Using a wrapper prevents reflected metadata from eagerly capturing the
 * concrete class type during transpilation, which can trigger TDZ errors
 * in circular graphs.
 */
export type WrapperType<T> = T
