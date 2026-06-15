import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const table = 'founder_os_records'

function loadEnvFile() {
  try {
    const envPath = resolve(process.cwd(), '.env')
    const content = readFileSync(envPath, 'utf8')
    content.split('\n').forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const index = trimmed.indexOf('=')
      if (index === -1) return
      const key = trimmed.slice(0, index).trim()
      const value = trimmed.slice(index + 1).trim()
      if (!process.env[key]) process.env[key] = value
    })
  } catch {
    // .env is optional if vars are already exported
  }
}

async function deleteAllRecords(client, label) {
  const { data, error: selectError } = await client
    .from(table)
    .select('id, module_key, record')

  if (selectError) {
    throw new Error(`${label} select failed: ${selectError.message}`)
  }

  const rows = data || []
  if (!rows.length) {
    console.log(`${label}: table is already empty.`)
    return 0
  }

  const { error: deleteError } = await client
    .from(table)
    .delete()
    .in('id', rows.map((row) => row.id))

  if (deleteError) {
    throw new Error(`${label} delete failed: ${deleteError.message}`)
  }

  const summary = rows.reduce((acc, row) => {
    acc[row.module_key] = (acc[row.module_key] || 0) + 1
    return acc
  }, {})

  console.log(`${label}: deleted ${rows.length} rows`)
  Object.entries(summary).forEach(([moduleKey, count]) => {
    console.log(`  - ${moduleKey}: ${count}`)
  })

  return rows.length
}

async function main() {
  loadEnvFile()

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const email = process.env.FOUNDER_SUPABASE_EMAIL
  const password = process.env.FOUNDER_SUPABASE_PASSWORD

  if (!url) {
    throw new Error('Missing VITE_SUPABASE_URL in .env')
  }

  if (serviceRoleKey) {
    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    await deleteAllRecords(admin, 'Service role wipe')
    return
  }

  if (!anonKey) {
    throw new Error('Missing VITE_SUPABASE_ANON_KEY in .env')
  }

  if (!email || !password) {
    throw new Error(
      'Add SUPABASE_SERVICE_ROLE_KEY or FOUNDER_SUPABASE_EMAIL + FOUNDER_SUPABASE_PASSWORD to .env, then rerun npm run supabase:clear',
    )
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) {
    throw new Error(`Sign in failed: ${signInError.message}`)
  }

  await deleteAllRecords(client, 'Authenticated wipe')
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
