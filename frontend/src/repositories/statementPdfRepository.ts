import { openPath } from '@tauri-apps/plugin-opener'
import { databaseCommand } from './tauriBridge'
import type { Currency } from '../types/product'

export interface StatementPdf {
  fileName: string
  path: string
  shareOpened: boolean
  warning: string | null
}

export const statementPdfRepository = {
  share: (customerName: string, currency: Currency): Promise<StatementPdf> => databaseCommand('share_statement_pdf', { customerName, currency }),
  open: (path: string): Promise<void> => openPath(path),
}
