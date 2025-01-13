import { deepmerge as deepMerge } from 'deepmerge-ts'

/**
 * Helper to make a factory function that merges a default generator with a custom props object
 * @param generateFn Function to generate a default mock entity
 * @returns Factory function that accepts args to override default generated values
 * @example
 * const userFactory = generateFactory<User>(() => ({
 *   id: faker.number.int(),
 *   firstName: faker.person.firstName(),
 *   lastName: faker.person.lastName()
 * }))
 *
 * const fakeUser = userFactory({ firstName: 'Jerry'})
 */
export function generateFactory<T>(generateFn: (args?: unknown) => Partial<T>) {
  return (args: Partial<T> = {}) => deepMerge(generateFn(), args) as T
}
