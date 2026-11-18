import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { createTask, deleteTask, listTasks, updateTask } from './lib/tasks'
import { supabase } from './lib/supabase'
import { PRIORITIES, type Priority, type Task } from './types'

const todayISO = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const asDate = (value: string) => new Date(`${value}T12:00:00`)
const toISO = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`

function formatDay(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(asDate(value))
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const client = supabase

  useEffect(() => {
    if (!client) {
      setReady(true)
      return
    }

    let alive = true
    client.auth.getSession().then(({ data }) => {
      if (alive) {
        setSession(data.session)
        setReady(true)
      }
    })
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setReady(true)
    })

    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [client])

  if (!ready) return <div className="loading-screen">Открываю планер…</div>
  if (!client) return <SetupScreen />
  if (!session) return <AuthScreen client={client} />
  return <Planner client={client} session={session} />
}

function SetupScreen() {
  return (
    <main className="setup-screen">
      <div className="setup-card">
        <div className="brand-mark" aria-hidden="true">Д</div>
        <p className="eyebrow">ПЛАНЕР НА КАЖДЫЙ ДЕНЬ</p>
        <h1>Остался один шаг</h1>
        <p>Чтобы задачи хранились в облаке и открывались на разных устройствах, подключи проект Supabase.</p>
        <ol>
          <li>Создай проект в Supabase.</li>
          <li>Скопируй <code>.env.example</code> в <code>.env</code>.</li>
          <li>Впиши URL проекта и publishable key, затем выполни <code>supabase/schema.sql</code>.</li>
        </ol>
        <p className="setup-note">Пока настройка не завершена, приложение не сохраняет задачи на этом устройстве.</p>
      </div>
    </main>
  )
}

function AuthScreen({ client }: { client: SupabaseClient }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (mode === 'login') {
        const { error: authError } = await client.auth.signInWithPassword({ email, password })
        if (authError) throw authError
      } else {
        const { data, error: authError } = await client.auth.signUp({ email, password })
        if (authError) throw authError
        if (!data.session) setMessage('Проверь почту и подтверди регистрацию, затем войди в аккаунт.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось выполнить вход. Попробуй ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">Д</div>
        <p className="eyebrow">ТВОЙ СПОКОЙНЫЙ ПЛАН</p>
        <h1>{mode === 'login' ? 'С возвращением' : 'Создай аккаунт'}</h1>
        <p className="auth-intro">Войди, чтобы видеть свои задачи на любом устройстве.</p>
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="email">Электронная почта</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="password">Пароль</label>
          <input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} />
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="form-success" role="status">{message}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? 'Подожди…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
        </form>
        <button className="text-button auth-switch" type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage('') }}>
          {mode === 'login' ? 'Первый раз здесь? Создать аккаунт' : 'Уже есть аккаунт? Войти'}
        </button>
        <p className="privacy-note"><span aria-hidden="true">✳</span> Твои задачи доступны только твоему аккаунту.</p>
      </section>
    </main>
  )
}

function Planner({ client, session }: { client: SupabaseClient; session: Session }) {
  const [selectedDate, setSelectedDate] = useState(todayISO)
  const [tasks, setTasks] = useState<Task[]>([])
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Priority>('urgent')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    listTasks(client, session.user.id, selectedDate)
      .then((rows) => { if (alive) setTasks(rows) })
      .catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить задачи.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [client, session.user.id, selectedDate])

  const completedCount = tasks.filter((task) => task.completed).length
  const progress = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0
  const counts = useMemo(() => ({
    urgent: tasks.filter((task) => task.priority === 'urgent' && !task.completed).length,
    secondary: tasks.filter((task) => task.priority === 'secondary' && !task.completed).length,
    later: tasks.filter((task) => task.priority === 'later' && !task.completed).length,
  }), [tasks])
  const sortedTasks = useMemo(() => [...tasks].sort((a, b) => {
    const order: Record<Priority, number> = { urgent: 0, secondary: 1, later: 2 }
    return Number(a.completed) - Number(b.completed) || order[a.priority] - order[b.priority] || a.created_at.localeCompare(b.created_at)
  }), [tasks])

  function shiftDay(amount: number) {
    const next = asDate(selectedDate)
    next.setDate(next.getDate() + amount)
    setSelectedDate(toISO(next))
  }

  async function addTask(event: FormEvent) {
    event.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle || busy) return
    setBusy(true)
    setError('')
    try {
      const created = await createTask(client, session.user.id, { title: cleanTitle, task_date: selectedDate, priority })
      setTasks((current) => [...current, created])
      setTitle('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить задачу.')
    } finally {
      setBusy(false)
    }
  }

  async function changeTask(taskId: string, changes: Partial<Pick<Task, 'title' | 'priority' | 'completed'>>) {
    setError('')
    try {
      const updated = await updateTask(client, taskId, changes)
      setTasks((current) => current.map((task) => task.id === taskId ? updated : task))
      setEditingId(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось обновить задачу.')
    }
  }

  async function removeTask(taskId: string) {
    setError('')
    try {
      await deleteTask(client, taskId)
      setTasks((current) => current.filter((task) => task.id !== taskId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось удалить задачу.')
    }
  }

  async function signOut() {
    const { error: authError } = await client.auth.signOut()
    if (authError) setError(authError.message)
  }

  const today = todayISO()

  return (
    <main className="planner-shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="День — к началу страницы"><span className="brand-mark small" aria-hidden="true">Д</span><span>день<span className="wordmark-dot">.</span></span></a>
        <div className="topbar-right"><span className="account-email">{session.user.email}</span><button className="text-button signout-button" onClick={signOut}>Выйти</button></div>
      </header>

      <div className="planner-content" id="top">
        <section className="day-heading">
          <div>
            <p className="eyebrow">ТВОЙ ПЛАН НА ДЕНЬ</p>
            <h1>{selectedDate === today ? 'Сегодня' : formatDay(selectedDate)}</h1>
            <p className="date-subtitle">{selectedDate === today ? formatDay(selectedDate) : 'Выбранный день'}</p>
          </div>
          <div className="date-controls" aria-label="Выбор даты">
            <button className="icon-button" type="button" aria-label="Предыдущий день" onClick={() => shiftDay(-1)}>‹</button>
            <input type="date" value={selectedDate} onChange={(event) => { if (event.target.value) setSelectedDate(event.target.value) }} aria-label="Выбрать дату" />
            <button className="icon-button" type="button" aria-label="Следующий день" onClick={() => shiftDay(1)}>›</button>
            {selectedDate !== today && <button className="today-button" type="button" onClick={() => setSelectedDate(today)}>Сегодня</button>}
          </div>
        </section>

        <section className="summary-card" aria-label="Прогресс за день">
          <div className="summary-copy">
            <p className="eyebrow">МАЛЕНЬКИЕ ШАГИ — ТОЖЕ ПРОГРЕСС</p>
            <h2>{tasks.length === 0 ? 'Начни с одного дела' : completedCount === tasks.length ? 'Ты всё сделала!' : 'День в движении'}</h2>
            <p>{tasks.length === 0 ? 'Добавь задачу, и план на день начнёт складываться.' : `Выполнено ${completedCount} из ${tasks.length} ${tasks.length === 1 ? 'дела' : 'дел'}.`}</p>
          </div>
          <div className="progress-ring" role="img" aria-label={`Выполнено ${progress}% задач за день`}>
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle className="ring-track" cx="60" cy="60" r="48" />
              <circle className="ring-value" cx="60" cy="60" r="48" strokeDasharray={2 * Math.PI * 48} strokeDashoffset={2 * Math.PI * 48 * (1 - progress / 100)} />
            </svg>
            <span className="ring-label"><strong>{progress}%</strong><small>готово</small></span>
          </div>
        </section>

        <div className="content-grid">
          <section className="task-panel" aria-labelledby="task-heading">
            <div className="panel-heading">
              <div><p className="eyebrow">СПИСОК</p><h2 id="task-heading">Мои дела <span className="task-total">{tasks.length}</span></h2></div>
              <span className="day-stamp">{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(asDate(selectedDate))}</span>
            </div>

            <form className="add-task-form" onSubmit={addTask}>
              <label className="visually-hidden" htmlFor="new-task">Новая задача</label>
              <input id="new-task" maxLength={200} placeholder="Что важно сделать?" value={title} onChange={(event) => setTitle(event.target.value)} />
              <label className="visually-hidden" htmlFor="new-priority">Приоритет</label>
              <select id="new-priority" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
                {PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <button className="primary-button add-button" type="submit" disabled={busy || !title.trim()}><span aria-hidden="true">+</span> Добавить</button>
            </form>

            {error && <div className="error-banner" role="alert">{error}</div>}
            {loading ? <div className="empty-state"><span className="loader-dot" /> Загружаю список…</div> : tasks.length === 0 ? (
              <div className="empty-state"><div className="empty-illustration" aria-hidden="true">✳</div><strong>Пока всё чисто</strong><span>Добавь первое дело — и оно будет ждать здесь.</span></div>
            ) : (
              <ul className="task-list">
                {sortedTasks.map((task) => <li className={`task-row ${task.completed ? 'is-complete' : ''}`} key={task.id}>
                  <button className={`check-button ${task.completed ? 'checked' : ''}`} type="button" aria-label={task.completed ? `Снять отметку: ${task.title}` : `Отметить выполненной: ${task.title}`} onClick={() => changeTask(task.id, { completed: !task.completed })}>
                    {task.completed && <span aria-hidden="true">✓</span>}
                  </button>
                  <div className="task-main">
                    {editingId === task.id ? <form className="edit-form" onSubmit={(event) => { event.preventDefault(); if (editingTitle.trim()) changeTask(task.id, { title: editingTitle.trim() }) }}>
                      <input autoFocus maxLength={200} value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} aria-label="Изменить название задачи" />
                      <button className="text-button" type="submit">Сохранить</button>
                      <button className="text-button muted" type="button" onClick={() => setEditingId(null)}>Отмена</button>
                    </form> : <span className="task-title">{task.title}</span>}
                    <span className={`priority-label priority-${task.priority}`}><i aria-hidden="true" />{PRIORITIES.find((item) => item.value === task.priority)?.label}</span>
                  </div>
                  <div className="task-actions">
                    <button className="icon-button subtle" type="button" aria-label={`Изменить задачу: ${task.title}`} onClick={() => { setEditingId(task.id); setEditingTitle(task.title) }}>✎</button>
                    <button className="icon-button subtle delete-button" type="button" aria-label={`Удалить задачу: ${task.title}`} onClick={() => removeTask(task.id)}>×</button>
                  </div>
                </li>)}
              </ul>
            )}
            {!loading && tasks.length > 0 && <p className="list-footnote">Изменения сохраняются в твоём аккаунте.</p>}
          </section>

          <aside className="priority-panel" aria-labelledby="priority-heading">
            <p className="eyebrow">ФОКУС ДНЯ</p>
            <h2 id="priority-heading">По приоритету</h2>
            <div className="priority-count priority-count-urgent"><span className="priority-symbol">!</span><span>Срочно</span><strong>{counts.urgent}</strong></div>
            <div className="priority-count priority-count-secondary"><span className="priority-symbol">↗</span><span>Второстепенно</span><strong>{counts.secondary}</strong></div>
            <div className="priority-count priority-count-later"><span className="priority-symbol">·</span><span>Можно потом</span><strong>{counts.later}</strong></div>
            <div className="aside-note"><span aria-hidden="true">✳</span><p>Не обязательно успеть всё. Выбери одно важное дело и начни с него.</p></div>
          </aside>
        </div>
        <footer className="planner-footer"><span>Сделано бережно</span><span className="footer-star" aria-hidden="true">✳</span><span>для твоего дня</span></footer>
      </div>
    </main>
  )
}

export default App
