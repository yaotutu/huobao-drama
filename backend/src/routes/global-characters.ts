import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, now } from '../utils/response.js'
import { generateImage } from '../services/image-generation.js'
import { getTextConfig } from '../services/ai.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

// GET /global-characters — 列表
app.get('/', async (c) => {
  const chars = db.select().from(schema.globalCharacters).orderBy(schema.globalCharacters.createdAt).all()
  return success(c, chars)
})

// POST /global-characters — 创建，AI 生成外观和性格描述
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.name?.trim()) return badRequest(c, 'name is required')
  const ts = now()

  let appearance = body.appearance || ''
  let personality = body.personality || ''

  // 如果没有提供外观/性格描述，调用 LLM 生成
  if (!appearance || !personality) {
    try {
      const textConfig = getTextConfig()
      const keywords = body.keywords || body.role || ''

      const prompt = `角色名：${body.name.trim()}${keywords ? '，关键词：' + keywords : ''}

请根据角色名和关键词，生成一个角色的外观描述和性格特点。

要求：
- appearance：详细描述发型、发色、面部特征、服装风格、体态等外貌特征，60-100字，中文
- personality：描述性格特点、气质、行为习惯，30-60字，中文

只返回 JSON，格式如下，不要添加任何其他内容：
{"appearance":"...","personality":"..."}`

      const modelName = textConfig.model
      const baseURL = textConfig.baseUrl.replace(/\/$/, '') + '/v1'

      const resp = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${textConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 500,
        }),
      })
      const json = await resp.json() as any
      const text = json.choices?.[0]?.message?.content || ''

      try {
        const parsed = JSON.parse(text.trim())
        appearance = appearance || parsed.appearance || ''
        personality = personality || parsed.personality || ''
      } catch {
        logTaskError('GlobalCharacter', 'parse-llm-response', { raw: text.slice(0, 200) })
      }
    } catch (err: any) {
      logTaskError('GlobalCharacter', 'llm-generate', { error: err.message })
    }
  }

  const res = db.insert(schema.globalCharacters).values({
    name: body.name.trim(),
    role: body.role || '',
    description: body.description || '',
    appearance,
    personality,
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
  const allowedKeys = ['Name', 'role', 'description', 'appearance', 'personality', 'imageUrl', 'localPath', 'referenceImages', 'imageConfigId']
  const snakeMap: Record<string, string> = {
    Name: 'name', description: 'description', appearance: 'appearance',
    personality: 'personality', imageUrl: 'image_url', localPath: 'local_path',
    referenceImages: 'reference_images', imageConfigId: 'image_config_id', role: 'role',
  }
  for (const key of allowedKeys) {
    const snakeKey = snakeMap[key]
    if (snakeKey in body) {
      updates[key === 'Name' ? 'name' : key] = snakeKey === 'reference_images'
        ? JSON.stringify(body[snakeKey])
        : body[snakeKey]
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

// POST /global-characters/:id/generate-variations — 生成多角度形象
app.post('/:id/generate-variations', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [char] = db.select().from(schema.globalCharacters).where(eq(schema.globalCharacters.id, id)).all()
  if (!char) return badRequest(c, 'Character not found')

  const angles: string[] = body.angles || []
  if (!angles.length) return badRequest(c, 'angles is required')

  let referenceImages: string[] | undefined
  if (char.referenceImages) {
    try { referenceImages = JSON.parse(char.referenceImages) } catch {}
  }
  if (!referenceImages?.length) return badRequest(c, '请先上传参考图并锁定基准图')

  const anglePrompts: Record<string, string> = {
    front: '正面视角，标准头像照，纯净背景',
    side: '侧面视角，3/4侧脸角度',
    closeup: '面部特写，高清五官细节',
    full_body: '全身照，完整人物造型',
    half: '半身照，腰部以上',
    emotion: '情绪特写，表情丰富，传达情感',
  }

  const results: { angle: string; image_generation_id: number }[] = []
  for (const angle of angles) {
    const angleHint = anglePrompts[angle] || angle
    const prompt = `${char.name}, ${char.appearance || char.description || ''}, ${angleHint}, 高质量, 电影感`
    try {
      logTaskStart('GlobalCharacterVariation', angle, { characterId: id, prompt })
      const genId = await generateImage({
        characterId: id,
        prompt,
        referenceImages,
        configId: body.image_config_id || char.imageConfigId || undefined,
      })
      results.push({ angle, image_generation_id: genId })
      logTaskSuccess('GlobalCharacterVariation', angle, { characterId: id, genId })
    } catch (err: any) {
      logTaskError('GlobalCharacterVariation', angle, { error: err.message })
    }
  }

  return success(c, { count: results.length, results })
})

export default app
