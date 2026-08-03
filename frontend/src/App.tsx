import { Building2 } from 'lucide-react'
import './App.css'

function App() {
  return (
    <main className="preparation-page">
      <section className="preparation-card" aria-labelledby="page-title">
        <div className="brand-icon" aria-hidden="true">
          <Building2 size={42} strokeWidth={1.6} />
        </div>
        <p className="establishment-name">مكتب البراء لتجارة المواد الإنشائية</p>
        <h1 id="page-title">نظام إدارة التجارة</h1>
        <div className="divider" aria-hidden="true" />
        <p className="status-message">جارٍ تجهيز قسم إدارة الزبائن</p>
      </section>
    </main>
  )
}

export default App
