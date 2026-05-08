<template>
  <div class="page">
    <!-- Page Header -->
    <div class="page-head">
      <div class="head-left">
        <h1 class="page-title">角色库</h1>
        <p class="page-desc">{{ chars.length }} 个角色</p>
      </div>
      <button class="btn btn-primary" @click="openCreate">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        新建角色
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <div class="loading-grid">
        <div v-for="i in 4" :key="i" class="skeleton-card card"></div>
      </div>
    </div>

    <!-- Grid -->
    <div v-else class="grid">
      <div
        v-for="(c, i) in chars"
        :key="c.id"
        class="card char-card"
        :style="{ animationDelay: `${i * 0.05}s` }"
        @click="openDetail(c)"
      >
        <div class="char-cover">
          <img v-if="c.image_url || c.imageUrl" :src="'/' + (c.image_url || c.imageUrl)" class="char-img" />
          <div v-else class="char-avatar-lg">{{ c.name?.[0] || '?' }}</div>
        </div>
        <div class="char-body">
          <div class="char-name">{{ c.name }}</div>
          <div class="char-role" v-if="c.role">{{ c.role }}</div>
          <div class="char-desc">{{ c.appearance || c.description || '暂无外观描述' }}</div>
        </div>
        <div class="char-footer">
          <span class="tag" :class="(c.image_url || c.imageUrl) ? 'tag-success' : 'tag-muted'">
            {{ (c.image_url || c.imageUrl) ? '已生成' : '未生成' }}
          </span>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="!chars.length" class="card empty-card" @click="openCreate">
        <div class="empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
            <circle cx="12" cy="8" r="5"/>
            <path d="M20 21a8 8 0 1 0-16 0"/>
          </svg>
        </div>
        <p class="empty-title">创建第一个角色</p>
        <p class="empty-desc">上传参考图，生成角色形象</p>
      </div>
    </div>

    <!-- Create Dialog -->
    <div v-if="showCreate" class="overlay" @click.self="showCreate = false">
      <div class="modal card" style="width:460px">
        <div class="modal-header">
          <h2 class="modal-title">新建角色</h2>
        </div>
        <form @submit.prevent="createChar" class="modal-form">
          <label class="field">
            <span class="field-label">角色名 <span class="required">*</span></span>
            <input v-model="createForm.name" class="input" placeholder="例如：林浩" required autofocus />
          </label>
          <label class="field">
            <span class="field-label">定位</span>
            <input v-model="createForm.role" class="input" placeholder="主角 / 配角 / 旁白" />
          </label>
          <label class="field">
            <span class="field-label">外观描述</span>
            <textarea v-model="createForm.appearance" class="input" rows="3" placeholder="描述外貌特征，越详细越有助于生成准确的角色形象图"></textarea>
          </label>
          <div class="modal-actions">
            <button type="button" class="btn" @click="showCreate = false">取消</button>
            <button type="submit" class="btn btn-primary" :disabled="creating">
              {{ creating ? '创建中...' : '创建' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Detail Dialog -->
    <div v-if="detailChar" class="overlay" @click.self="detailChar = null">
      <div class="modal card detail-modal">
        <div class="detail-header">
          <div class="detail-cover">
            <img v-if="detailChar.image_url || detailChar.imageUrl" :src="'/' + (detailChar.image_url || detailChar.imageUrl)" class="detail-img" />
            <div v-else class="detail-avatar">{{ detailChar.name?.[0] || '?' }}</div>
          </div>
          <div class="detail-info">
            <h2 class="detail-name">{{ detailChar.name }}</h2>
            <div class="detail-meta">
              <span class="tag">{{ detailChar.role || '角色' }}</span>
              <span class="tag" :class="(detailChar.image_url || detailChar.imageUrl) ? 'tag-success' : 'tag-muted'">
                {{ (detailChar.image_url || detailChar.imageUrl) ? '已生成形象' : '未生成' }}
              </span>
            </div>
          </div>
          <button class="btn btn-ghost btn-icon close-btn" @click="detailChar = null">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <form @submit.prevent="saveDetail" class="detail-form">
          <div class="field-row">
            <label class="field">
              <span class="field-label">角色名</span>
              <input v-model="editForm.name" class="input" />
            </label>
            <label class="field">
              <span class="field-label">定位</span>
              <input v-model="editForm.role" class="input" placeholder="主角 / 配角" />
            </label>
          </div>
          <label class="field">
            <span class="field-label">外观描述</span>
            <textarea v-model="editForm.appearance" class="input" rows="3" placeholder="外貌特征，越详细越好"></textarea>
          </label>
          <label class="field">
            <span class="field-label">性格描述</span>
            <input v-model="editForm.personality" class="input" placeholder="性格特点" />
          </label>

          <!-- Reference Images -->
          <div class="field">
            <span class="field-label">参考图</span>
            <div class="ref-grid">
              <div v-for="(ref, idx) in referenceImages" :key="idx" class="ref-thumb-wrap">
                <img :src="ref.startsWith('data:') ? ref : '/' + ref" class="ref-thumb" />
                <button type="button" class="ref-del" @click="removeRef(idx)">×</button>
              </div>
              <label class="ref-add">
                <input type="file" accept="image/*" class="hidden" @change="uploadRef" />
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>上传</span>
              </label>
            </div>
          </div>

          <div class="detail-actions">
            <button type="button" class="btn btn-danger" @click="deleteChar">删除</button>
            <div class="detail-actions-right">
              <button type="button" class="btn" @click="detailChar = null">取消</button>
              <button type="submit" class="btn btn-primary" :disabled="saving">保存</button>
              <button
                type="button"
                class="btn btn-accent"
                :disabled="generating || !(editForm.appearance || editForm.description)"
                @click="generateImage"
              >
                {{ generating ? '生成中...' : '生成形象' }}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { globalCharacterAPI } from '~/composables/useApi'

const chars = ref([])
const loading = ref(false)
const showCreate = ref(false)
const detailChar = ref(null)
const creating = ref(false)
const saving = ref(false)
const generating = ref(false)

const createForm = ref({ name: '', role: '', appearance: '' })
const editForm = ref({ name: '', role: '', appearance: '', personality: '', description: '' })
const referenceImages = ref([])

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

function openCreate() {
  createForm.value = { name: '', role: '', appearance: '' }
  showCreate.value = true
}

async function createChar() {
  if (!createForm.value.name?.trim()) return
  creating.value = true
  try {
    const created = await globalCharacterAPI.create(createForm.value)
    chars.value.unshift(created)
    showCreate.value = false
    toast.success('角色已创建')
    openDetail(created)
  } catch (e) {
    toast.error(e.message)
  } finally {
    creating.value = false
  }
}

function openDetail(c) {
  detailChar.value = c
  editForm.value = {
    name: c.name || '',
    role: c.role || '',
    appearance: c.appearance || '',
    personality: c.personality || '',
    description: c.description || '',
  }
  referenceImages.value = c.reference_images ? JSON.parse(c.reference_images) : []
}

async function saveDetail() {
  if (!detailChar.value) return
  saving.value = true
  try {
    const updated = await globalCharacterAPI.update(detailChar.value.id, {
      ...editForm.value,
      reference_images: referenceImages.value,
    })
    const idx = chars.value.findIndex(c => c.id === detailChar.value.id)
    if (idx !== -1) chars.value[idx] = { ...chars.value[idx], ...updated }
    detailChar.value = null
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
  const formData = new FormData()
  formData.append('file', file)
  try {
    const res = await fetch('/api/v1/upload/image', { method: 'POST', body: formData })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message || '上传失败')
    referenceImages.value.push(json.data.path)
  } catch (e) {
    toast.error(e.message)
  }
  e.target.value = ''
}

function removeRef(idx) {
  referenceImages.value.splice(idx, 1)
}

async function generateImage() {
  if (!detailChar.value) return
  // Save first
  try {
    await globalCharacterAPI.update(detailChar.value.id, {
      ...editForm.value,
      reference_images: referenceImages.value,
    })
  } catch {}
  generating.value = true
  try {
    await globalCharacterAPI.generateImage(detailChar.value.id)
    toast.success('形象生成中...')
    // Poll for completion
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const updated = await globalCharacterAPI.list()
      const refreshed = (updated || []).find(c => c.id === detailChar.value.id)
      if (refreshed?.image_url || refreshed?.imageUrl) {
        const idx = chars.value.findIndex(c => c.id === detailChar.value.id)
        if (idx !== -1) chars.value[idx] = refreshed
        detailChar.value = refreshed
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

async function deleteChar() {
  if (!detailChar.value) return
  if (!confirm(`确定删除角色「${detailChar.value.name}」？`)) return
  try {
    await globalCharacterAPI.delete(detailChar.value.id)
    chars.value = chars.value.filter(c => c.id !== detailChar.value.id)
    detailChar.value = null
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

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 28px;
}
.head-left { display: flex; flex-direction: column; gap: 4px; }
.page-title {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-0);
}
.page-desc { font-size: 13px; color: var(--text-3); font-weight: 400; }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}

.char-card {
  padding: 0;
  cursor: pointer;
  overflow: hidden;
  animation: fadeUp 0.4s var(--ease-out) both;
  transition: transform 0.22s, box-shadow 0.22s, border-color 0.2s;
}
.char-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-lg);
  transform: translateY(-3px);
}

.char-cover {
  height: 180px;
  background: var(--bg-2);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.char-img { width: 100%; height: 100%; object-fit: cover; }
.char-avatar-lg {
  width: 64px; height: 64px; border-radius: 50%;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 28px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}

.char-body { padding: 14px 14px 10px; }
.char-name { font-weight: 600; font-size: 15px; color: var(--text-0); }
.char-role { font-size: 11px; color: var(--accent-text); margin-top: 3px; }
.char-desc {
  font-size: 12px; color: var(--text-3);
  margin-top: 6px;
  overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.char-footer { padding: 10px 14px 14px; }

.tag-muted { background: var(--bg-2); color: var(--text-3); }
.tag-success { background: rgba(76,175,80,0.1); color: #4caf50; }

.loading-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}
.skeleton-card { height: 280px; background: linear-gradient(90deg, var(--bg-2) 25%, var(--bg-hover) 50%, var(--bg-2) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border: none; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.empty-card {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 56px 32px;
  cursor: pointer; border-style: dashed; border-width: 1.5px;
  text-align: center;
  transition: all 0.2s var(--ease-out);
}
.empty-card:hover { border-color: var(--accent); background: var(--accent-bg); transform: translateY(-2px); }
.empty-icon {
  width: 56px; height: 56px; border-radius: var(--radius-lg);
  background: var(--bg-2);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-3); margin-bottom: 4px;
  transition: all 0.2s;
}
.empty-card:hover .empty-icon { background: var(--accent-bg); color: var(--accent); }
.empty-title { font-size: 14px; font-weight: 600; color: var(--text-1); }
.empty-desc { font-size: 12px; color: var(--text-3); max-width: 220px; line-height: 1.6; }

/* Modal */
.modal { padding: 32px; box-shadow: var(--shadow-elevated); animation: scaleIn 0.2s var(--ease-out); }
.modal-header { margin-bottom: 24px; display: flex; flex-direction: column; gap: 6px; }
.modal-title { font-family: var(--font-display); font-size: 19px; font-weight: 700; }
.modal-form { display: flex; flex-direction: column; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 12px; font-weight: 600; color: var(--text-1); }
.required { color: var(--error); }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 6px; }

/* Detail Modal */
.detail-modal { width: 580px; max-width: 95vw; max-height: 90vh; overflow-y: auto; padding: 0; }
.detail-header {
  display: flex; align-items: center; gap: 16px;
  padding: 24px 24px 20px;
  border-bottom: 1px solid var(--border);
}
.detail-cover { flex-shrink: 0; }
.detail-img { width: 72px; height: 72px; border-radius: 12px; object-fit: cover; }
.detail-avatar {
  width: 72px; height: 72px; border-radius: 12px;
  background: var(--accent-bg); color: var(--accent);
  font-size: 28px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.detail-info { flex: 1; }
.detail-name { font-size: 18px; font-weight: 700; color: var(--text-0); }
.detail-meta { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.close-btn { margin-left: auto; flex-shrink: 0; }

.detail-form { padding: 20px 24px 24px; display: flex; flex-direction: column; gap: 14px; }

.ref-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.ref-thumb-wrap { position: relative; }
.ref-thumb { width: 72px; height: 72px; border-radius: 8px; object-fit: cover; border: 1px solid var(--border); }
.ref-del {
  position: absolute; top: -6px; right: -6px;
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--error); color: #fff;
  border: none; cursor: pointer; font-size: 12px;
  display: flex; align-items: center; justify-content: center;
  line-height: 1;
}
.ref-add {
  width: 72px; height: 72px; border-radius: 8px;
  border: 1.5px dashed var(--border);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px; cursor: pointer;
  font-size: 11px; color: var(--text-3);
  transition: all 0.15s;
}
.ref-add:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }
.hidden { display: none; }

.detail-actions { display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid var(--border); }
.detail-actions-right { display: flex; gap: 8px; }
.btn-accent { background: var(--accent); color: #fff; }
.btn-accent:hover { opacity: 0.85; }
.btn-danger { color: var(--error); border: 1px solid var(--error); background: transparent; }
.btn-danger:hover { background: rgba(229,83,75,0.08); }
</style>
