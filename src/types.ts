export type Priority = 'urgent' | 'secondary' | 'later'

export type Task = {
  id: string
  user_id: string
  title: string
  task_date: string
  priority: Priority
  completed: boolean
  created_at: string
}

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'urgent', label: 'Срочно' },
  { value: 'secondary', label: 'Второстепенно' },
  { value: 'later', label: 'Можно потом' },
]
