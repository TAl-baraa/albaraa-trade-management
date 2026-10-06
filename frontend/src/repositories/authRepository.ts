import { databaseCommand } from './tauriBridge'

export interface AuthStatus {
  hasAccount: boolean
}

export interface AuthSession {
  username: string
}

export const authRepository = {
  status: (): Promise<AuthStatus> => databaseCommand('auth_status'),
  createFirstUser: (username: string, password: string): Promise<AuthSession> => databaseCommand('create_first_user', { input: { username, password } }),
  login: (username: string, password: string): Promise<AuthSession> => databaseCommand('verify_login', { input: { username, password } }),
  changePassword: (currentPassword: string, newPassword: string): Promise<void> => databaseCommand('change_password', { input: { currentPassword, newPassword } }),
}
