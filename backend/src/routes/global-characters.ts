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

  let referenceImages: string[] | undefined
  if (char.referenceImages) {
    try { referenceImages = JSON.parse(char.referenceImages) } catch {}
  }

  // 构建丰富的提示词：从 appearance 展开为详细英文描述
  const basePrompt = buildCharacterPortraitPrompt(char.name, char.appearance || '', char.personality || '')
  // 随机 seed 保证重新生成有变化
  const seed = Math.floor(Math.random() * 999999999)
  const negativePrompt = 'blurry, low quality, watermark, text, logo, signature, deformed face, bad anatomy'

  try {
    logTaskStart('GlobalCharacterImage', 'generate', { characterId: id, seed, prompt: basePrompt })
    const genId = await generateImage({
      characterId: id,
      prompt: basePrompt,
      referenceImages,
      seed,
      negativePrompt,
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

  const negativePrompt = 'blurry, low quality, watermark, text, logo, signature, deformed face, bad anatomy'
  const baseDesc = buildCharacterPortraitPrompt(char.name, char.appearance || '', char.personality || '')

  const results: { angle: string; image_generation_id: number }[] = []
  for (const angle of angles) {
    const anglePrompt = buildAnglePrompt(angle, baseDesc)
    const seed = Math.floor(Math.random() * 999999999)
    try {
      logTaskStart('GlobalCharacterVariation', angle, { characterId: id, seed, prompt: anglePrompt })
      const genId = await generateImage({
        characterId: id,
        prompt: anglePrompt,
        referenceImages,
        seed,
        negativePrompt,
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

// ─── 提示词构建辅助 ────────────────────────────────────────

function buildCharacterPortraitPrompt(name: string, appearance: string, personality: string): string {
  const parts: string[] = []

  // 名字作为角色标识
  if (name) parts.push(`character: ${name}`)

  // 将外观描述展开为英文视觉描述
  if (appearance) {
    // 把中文外观描述转成英文提示词（简洁翻译 + 扩展）
    const expanded = expandAppearance(appearance)
    parts.push(expanded)
  }

  // 性格带来的气质
  if (personality) {
    parts.push(mapPersonalityToStyle(personality))
  }

  // 通用质量要求
  parts.push('cinematic portrait, high detail, sharp focus, studio lighting, film grain, 8k quality')

  return parts.join(', ')
}

function expandAppearance(appearance: string): string {
  // 将常见中文外观词汇映射为英文提示词片段
  const mappings: [string, string][] = [
    ['短发', 'short hair'], ['长发', 'long hair'], ['卷发', 'curly hair'], ['直发', 'straight hair'],
    ['黑发', 'black hair'], ['棕发', 'brown hair'], ['金发', 'blonde hair'], ['白发', 'white hair'],
    ['蓝色眼睛', 'blue eyes'], ['棕色眼睛', 'brown eyes'], ['绿色眼睛', 'green eyes'], ['黑色眼睛', 'dark eyes'],
    ['大眼睛', 'large eyes'], ['高鼻梁', 'high nose bridge'], ['薄唇', 'thin lips'], ['厚唇', 'full lips'],
    ['瓜子脸', 'oval face shape'], ['圆脸', 'round face shape'], ['方脸', 'square jaw'],
    ['微笑', 'slight smile'], ['严肃', 'serious expression'], ['冷峻', 'cold expression'],
    ['白皙', 'fair skin'], ['古铜色', 'tan skin'], ['黝黑', 'dark skin'],
    ['西装', 'business suit'], ['休闲', 'casual clothing'], ['古装', 'traditional costume'],
    ['T恤', 't-shirt'], ['牛仔裤', 'jeans'], ['连衣裙', 'dress'],
    ['高大', 'tall'], ['苗条', 'slim'], ['健壮', 'muscular'], ['微胖', 'slightly overweight'],
    ['戴眼镜', 'wearing glasses'], ['戴帽子', 'wearing hat'], ['长发披肩', 'long hair flowing over shoulders'],
  ]

  let result = appearance
  for (const [cn, en] of mappings) {
    result = result.replace(new RegExp(cn, 'g'), en)
  }

  // 如果没有匹配到任何词汇，用原文描述
  if (result === appearance) {
    return `detailed portrait of person, ${appearance}`
  }
  return result
}

function mapPersonalityToStyle(personality: string): string {
  const p = personality.toLowerCase()
  if (p.includes('温柔') || p.includes('柔')) return 'warm gentle atmosphere, soft lighting'
  if (p.includes('冷酷') || p.includes('冷峻') || p.includes('霸道')) return 'cold serious atmosphere, dramatic lighting'
  if (p.includes('活泼') || p.includes('开朗') || p.includes('阳光')) return 'bright cheerful atmosphere, natural light'
  if (p.includes('忧郁') || p.includes('悲伤')) return 'melancholic atmosphere, muted tones, soft shadows'
  if (p.includes('神秘')) return 'mysterious atmosphere, dramatic shadows, cinematic'
  if (p.includes('成熟')) return 'mature sophisticated atmosphere, elegant'
  if (p.includes('青春') || p.includes('年轻')) return 'youthful fresh atmosphere, bright'
  return 'cinematic quality, film photography'
}

const angleConfigs: Record<string, { pose: string; lighting: string; framing: string }> = {
  front:   { pose: 'front-facing, looking at camera, relaxed posture', lighting: 'soft frontal studio light', framing: 'head and shoulders portrait' },
  side:    { pose: '3/4 turned to side, gazing into distance', lighting: 'side rim light, moody', framing: 'head and shoulders' },
  closeup: { pose: 'close-up on face, slight head tilt', lighting: 'high key beauty light, even skin tones', framing: 'face filling frame, eyes in focus' },
  full_body: { pose: 'standing full body, natural stance', lighting: 'full body studio lighting, even', framing: 'full body in frame, ample headroom' },
  half:    { pose: 'seated or waist-up framing', lighting: 'soft fill light, warm tones', framing: 'waist to head' },
  emotion: { pose: 'expressive close-up, capturing strong emotion', lighting: 'dramatic chiaroscuro lighting', framing: 'intimate close-up, eyes as focal point' },
}

function buildAnglePrompt(angle: string, baseDesc: string): string {
  const cfg = angleConfigs[angle]
  if (!cfg) return baseDesc
  return `${baseDesc}, ${cfg.pose}, ${cfg.lighting}, ${cfg.framing}, cinematic portrait, 8k`
}

export default app
