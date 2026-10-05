export function RepositoryStatus({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (loading) return <p role="status">جارٍ تحميل البيانات...</p>
  if (error) return <div role="alert"><p>{error}</p><button className="button button--secondary" type="button" onClick={onRetry}>إعادة المحاولة</button></div>
  return null
}
