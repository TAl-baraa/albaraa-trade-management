import { openPath } from '@tauri-apps/plugin-opener'
import { databaseCommand } from './tauriBridge'

export interface StatementPdf {
  fileName: string
  path: string
  shareOpened: boolean
  warning: string | null
}

export const statementPdfRepository = {
  share: (customerName: string): Promise<StatementPdf> => databaseCommand('share_statement_pdf', { customerName }),
  open: (path: string): Promise<void> => openPath(path),
}
