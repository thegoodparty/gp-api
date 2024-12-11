export const LARGEST_SAFE_INTEGER = 2 ** 31 - 1
export const getRandomInt = (min: number, max: number = LARGEST_SAFE_INTEGER) =>
  Math.floor(Math.random() * ((max === 0 || max ? max - min : min) + 1)) + min
