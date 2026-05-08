/**
 * MiniMax 图片生成 Adapter
 */
import type {
  ImageProviderAdapter,
  ProviderRequest,
  AIConfig,
  ImageGenerationRecord,
  ImageGenResponse,
  ImagePollResponse,
} from './types'
import { joinProviderUrl, gcd, checkMiniMaxError } from './url'

export class MiniMaxImageAdapter implements ImageProviderAdapter {
  provider = 'minimax'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const body: any = {
      model: record.model || config.model,
      prompt: record.prompt,
      n: 1,
    }

    // MiniMax subject_reference（参考图，用于角色一致性）
    if (record.referenceImages) {
      try {
        const refs = JSON.parse(record.referenceImages)
        if (refs.length > 0) {
          body.subject_reference = [{
            type: 'character',
            image_file: refs[0],
          }]
        }
      } catch {}
    }

    // aspect_ratio：MiniMax 要求简化比例，如 "16:9"
    if (record.size) {
      const [ws, hs] = record.size.split('x')
      if (ws && hs) {
        const w = Number(ws), h = Number(hs)
        const g = gcd(w, h)
        body.aspect_ratio = `${w / g}:${h / g}`
      }
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/image_generation'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    checkMiniMaxError(result)
    const imageUrl = this.extractImageUrl(result)
    if (imageUrl) {
      return { isAsync: false, imageUrl }
    }
    const taskId = result.task_id || result.id || result.data?.id
    if (taskId) {
      return { isAsync: true, taskId }
    }
    throw new Error(`No image URL or task_id in response: ${JSON.stringify(result).slice(0, 200)}`)
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/v1', `/image_generation/task/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): ImagePollResponse {
    checkMiniMaxError(result)
    const imageUrl = this.extractImageUrl(result)
    if (imageUrl) {
      return { status: 'completed', imageUrl }
    }
    const rawStatus = result.status || result.state || result.data?.status
    if (rawStatus === 'failed' || rawStatus === 'error') {
      return { status: 'failed', error: result.error_msg || result.data?.error_msg || result.error || 'Generation failed' }
    }
    return { status: 'processing' }
  }

  extractImageUrl(result: any): string | null {
    return result.data?.image_urls?.[0]
      || result.data?.image_url
      || result.image_url
      || result.data?.url
      || result.url
      || null
  }

  extractImageBase64(result: any): { data: string; mimeType: string } | null {
    return null
  }
}
