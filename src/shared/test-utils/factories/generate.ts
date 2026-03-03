/**
 * Helper to make a factory function that merges a default generator with a custom props object
 * Uses shallow merge with object spread - arrays and objects in overrides completely replace defaults
 * @param generateFn Function to generate a default mock entity
 * @returns Factory function that accepts args to override default generated values
 * @example
 * const userFactory = generateFactory<User>(() => ({
 *   id: 1,
 *   firstName: 'John',
 *   lastName: 'Doe'
 * }))
 *
 * const testUser = userFactory({ firstName: 'Jane'})
 */
export function generateFactory<T>(generateFn: (args?: unknown) => Partial<T>) {
  return (args: Partial<T> = {}) => ({ ...generateFn(), ...args }) as T
}
