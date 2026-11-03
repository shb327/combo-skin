import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ADMIN = join(import.meta.dirname, '..')
const SNAPSHOT = join(ADMIN, '..', 'api', 'openapi.json')
const TYPES = join(ADMIN, 'src', 'api', 'schema.d.ts')

function run(...args: string[]) {
  return spawnSync(process.execPath, ['scripts/api-types.mjs', ...args], {
    cwd: ADMIN,
    encoding: 'utf8',
  })
}

describe('api:types', () => {
  it('the committed types match the snapshot', () => {
    const result = run('--check')
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })

  it('fails when the snapshot changes, and regenerating fixes it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'api-types-'))
    const schema = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
    schema.components.schemas.AdminOut.properties.extra = { type: 'string', title: 'Extra' }
    const input = join(dir, 'openapi.json')
    writeFileSync(input, JSON.stringify(schema))
    const output = join(dir, 'schema.d.ts')
    writeFileSync(output, readFileSync(TYPES, 'utf8'))

    const stale = run('--check', '--input', input, '--output', output)
    expect(stale.status).toBe(1)
    expect(stale.stderr).toContain('schema.d.ts')

    expect(run('--input', input, '--output', output).status).toBe(0)
    expect(readFileSync(output, 'utf8')).toContain('extra?: string')
    expect(run('--check', '--input', input, '--output', output).status).toBe(0)
  })
})
