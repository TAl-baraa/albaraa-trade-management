import { useCallback, useEffect, useRef, useState } from 'react'
import { repositoryError } from '../repositories/tauriBridge'

export function useRepositoryList<T>(load: () => Promise<T[]>) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const reload = useCallback(async () => {
    const request = ++generation.current
    setLoading(true)
    try {
      const next = await load()
      if (request === generation.current) { setItems(next); setError(null) }
    } catch (reason) {
      if (request === generation.current) setError(repositoryError(reason))
    } finally { if (request === generation.current) setLoading(false) }
  }, [load])
  const invalidate = useCallback(() => { generation.current++ }, [])
  useEffect(() => { void reload(); return invalidate }, [reload, invalidate])
  return { items, setItems, loading, error, reload }
}
