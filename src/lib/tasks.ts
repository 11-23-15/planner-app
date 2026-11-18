import type { SupabaseClient } from '@supabase/supabase-js'
import type { Priority, Task } from '../types'

export async function listTasks(client: SupabaseClient, userId: string, date: string) {
  const { data, error } = await client
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('task_date', date)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as Task[]
}

export async function createTask(
  client: SupabaseClient,
  userId: string,
  task: { title: string; task_date: string; priority: Priority },
) {
  const { data, error } = await client
    .from('tasks')
    .insert({ ...task, user_id: userId })
    .select('*')
    .single()

  if (error) throw error
  return data as Task
}

export async function updateTask(
  client: SupabaseClient,
  taskId: string,
  changes: Partial<Pick<Task, 'title' | 'priority' | 'completed'>>,
) {
  const { data, error } = await client
    .from('tasks')
    .update(changes)
    .eq('id', taskId)
    .select('*')
    .single()

  if (error) throw error
  return data as Task
}

export async function deleteTask(client: SupabaseClient, taskId: string) {
  const { error } = await client.from('tasks').delete().eq('id', taskId)
  if (error) throw error
}
