import { open } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'
import { databaseCommand } from './tauriBridge'

export interface BackupSettings {
  backupDirectory: string | null
  lastSuccessfulBackupAt: string | null
  lastSuccessfulAutoBackupAt: string | null
  automaticBackupAvailable: boolean
  automaticBackupCount: number
  automaticBackupWarning: string | null
}

export interface BackupResult {
  path: string
  completedAt: string
}

export interface RestoreResult {
  safetyBackupPath: string
}

export const backupRepository = {
  getSettings: (): Promise<BackupSettings> => databaseCommand('get_backup_settings'),
  selectDirectory: async (): Promise<string | null> => {
    const selected = await open({ directory: true, multiple: false, title: 'اختر مجلد النسخ الاحتياطي' })
    return typeof selected === 'string' ? selected : null
  },
  configureDirectory: (directory: string): Promise<BackupSettings> => databaseCommand('configure_backup_directory', { directory }),
  createManual: (): Promise<BackupResult> => databaseCommand('create_manual_backup'),
  selectBackupFile: async (): Promise<string | null> => {
    const selected = await open({ multiple: false, title: 'اختر نسخة احتياطية للاستعادة', filters: [{ name: 'قاعدة بيانات البراء', extensions: ['db'] }] })
    return typeof selected === 'string' ? selected : null
  },
  restore: (path: string): Promise<RestoreResult> => databaseCommand('restore_database_backup', { path }),
  openDirectory: (directory: string): Promise<void> => openPath(directory),
}
