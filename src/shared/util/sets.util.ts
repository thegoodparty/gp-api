type SetUtil = <T>(setA: Set<T>, setB: Set<T>) => Set<T>

export const difference: SetUtil = (setA, setB) =>
  new Set([...setA].filter((x) => !setB.has(x)))

export const intersection: SetUtil = (setA, setB) =>
  new Set([...setA].filter((x) => setB.has(x)))

export const union: SetUtil = (setA, setB) => new Set([...setA, ...setB])
