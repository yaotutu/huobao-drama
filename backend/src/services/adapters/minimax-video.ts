/**
 * MiniMax 视频生成 Adapter
 * API 格式：prompt 为顶层字段，图片用 first_frame_image / last_frame_image
 */
import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
} from './types'
import { joinProviderUrl, checkMiniMaxError } from './url'

export class MiniMaxVideoAdapter implements VideoProviderAdapter {
  provider = 'minimax'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const rawPrompt = (record.prompt || '').trim()
    if (!rawPrompt) {
      throw new Error('视频提示词不能为空，请先填写分镜的视频提示词')
    }

    // 首尾帧模式仅 MiniMax-Hailuo-02 支持，需确认模型兼容
    const model = record.model || config.model
    if (record.referenceMode === 'first_last' && model !== 'MiniMax-Hailuo-02') {
      throw new Error('首尾帧模式需要 MiniMax-Hailuo-02 模型，请确认你的套餐支持该模型，或改用单图模式')
    }
    const body: any = { model, prompt: rawPrompt }

    if (record.referenceMode === 'single' && record.imageUrl) {
      body.first_frame_image = record.imageUrl
    } else if (record.referenceMode === 'first_last') {
      if (record.firstFrameUrl) body.first_frame_image = record.firstFrameUrl
      if (record.lastFrameUrl) body.last_frame_image = record.lastFrameUrl
    } else if (record.referenceMode === 'multiple' && record.referenceImageUrls) {
      try {
        const refs = JSON.parse(record.referenceImageUrls)
        if (refs[0]) body.first_frame_image = refs[0]
      } catch {}
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/video_generation'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    checkMiniMaxError(result)
    const taskId = result.task_id || result.id || result.data?.id
    if (!taskId) {
      // 同步返回
      const videoUrl = result.video_url || result.data?.video_url || result.content?.video_url
      if (videoUrl) {
        return { isAsync: false, videoUrl }
      }
      throw new Error(`No task_id or video_url in response: ${JSON.stringify(result).slice(0, 200)}`)
    }
    return { isAsync: true, taskId }
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/query/video_generation') + '?task_id=' + taskId,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    try { checkMiniMaxError(result) } catch (e) { return { status: 'failed', error: (e as Error).message } }
    const status = result.status
    if (status === 'Success') {
      return { status: 'completed', fileId: result.file_id }
    }
    if (status === 'Fail') {
      return { status: 'failed', error: result.error_msg || 'Video generation failed' }
    }
    // Preparing, Queueing, Processing
    return { status: 'processing' }
  }

  buildFileRetrieveRequest(config: AIConfig, fileId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/files/retrieve') + '?file_id=' + fileId,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  extractVideoUrl(result: any): string | null {
    return null
  }
}
