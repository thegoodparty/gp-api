import { deepmerge as deepMerge } from 'deepmerge-ts'

/**
 * Helper to make a factory function that merges a default generator with a custom props object
 * Uses deep merge to recursively merge nested objects and arrays
 * @param generateFn Function called with the incoming overrides so the generator can inspect them
 *   (e.g. to skip incrementing a counter when `id` is already provided).
 * @returns Factory function that accepts args to override default generated values
 * @example
 * const userFactory = generateFactory<User>((args) => ({
 *   id: 'id' in args ? args.id : counter++,
 *   firstName: 'John',
 *   lastName: 'Doe'
 * }))
 *
 * const testUser = userFactory({ firstName: 'Jane'})
 */
export function generateFactory<T>(
  generateFn: (args: Partial<T>) => Partial<T>,
) {
  return (args: Partial<T> = {}) => deepMerge(generateFn(args), args) as T
}
