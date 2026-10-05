import { invoke, isTauri } from '@tauri-apps/api/core'

export const repositoryError = (error: unknown): string => error instanceof Error ? error.message : typeof error === 'string' ? error : 'تعذر إكمال العملية. أعد المحاولة.'

export async function databaseCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('افتح تطبيق سطح المكتب للوصول إلى البيانات المحفوظة.')
  try { return await invoke<T>(command, args) }
  catch (error) { throw new Error(repositoryError(error)) }
}
