import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, now } from '../utils/response.js'
import { generateImage } from '../services/image-generation.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

// GET /global-characters — 列表
app.get('/', async (c) => {
  const chars = db.select().from(schema.globalCharacters).orderBy(schema.globalCharacters.createdAt).all()
  return success(c, chars)
})

// POST /global-characters — 创建
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.name?.trim()) return badRequest(c, 'name is required')
  const ts = now()
  const res = db.insert(schema.globalCharacters).values({
    name: body.name.trim(),
    role: body.role || '',
    description: body.description || '',
    appearance: body.appearance || '',
    personality: body.personality || '',
    referenceImages: body.reference_images ? JSON.stringify(body.reference_images) : null,
    imageConfigId: body.image_config_id || null,
    createdAt: ts,
    updatedAt: ts,
  }).run()
  const id = Number(res.lastInsertRowid)
  const [created] = db.select().from(schema.globalCharacters).where(eq(schema.globalCharacters.id, id)).all()
  return success(c, created)
})

// PUT /global-characters/:id — 更新
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [existing] = db.select().from(schema.globalCharacters).where(eq(schema.globalCharacters.id, id)).all()
  if (!existing) return badRequest(c, 'Character not found')

  const updates: Record<string, any> = { updatedAt: now() }
  const allowedKeys = ['name', 'role', 'description', 'appearance', 'personality', 'imageUrl', 'localPath', 'referenceImages', 'imageConfigId']
  for (const key of allowedKeys) {
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
    if (snakeKey in body) {
      updates[key] = snakeKey === 'reference_images' ? JSON.stringify(body[snakeKey]) : body[snakeKey]
    } else if (key in body) {
      updates[key] = key === 'referenceImages' ? JSON.stringify(body[key]) : body[key]
    }
  }
  db.update(schema.globalCharacters).set(updates).where(eq(schema.globalCharacters.id, id)).run()
  return success(c)
})

// DELETE /global-characters/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  db.delete(schema.globalCharacters).where(eq(schema.globalCharacters.id, id)).run()
  return success(c)
})

// POST /global-characters/:id/generate-image — 生成角色形象
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [char] = db.select().from(schema.globalCharacters).where(eq(schema.globalCharacters.id, id)).all()
  if (!char) return badRequest(c, 'Character not found')

  const prompt = `${char.name}, ${char.appearance || char.description || '人物立绘'}, 高质量, 正面, 白色背景`
  let referenceImages: string[] | undefined
  if (char.referenceImages) {
    try { referenceImages = JSON.parse(char.referenceImages) } catch {}
  }

  try {
    logTaskStart('GlobalCharacterImage', 'generate', { characterId: id, prompt })
    // 使用角色指定的 imageConfigId，或 system default
    const genId = await generateImage({
      characterId: id,
      prompt,
      referenceImages,
      configId: body.image_config_id || char.imageConfigId || undefined,
    })
    logTaskSuccess('GlobalCharacterImage', 'generate', { characterId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (err: any) {
    logTaskError('GlobalCharacterImage', 'generate', { characterId: id, error: err.message })
    return badRequest(c, err.message)
  }
})

export default app
