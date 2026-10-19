import { openPath } from '@tauri-apps/plugin-opener'
import { databaseCommand } from './tauriBridge'
import type { Currency } from '../types/product'

export interface StatementPdf {
  fileName: string
  path: string
  shareOpened: boolean
  warning: string | null
}

export interface StatementExportBatch { batchId: string; folderPath: string }
export interface BatchStatementPdf { fileName: string; path: string }

export const statementPdfRepository = {
  share: (customerName: string, currency: Currency): Promise<StatementPdf> => databaseCommand('share_statement_pdf', { customerName, currency }),
  createBatch: (): Promise<StatementExportBatch> => databaseCommand('create_statement_export_batch'),
  exportToBatch: (batchId: string, customerName: string, currency: Currency): Promise<BatchStatementPdf> => databaseCommand('export_statement_pdf_to_batch', { batchId, customerName, currency }),
  finishBatch: (batchId: string): Promise<StatementExportBatch> => databaseCommand('finish_statement_export_batch', { batchId }),
  open: (path: string): Promise<void> => openPath(path),
}
