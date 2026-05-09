<template>
  <div class="page" :class="{ 'panel-open': !!activeChar }">
    <!-- Character List View -->
    <template v-if="!activeChar">
      <div class="page-head">
        <div class="head-left">
          <h1 class="page-title">角色库</h1>
          <p class="page-desc">{{ chars.length }} 个角色</p>
        </div>
        <button class="btn btn-primary" @click="showCreate = true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          新建角色
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="loading-grid">
        <div v-for="i in 4" :key="i" class="skeleton-card card"></div>
      </div>

      <!-- Grid -->
      <div v-else class="grid">
        <div
          v-for="(c, i) in chars"
          :key="c.id"
          class="card char-card"
          :style="{ animationDelay: `${i * 0.05}s` }"
          @click="openChar(c)"
        >
          <div class="char-cover">
            <img v-if="c.image_url || c.imageUrl" :src="'/' + (c.image_url || c.imageUrl)" class="char-img" />
            <div v-else class="char-avatar-lg">{{ c.name?.[0] || '?' }}</div>
          </div>
          <div class="char-body">
            <div class="char-name">{{ c.name }}</div>
            <div class="char-role" v-if="c.role">{{ c.role }}</div>
            <div class="char-desc">{{ c.appearance || '暂无外观描述' }}</div>
          </div>
        </div>

        <div v-if="!chars.length" class="card empty-card" @click="showCreate = true">
          <div class="empty-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
              <circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/>
            </svg>
          </div>
          <p class="empty-title">创建第一个角色</p>
          <p class="empty-desc">上传参考图，AI 生成角色形象</p>
        </div>
      </div>
    </template>

    <!-- Character Detail View -->
    <template v-else>
      <div class="detail-topbar">
        <button class="btn btn-ghost" @click="activeChar = null">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          返回
        </button>
        <h2 class="detail-topbar-title">{{ activeChar.name }}</h2>
        <div class="detail-topbar-actions">
          <button class="btn btn-danger btn-sm" @click="deleteChar">删除</button>
        </div>
      </div>

      <div class="detail-body">
        <!-- Left: Info -->
        <div class="detail-col detail-col-info">
          <div class="card detail-card">
            <h3 class="detail-section-title">基本信息</h3>
            <div class="field">
              <span class="field-label">角色名</span>
              <input v-model="editForm.name" class="input" placeholder="角色名" />
            </div>
            <div class="field">
              <span class="field-label">定位</span>
              <input v-model="editForm.role" class="input" placeholder="主角 / 配角 / 旁白" />
            </div>
            <div class="field">
              <span class="field-label">外观描述 <span class="field-hint">(AI生成，可编辑)</span></span>
              <textarea v-model="editForm.appearance" class="input" rows="3" placeholder="AI 根据角色名和关键词自动生成"></textarea>
            </div>
            <div class="field">
              <span class="field-label">性格特点 <span class="field-hint">(AI生成，可编辑)</span></span>
              <textarea v-model="editForm.personality" class="input" rows="2" placeholder="AI 根据角色名和关键词自动生成"></textarea>
            </div>
            <button class="btn btn-primary" style="width:100%" :disabled="saving" @click="saveInfo">
              {{ saving ? '保存中...' : '保存信息' }}
            </button>
          </div>

          <!-- Reference Image Upload -->
          <div class="card detail-card">
            <h3 class="detail-section-title">参考图</h3>
            <div class="ref-grid">
              <div v-for="(ref, idx) in referenceImages" :key="idx" class="ref-thumb-wrap">
                <img :src="ref.startsWith('data:') ? ref : '/' + ref" class="ref-thumb" @click="lightbox = ref" />
                <button class="ref-del" @click="removeRef(idx)">×</button>
              </div>
              <label class="ref-add" v-if="referenceImages.length < 3">
                <input type="file" accept="image/*" class="hidden" @change="uploadRef" />
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>上传</span>
              </label>
            </div>
            <p class="field-hint" style="margin-top:6px">最多上传3张参考图，用于保持角色一致性</p>

            <!-- Generate Portrait -->
            <button
              class="btn btn-accent"
              style="width:100%;margin-top:12px"
              :disabled="generating || !referenceImages.length"
              @click="generatePortrait"
            >
              <svg v-if="generating" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              {{ generating ? '生成中...' : '生成形象图' }}
            </button>
          </div>
        </div>

        <!-- Center: Portrait -->
        <div class="detail-col detail-col-portrait">
          <div class="card portrait-card">
            <h3 class="detail-section-title">角色形象</h3>
            <div class="portrait-area">
              <img
                v-if="activeChar.image_url || activeChar.imageUrl"
                :src="'/' + (activeChar.image_url || activeChar.imageUrl)"
                class="portrait-img"
                @click="lightbox = '/' + (activeChar.image_url || activeChar.imageUrl)"
              />
              <div v-else class="portrait-placeholder">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
                  <rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
                <span>上传参考图后<br/>点击「生成形象图」</span>
              </div>
            </div>
            <div class="portrait-actions" v-if="activeChar.image_url || activeChar.imageUrl">
              <button class="btn btn-sm" :disabled="generating || !referenceImages.length" @click="generatePortrait">
                {{ generating ? '生成中...' : '重新生成' }}
              </button>
              <button class="btn btn-sm btn-accent" @click="lockPortrait" v-if="!isLocked">
                锁定为基准图
              </button>
              <span v-if="isLocked" class="lock-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                已锁定
              </span>
            </div>
          </div>
        </div>

        <!-- Right: Variations -->
        <div class="detail-col detail-col-variations">
          <div class="card detail-card">
            <h3 class="detail-section-title">多角度形象</h3>
            <template v-if="isLocked">
              <p class="field-hint" style="margin-bottom:10px">选择角度，生成该角色的不同视角形象</p>
              <div class="angle-grid">
                <label v-for="a in angleOptions" :key="a.value" class="angle-item" :class="{ selected: selectedAngles.includes(a.value) }">
                  <input type="checkbox" :value="a.value" v-model="selectedAngles" class="hidden" />
                  <span>{{ a.label }}</span>
                </label>
              </div>
              <button
                class="btn btn-accent"
                style="width:100%;margin-top:12px"
                :disabled="generatingVariations || !selectedAngles.length"
                @click="generateVariations"
              >
                {{ generatingVariations ? '生成中...' : '生成所选角度' }}
              </button>
              <div class="variations-grid" style="margin-top:16px">
                <div
                  v-for="(v, idx) in variationImages"
                  :key="idx"
                  class="variation-cell"
                  @click="lightbox = '/' + v"
                >
                  <img :src="'/' + v" class="variation-img" />
                </div>
                <div v-if="!variationImages.length" class="variations-empty">
                  <span>暂无多角度图<br/>请先生成</span>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="variations-locked-hint">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <p>锁定基准图后<br/>可生成多角度形象</p>
              </div>
            </template>
          </div>
        </div>
      </div>
    </template>

    <!-- Create Dialog -->
    <div v-if="showCreate" class="overlay" @click.self="showCreate = false">
      <div class="modal card" style="width:440px">
        <div class="modal-header">
          <h2 class="modal-title">新建角色</h2>
          <p class="modal-desc">输入角色名和关键词，AI 自动生成外观和性格描述</p>
        </div>
        <form @submit.prevent="createChar" class="modal-form">
          <label class="field">
            <span class="field-label">角色名 <span class="required">*</span></span>
            <input v-model="createForm.name" class="input" placeholder="例如：林浩" required autofocus />
          </label>
          <label class="field">
            <span class="field-label">关键词</span>
            <input v-model="createForm.keywords" class="input" placeholder="例如：帅气男主角、都市精英、30岁左右" />
          </label>
          <label class="field">
            <span class="field-label">定位</span>
            <input v-model="createForm.role" class="input" placeholder="主角 / 配角 / 旁白" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn" @click="showCreate = false">取消</button>
            <button type="submit" class="btn btn-primary" :disabled="creating">
              {{ creating ? 'AI 生成中...' : '创建并生成描述' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Lightbox -->
    <div v-if="lightbox" class="lightbox" @click="lightbox = null">
      <img :src="lightbox" class="lightbox-img" />
      <button class="lightbox-close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { globalCharacterAPI } from '~/composables/useApi'

const chars = ref([])
const loading = ref(false)
const showCreate = ref(false)
const activeChar = ref(null)
const creating = ref(false)
const saving = ref(false)
const generating = ref(false)
const generatingVariations = ref(false)
const lightbox = ref(null)

const createForm = ref({ name: '', keywords: '', role: '' })
const editForm = ref({ name: '', role: '', appearance: '', personality: '' })
const referenceImages = ref([])
const isLocked = ref(false)
const selectedAngles = ref([])
const variationImages = ref([])

const angleOptions = [
  { label: '正面', value: 'front' },
  { label: '侧面', value: 'side' },
  { label: '特写', value: 'closeup' },
  { label: '全身', value: 'full_body' },
  { label: '半身', value: 'half' },
  { label: '情绪', value: 'emotion' },
]

async function load() {
  loading.value = true
  try {
    const data = await globalCharacterAPI.list()
    chars.value = data || []
  } catch (e) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}

function openChar(c) {
  activeChar.value = c
  editForm.value = {
    name: c.name || '',
    role: c.role || '',
    appearance: c.appearance || '',
    personality: c.personality || '',
  }
  referenceImages.value = c.reference_images ? JSON.parse(c.reference_images) : []
  isLocked.value = !!(c.image_url || c.imageUrl)
  variationImages.value = []
  selectedAngles.value = []
}

async function createChar() {
  if (!createForm.value.name?.trim()) return
  creating.value = true
  try {
    const created = await globalCharacterAPI.create(createForm.value)
    chars.value.unshift(created)
    showCreate.value = false
    createForm.value = { name: '', keywords: '', role: '' }
    openChar(created)
    toast.success('角色已创建，AI 已生成描述')
  } catch (e) {
    toast.error(e.message)
  } finally {
    creating.value = false
  }
}

async function saveInfo() {
  if (!activeChar.value) return
  saving.value = true
  try {
    const updated = await globalCharacterAPI.update(activeChar.value.id, {
      name: editForm.value.name,
      role: editForm.value.role,
      appearance: editForm.value.appearance,
      personality: editForm.value.personality,
      reference_images: referenceImages.value,
    })
    const idx = chars.value.findIndex(c => c.id === activeChar.value.id)
    if (idx !== -1) chars.value[idx] = { ...chars.value[idx], ...updated }
    activeChar.value = { ...activeChar.value, ...editForm.value }
    toast.success('已保存')
  } catch (e) {
    toast.error(e.message)
  } finally {
    saving.value = false
  }
}

async function uploadRef(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const fd = new FormData()
  fd.append('file', file)
  try {
    const res = await fetch('/api/v1/upload/image', { method: 'POST', body: fd })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message || '上传失败')
    referenceImages.value.push(json.data.path)
    // Auto-save reference images
    await globalCharacterAPI.update(activeChar.value.id, { reference_images: referenceImages.value })
    toast.success('参考图已上传')
  } catch (e) {
    toast.error(e.message)
  }
  e.target.value = ''
}

function removeRef(idx) {
  referenceImages.value.splice(idx, 1)
  globalCharacterAPI.update(activeChar.value.id, { reference_images: referenceImages.value })
}

async function generatePortrait() {
  if (!activeChar.value || !referenceImages.value.length) return
  generating.value = true
  try {
    // Save info + refs first
    await globalCharacterAPI.update(activeChar.value.id, {
      ...editForm.value,
      reference_images: referenceImages.value,
    })
    await globalCharacterAPI.generateImage(activeChar.value.id)
    toast.success('形象生成中...')
    // Poll
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const updated = await globalCharacterAPI.list()
      const refreshed = (updated || []).find(c => c.id === activeChar.value.id)
      if (refreshed?.image_url || refreshed?.imageUrl) {
        const idx = chars.value.findIndex(c => c.id === activeChar.value.id)
        if (idx !== -1) chars.value[idx] = refreshed
        activeChar.value = refreshed
        toast.success('形象生成完成')
        return
      }
    }
    toast.error('生成超时，请稍后刷新')
  } catch (e) {
    toast.error(e.message)
  } finally {
    generating.value = false
  }
}

function lockPortrait() {
  isLocked.value = true
  toast.success('基准图已锁定，可以生成多角度形象了')
}

async function generateVariations() {
  if (!activeChar.value || !selectedAngles.value.length) return
  generatingVariations.value = true
  try {
    await globalCharacterAPI.generateVariations(activeChar.value.id, selectedAngles.value)
    toast.success('多角度生成中...')
    for (let i = 0; i < 80; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const updated = await globalCharacterAPI.list()
      const refreshed = (updated || []).find(c => c.id === activeChar.value.id)
      if (refreshed) {
        activeChar.value = refreshed
        const idx = chars.value.findIndex(c => c.id === activeChar.value.id)
        if (idx !== -1) chars.value[idx] = refreshed
      }
    }
    toast.info('部分角度可能生成较慢，请稍后刷新查看')
  } catch (e) {
    toast.error(e.message)
  } finally {
    generatingVariations.value = false
  }
}

async function deleteChar() {
  if (!activeChar.value) return
  if (!confirm(`确定删除角色「${activeChar.value.name}」？`)) return
  try {
    await globalCharacterAPI.delete(activeChar.value.id)
    chars.value = chars.value.filter(c => c.id !== activeChar.value.id)
    activeChar.value = null
    toast.success('已删除')
  } catch (e) {
    toast.error(e.message)
  }
}

onMounted(load)
</script>

<style scoped>
.page {
  padding: 28px 48px 40px;
  overflow-y: auto;
  height: 100%;
  animation: fadeUp 0.35s var(--ease-out) both;
}

/* List view */
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 28px;
}
.head-left { display: flex; flex-direction: column; gap: 4px; }
.page-title { font-family: var(--font-display); font-size: 26px; font-weight: 700; letter-spacing: -0.02em; color: var(--text-0); }
.page-desc { font-size: 13px; color: var(--text-3); }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }

.char-card {
  padding: 0; cursor: pointer; overflow: hidden;
  animation: fadeUp 0.4s var(--ease-out) both;
  transition: transform 0.22s, box-shadow 0.22s, border-color 0.2s;
}
.char-card:hover { border-color: var(--accent); box-shadow: var(--shadow-lg); transform: translateY(-3px); }
.char-cover { height: 180px; background: var(--bg-2); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.char-img { width: 100%; height: 100%; object-fit: cover; }
.char-avatar-lg { width: 64px; height: 64px; border-radius: 50%; background: var(--accent-bg); color: var(--accent); font-size: 28px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.char-body { padding: 14px 14px 10px; }
.char-name { font-weight: 600; font-size: 15px; color: var(--text-0); }
.char-role { font-size: 11px; color: var(--accent-text); margin-top: 3px; }
.char-desc { font-size: 12px; color: var(--text-3); margin-top: 6px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

.loading-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
.skeleton-card { height: 280px; background: linear-gradient(90deg, var(--bg-2) 25%, var(--bg-hover) 50%, var(--bg-2) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border: none; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.empty-card { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 56px 32px; cursor: pointer; border-style: dashed; border-width: 1.5px; text-align: center; transition: all 0.2s; }
.empty-card:hover { border-color: var(--accent); background: var(--accent-bg); transform: translateY(-2px); }
.empty-icon { width: 56px; height: 56px; border-radius: var(--radius-lg); background: var(--bg-2); display: flex; align-items: center; justify-content: center; color: var(--text-3); margin-bottom: 4px; transition: all 0.2s; }
.empty-card:hover .empty-icon { background: var(--accent-bg); color: var(--accent); }
.empty-title { font-size: 14px; font-weight: 600; color: var(--text-1); }
.empty-desc { font-size: 12px; color: var(--text-3); max-width: 200px; line-height: 1.6; }

/* Detail view */
.panel-open { padding: 0; }
.detail-topbar {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-0);
  position: sticky; top: 0; z-index: 10;
}
.detail-topbar-title { font-size: 16px; font-weight: 700; flex: 1; }
.detail-topbar-actions { display: flex; gap: 8px; }

.detail-body {
  display: grid;
  grid-template-columns: 280px 1fr 280px;
  gap: 20px;
  padding: 20px;
  height: calc(100vh - 80px);
  overflow-y: auto;
}
.detail-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }

.detail-card { padding: 18px; }
.detail-section-title { font-size: 13px; font-weight: 700; color: var(--text-1); margin-bottom: 14px; letter-spacing: 0.02em; }
.field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px; }
.field:last-child { margin-bottom: 0; }
.field-label { font-size: 12px; font-weight: 600; color: var(--text-1); }
.field-hint { font-size: 11px; color: var(--text-3); }
.required { color: var(--error); }

/* Portrait */
.portrait-card { display: flex; flex-direction: column; }
.portrait-area {
  flex: 1;
  min-height: 300px;
  background: var(--bg-2);
  border-radius: var(--radius);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  margin: 12px 0;
}
.portrait-img { width: 100%; height: 100%; object-fit: contain; cursor: pointer; }
.portrait-placeholder { display: flex; flex-direction: column; align-items: center; gap: 10px; color: var(--text-3); font-size: 13px; text-align: center; padding: 20px; }
.portrait-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.lock-badge { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--success); padding: 4px 10px; background: rgba(76,175,80,0.1); border-radius: 99px; }

/* Reference */
.ref-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.ref-thumb-wrap { position: relative; }
.ref-thumb { width: 64px; height: 64px; border-radius: 8px; object-fit: cover; border: 1px solid var(--border); cursor: pointer; }
.ref-del { position: absolute; top: -5px; right: -5px; width: 16px; height: 16px; border-radius: 50%; background: var(--error); color: #fff; border: none; cursor: pointer; font-size: 11px; display: flex; align-items: center; justify-content: center; line-height: 1; }
.ref-add { width: 64px; height: 64px; border-radius: 8px; border: 1.5px dashed var(--border); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; cursor: pointer; font-size: 10px; color: var(--text-3); transition: all 0.15s; }
.ref-add:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }
.hidden { display: none; }

/* Angles */
.angle-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.angle-item { display: flex; align-items: center; justify-content: center; padding: 7px; border-radius: 8px; border: 1.5px solid var(--border); cursor: pointer; font-size: 12px; color: var(--text-2); transition: all 0.15s; }
.angle-item:hover { border-color: var(--accent); color: var(--accent); }
.angle-item.selected { border-color: var(--accent); background: var(--accent-bg); color: var(--accent); font-weight: 600; }

.variations-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.variation-cell { border-radius: 8px; overflow: hidden; aspect-ratio: 1; cursor: pointer; border: 1px solid var(--border); }
.variation-img { width: 100%; height: 100%; object-fit: cover; }
.variations-empty { display: flex; align-items: center; justify-content: center; grid-column: span 2; padding: 32px; color: var(--text-3); font-size: 12px; text-align: center; }
.variations-locked-hint { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 32px 16px; color: var(--text-3); text-align: center; font-size: 13px; }

/* Lightbox */
.lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 9999; cursor: pointer; }
.lightbox-img { max-width: 90vw; max-height: 90vh; object-fit: contain; border-radius: 12px; }
.lightbox-close { position: fixed; top: 20px; right: 20px; background: rgba(255,255,255,0.1); border: none; color: #fff; cursor: pointer; padding: 8px; border-radius: 8px; display: flex; }

/* Modal */
.modal { padding: 28px; box-shadow: var(--shadow-elevated); animation: scaleIn 0.2s var(--ease-out); }
.modal-header { margin-bottom: 20px; display: flex; flex-direction: column; gap: 6px; }
.modal-title { font-family: var(--font-display); font-size: 18px; font-weight: 700; }
.modal-desc { font-size: 13px; color: var(--text-3); }
.modal-form { display: flex; flex-direction: column; gap: 14px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }

/* Btn */
.btn-accent { background: var(--accent); color: #fff; }
.btn-accent:hover { opacity: 0.85; }
.btn-danger { color: var(--error); border: 1px solid var(--error); background: transparent; }
.btn-danger:hover { background: rgba(229,83,75,0.08); }
.btn-sm { padding: 5px 10px; font-size: 12px; }
.animate-spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
