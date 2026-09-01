<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowLeft, ArrowRight, Check, GraduationCap, ShieldCheck } from 'lucide-vue-next'
import { categoryLabels } from '../domain/requirements'
import { usePlannerStore } from '../stores/planner'
import type { MasterEnglishMethod, StudentCategory, StudentProfile } from '../types'

const props = defineProps<{ initialProfile: StudentProfile | null; canCancel: boolean }>()
const emit = defineEmits<{ complete: []; cancel: [] }>()
const store = usePlannerStore()
const step = ref(0)
const name = ref(props.initialProfile?.name ?? '')
const studentId = ref(props.initialProfile?.studentId ?? '')
const trainingUnit = ref(props.initialProfile?.trainingUnit ?? '')
const major = ref(props.initialProfile?.major ?? props.initialProfile?.discipline ?? '')
const category = ref<StudentCategory>(props.initialProfile?.category ?? 'academic_master')
const initialDiscipline = props.initialProfile?.discipline ?? ''
const discipline = ref(store.catalog.disciplines.includes(initialDiscipline) ? initialDiscipline : '')
const professionalField = ref(
  props.initialProfile?.professionalField
    ?? (props.initialProfile?.programKind === 'professional' && store.catalog.professionalFields.includes(initialDiscipline) ? initialDiscipline : ''),
)
const campus = ref(props.initialProfile?.campusPreference ?? '雁栖湖')
const masterMethod = ref<MasterEnglishMethod>(props.initialProfile?.english.masterMethod ?? 'offline')

const categories = Object.entries(categoryLabels) as Array<[StudentCategory, string]>
const isProfessional = computed(() => ['engineering_master', 'engineering_doctor', 'professional_master'].includes(category.value))
const needsMasterEnglish = computed(() => ['academic_master', 'engineering_master', 'professional_master', 'direct_doctor'].includes(category.value))
const needsDoctorEnglish = computed(() => ['ordinary_doctor', 'engineering_doctor', 'direct_doctor'].includes(category.value))
const disciplineOptions = computed(() => store.catalog.disciplines)
const professionalFieldOptions = computed(() => store.catalog.professionalFields)
const identityComplete = computed(() => Boolean(name.value.trim() && studentId.value.trim() && trainingUnit.value.trim() && major.value.trim()))

function chooseCategory(value: StudentCategory) {
  const wasProfessional = isProfessional.value
  category.value = value
  if (wasProfessional && !isProfessional.value) professionalField.value = ''
}

async function finish() {
  if (!identityComplete.value || !discipline.value) return
  await store.setProfile({
    name: name.value.trim(),
    studentId: studentId.value.trim(),
    trainingUnit: trainingUnit.value.trim(),
    major: major.value.trim(),
    category: category.value,
    programKind: isProfessional.value ? 'professional' : 'academic',
    discipline: discipline.value,
    professionalField: isProfessional.value ? professionalField.value : '',
    campusPreference: campus.value,
    english: { masterMethod: needsMasterEnglish.value ? masterMethod.value : 'not_applicable', doctorEnglishRequired: needsDoctorEnglish.value },
    createdAt: props.initialProfile?.createdAt ?? new Date().toISOString(),
  })
  emit('complete')
}
</script>

<template>
  <main class="setup-page">
    <section class="setup-intro">
      <div class="setup-constellation" aria-hidden="true"><i v-for="n in 7" :key="n" /></div>
      <img class="setup-logo" src="/branding/ucas-logo-horizontal-white.png" alt="中国科学院大学" />
      <p class="eyebrow">中国科学院大学 · 2026—2027</p>
      <h1>中国科学院大学<br />研究生选课系统<span class="setup-version">v1.0.4</span></h1>
      <p class="setup-description">要求按学生类别和学科归属确定；设置仅保存在本机，可随时修改。</p>
      <div class="privacy-note"><ShieldCheck :size="19" /><span>不登录学校账号<br />不上传个人选课数据</span></div>
    </section>

    <section class="setup-card">
      <header>
        <div class="setup-step"><span>步骤 {{ step + 1 }} / 4</span><div><i v-for="n in 4" :key="n" :class="{ done: step >= n - 1 }" /></div></div>
        <img class="setup-card-logo" src="/branding/ucas-logo-horizontal-blue.png" alt="中国科学院大学" />
        <button v-if="canCancel" class="text-button" @click="emit('cancel')">取消修改</button>
      </header>

      <div v-if="step === 0" class="setup-panel">
        <p class="section-kicker">基本信息</p>
        <h2>填写你的培养信息</h2>
        <div class="setup-identity-grid">
          <label class="field-label"><span>姓名</span><input v-model="name" autocomplete="name" placeholder="请输入姓名" /></label>
          <label class="field-label"><span>学号</span><input v-model="studentId" inputmode="numeric" autocomplete="off" placeholder="请输入学号" /></label>
          <label class="field-label full"><span>培养单位</span><input v-model="trainingUnit" autocomplete="organization" placeholder="例如：中国科学院大学计算机科学与技术学院" /></label>
          <label class="field-label full"><span>所学专业</span><input v-model="major" autocomplete="off" placeholder="例如：计算机应用技术" /><small>用于身份展示和导出选课单；“只看本学科”按后续选择的{{ isProfessional ? '关联一级学科（推断）' : '一级学科' }}筛选。</small></label>
        </div>
      </div>

      <div v-else-if="step === 1" class="setup-panel">
        <p class="section-kicker">培养阶段</p>
        <h2>你的学生类别是？</h2>
        <div class="category-grid">
          <button v-for="([value, label], index) in categories" :key="value" :class="{ selected: category === value }" @click="chooseCategory(value)">
            <span>{{ String(index + 1).padStart(2, '0') }}</span><strong>{{ label }}</strong><Check v-if="category === value" :size="17" />
          </button>
        </div>
      </div>

      <div v-else-if="step === 2" class="setup-panel">
        <p class="section-kicker">课程归属</p>
        <h2>选择{{ isProfessional ? '关联一级学科（推断）' : '一级学科' }}</h2>
        <label class="field-label">
          <span>{{ isProfessional ? '关联一级学科（推断）' : '一级学科' }}</span>
          <select v-model="discipline"><option value="" disabled>请选择</option><option v-for="item in disciplineOptions" :key="item" :value="item">{{ item }}</option></select>
          <small>{{ isProfessional ? '用于关联学术一级学科，并作为“只看本学科”的筛选依据。' : '作为“只看本学科”的筛选依据。' }}</small>
        </label>
        <label v-if="isProfessional" class="field-label">
          <span>专业学位类别 / 领域（选填）</span>
          <select v-model="professionalField"><option value="">暂不选择</option><option v-for="item in professionalFieldOptions" :key="item" :value="item">{{ item }}</option></select>
          <small>用于补充识别适用于该类别或领域的培养课程，不改变“只看本学科”的关联一级学科口径。</small>
        </label>
        <label class="field-label">
          <span>常用校区</span>
          <select v-model="campus"><option>雁栖湖</option><option>玉泉路</option><option>中关村</option><option>其他</option></select>
        </label>
      </div>

      <div v-else class="setup-panel">
        <p class="section-kicker">公共必修</p>
        <h2>英语如何修读？</h2>
        <div v-if="needsMasterEnglish" class="english-block">
          <h3>硕士学位英语A</h3>
          <label v-for="option in [
            { value: 'exempt', title: '免修免考', desc: '完成英语要求，但不计本学期选课学分' },
            { value: 'mooc', title: '线上慕课 + 期末考试', desc: '选择慕课班，按3学分课程规划' },
            { value: 'offline', title: '线下英语A', desc: '学术读写或学术听说任选一门' },
          ]" :key="option.value" class="radio-line" :class="{ selected: masterMethod === option.value }">
            <input v-model="masterMethod" type="radio" :value="option.value" /><span><strong>{{ option.title }}</strong><small>{{ option.desc }}</small></span>
          </label>
        </div>
        <div v-if="needsDoctorEnglish" class="doctor-note"><GraduationCap :size="21" /><div><strong>博士学位英语B</strong><p>同一学期选择一门读写类和一门听说类，共2学分。系统将在选课方案中自动检查。</p></div></div>
      </div>

      <footer class="setup-actions">
        <button v-if="step > 0" class="button secondary" @click="step--"><ArrowLeft :size="17" /> 上一步</button>
        <span />
        <button v-if="step < 3" class="button primary" :disabled="(step === 0 && !identityComplete) || (step === 2 && !discipline)" @click="step++">继续 <ArrowRight :size="17" /></button>
        <button v-else class="button primary" :disabled="!identityComplete || !discipline" @click="finish">保存并进入 <ArrowRight :size="17" /></button>
      </footer>
    </section>
  </main>
</template>
