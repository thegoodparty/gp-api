import { AsyncLocalStorage } from 'async_hooks'

interface ImpersonationStore {
  isImpersonating: boolean
}

export const impersonationStorage =
  new AsyncLocalStorage<ImpersonationStore>()

export function getImpersonationContext(): boolean | undefined {
  return impersonationStorage.getStore()?.isImpersonating
}

export function runWithImpersonation<T>(
  isImpersonating: boolean,
  fn: () => T,
): T {
  return impersonationStorage.run({ isImpersonating }, fn)
}
