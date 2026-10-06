import { Building2, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { authRepository, type AuthSession } from '../../repositories/authRepository'
import { repositoryError } from '../../repositories/tauriBridge'

interface AuthScreenProps {
  mode: 'setup' | 'login'
  startupError?: string | null
  onAuthenticated: (session: AuthSession) => void
  onRetryStatus: () => void
}

export function AuthScreen({ mode, startupError, onAuthenticated, onRetryStatus }: AuthScreenProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedUsername = username.trim()
    if (!normalizedUsername) { setError('اسم المستخدم مطلوب.'); return }
    if (!password) { setError('كلمة المرور مطلوبة.'); return }
    if (mode === 'setup' && password.length < 8) { setError('يجب ألا تقل كلمة المرور عن 8 أحرف.'); return }
    if (mode === 'setup' && password !== confirmation) { setError('تأكيد كلمة المرور غير مطابق.'); return }
    setBusy(true); setError(null)
    try {
      const session = mode === 'setup'
        ? await authRepository.createFirstUser(normalizedUsername, password)
        : await authRepository.login(normalizedUsername, password)
      onAuthenticated(session)
    } catch (reason) {
      setError(repositoryError(reason))
    } finally { setBusy(false) }
  }

  return <main className="auth-screen">
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-brand"><span><Building2 size={30} /></span><div><strong>مكتب البراء</strong><small>نظام إدارة التجارة</small></div></div>
      <div className="auth-heading"><ShieldCheck size={34} /><div><h1 id="auth-title">{mode === 'setup' ? 'إعداد الحساب المحلي' : 'تسجيل الدخول'}</h1><p>{mode === 'setup' ? 'أنشئ الحساب الوحيد لاستخدام النظام على هذا الجهاز.' : 'أدخل بيانات الحساب المحلي للمتابعة.'}</p></div></div>
      {startupError ? <div className="auth-error" role="alert"><span>{startupError}</span><button className="button button--secondary button--small" type="button" onClick={onRetryStatus}>إعادة المحاولة</button></div> : <form className="auth-form" onSubmit={submit}>
        <label className="field"><span><UserRound size={17} />اسم المستخدم</span><input autoComplete="username" autoFocus value={username} onChange={(event) => setUsername(event.target.value)} disabled={busy} /></label>
        <label className="field"><span><LockKeyhole size={17} />كلمة المرور</span><input type="password" autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></label>
        {mode === 'setup' && <label className="field"><span><LockKeyhole size={17} />تأكيد كلمة المرور</span><input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} /></label>}
        {mode === 'setup' && <p className="auth-hint">يجب ألا تقل كلمة المرور عن 8 أحرف.</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="button button--primary auth-submit" type="submit" disabled={busy}>{busy ? 'جارٍ التحقق...' : mode === 'setup' ? 'إنشاء الحساب والدخول' : 'دخول'}</button>
      </form>}
    </section>
  </main>
}
