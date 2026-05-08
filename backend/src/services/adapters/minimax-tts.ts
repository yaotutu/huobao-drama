/**
 * MiniMax 语音合成（TTS）Adapter
 * API: POST /v1/t2a_v2
 * 响应: { data: { audio: "<hex>", status: 2 }, ... }
 */
import type { TTSProviderAdapter } from './types'
import { joinProviderUrl, checkMiniMaxError } from './url'

export interface TTSParams {
  text: string
  voice: string
  speed?: number
  model?: string
  emotion?: string
}

export interface TTSResult {
  audioHex: string
  audioLength: number
  sampleRate: number
  bitrate: number
  format: string
  channel: number
}

export class MiniMaxTTSAdapter implements TTSProviderAdapter {
  readonly provider = 'minimax'

  buildGenerateRequest(config: any, params: TTSParams): {
    url: string
    method: string
    headers: Record<string, string>
    body: any
  } {
    const url = joinProviderUrl(config.baseUrl, '/v1', '/t2a_v2')

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    }

    const body: any = {
      model: params.model || 'speech-2.8-hd',
      text: params.text,
      stream: false,
      voice_setting: {
        voice_id: params.voice,
        speed: params.speed ?? 1,
        vol: 1,
        pitch: 0,
        emotion: params.emotion || 'happy',
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1,
      },
      subtitle_enable: false,
    }

    return { url, method: 'POST', headers, body }
  }

  parseResponse(result: any): TTSResult {
    checkMiniMaxError(result)

    const data = result.data
    if (!data?.audio) {
      throw new Error('No audio data in response')
    }

    const info = result.extra_info
    return {
      audioHex: data.audio,
      audioLength: info?.audio_length || 0,
      sampleRate: info?.audio_sample_rate || 32000,
      bitrate: info?.bitrate || 128000,
      format: info?.audio_format || 'mp3',
      channel: info?.audio_channel || 1,
    }
  }
}
