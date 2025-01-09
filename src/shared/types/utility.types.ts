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
