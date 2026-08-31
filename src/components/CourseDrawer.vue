<script setup lang="ts">
import { computed } from 'vue'
import { BookMarked, CalendarClock, CheckCircle2, ClipboardCheck, MapPin, UsersRound, X } from 'lucide-vue-next'
import { isDisciplineMatch } from '../domain/requirements'
import { usePlannerStore } from '../stores/planner'
import type { CourseChoice } from '../types'

const props = defineProps<{ choice: CourseChoice | null }>()
defineEmits<{ close: []; add: [status: 'formal' | 'backup'] }>()
const store = usePlannerStore()
const matches = computed(() => props.choice && store.profile ? isDisciplineMatch(store.profile, props.choice.course) : false)
const formalBlockReason = computed(() => props.choice ? store.formalAddBlockReason(props.choice) : null)
const attendanceNote = computed(() => Boolean(props.choice && /人文系列讲座|科学前沿讲座/.test(props.choice.course.name)))
</script>

<template>
  <Teleport to="body">
    <div v-if="choice" class="drawer-layer" @click.self="$emit('close')">
      <aside class="course-drawer" role="dialog" aria-modal="true" aria-label="课程详情">
        <button class="icon-button drawer-close" aria-label="关闭" @click="$emit('close')"><X :size="20" /></button>
        <p class="section-kicker">课程详情</p>
        <h2>{{ choice.offering?.name || choice.course.name }}</h2>
        <p class="course-code">{{ choice.offering?.offeringCode ?? choice.course.baseCode }}</p>
        <div class="drawer-tags"><span>{{ choice.course.attribute }}</span><span class="credit-tag">{{ choice.course.credits }} 学分</span><span>{{ choice.course.level || '培养层次待确认' }}</span></div>

        <section class="drawer-section">
          <h3><BookMarked :size="18" /> 培养归属</h3>
          <dl><div><dt>所属学科</dt><dd>{{ choice.course.subject || '未标注' }}</dd></div><div><dt>所属一级学科</dt><dd>{{ choice.course.firstLevelDiscipline || '未标注' }}</dd></div><div><dt>共享学科</dt><dd>{{ choice.course.sharedSubjects.join('、') || '无' }}</dd></div></dl>
          <p class="match-note" :class="{ yes: matches }"><CheckCircle2 :size="16" />{{ matches ? '与当前培养归属匹配' : '需要导师或培养单位确认后才能计为学位课' }}</p>
        </section>
        <section class="drawer-section">
          <h3><CalendarClock :size="18" /> 排课信息</h3>
          <template v-if="choice.offering?.meetings.length">
            <ol class="meeting-list"><li v-for="meeting in choice.offering.meetings" :key="meeting.rawWeeks + meeting.rawTime"><b>{{ meeting.rawTime }}</b><span>{{ meeting.rawWeeks }}</span><small>{{ meeting.room || '教室待定' }}</small></li></ol>
          </template>
          <p v-else>暂无周次、节次和教师信息；可加入方案，但不参与时间冲突判断。</p>
        </section>
        <section class="drawer-section">
          <h3><UsersRound :size="18" /> 教师与名额</h3>
          <dl><div><dt>主讲教师</dt><dd>{{ choice.offering?.teachers.join('、') || '待定' }}</dd></div><div><dt>首席教授</dt><dd>{{ choice.offering?.leadProfessor || '未标注' }}</dd></div><div><dt>选课容量</dt><dd v-if="choice.offering?.capacity">已选 {{ choice.offering.enrolled }} / 限选 {{ choice.offering.capacity }}，剩余 {{ Math.max(0, choice.offering.capacity - choice.offering.enrolled) }}</dd><dd v-else>待定</dd></div></dl>
        </section>
        <section class="drawer-section">
          <h3><ClipboardCheck :size="18" /> 教学与考核</h3>
          <dl><div><dt>授课方式</dt><dd>{{ choice.offering?.teachingMethod || '待定' }}</dd></div><div><dt>考试方式</dt><dd>{{ choice.offering?.examMethod || '待定' }}</dd></div><div><dt>课程学时</dt><dd>{{ choice.course.hours || '待定' }} 学时</dd></div></dl>
        </section>
        <section v-if="choice.course.isBenYan" class="drawer-section benyan-rule-section">
          <h3><BookMarked :size="18" /> 本研课程规则</h3>
          <ul class="benyan-rules">
            <li>增选：网络选课结束后两周内或开课两周内申请，并完成已布置作业。</li>
            <li>中期退课：第八周内在线申请；课程人数降至5人以下通常不再受理，物理学院 B02 开头课程不足10人也不再受理。</li>
            <li>缓考：须在考试前申请，并参加下学期初学校安排的缓考；不参加按缺考处理。</li>
            <li>补考：闭卷或课堂开卷课程不及格可申请一次；其他考核形式只能申请重修。</li>
            <li>重修：已及格不得重修；无故缺考原则上只能重修；不合格最多申请一次补考或重修。</li>
          </ul>
        </section>
        <p v-if="attendanceNote" class="lecture-note">本课程须全学年听满20学时后才能取得学分；不计入本学期10学分。</p>
        <section class="drawer-section source-line"><MapPin :size="17" /><span>{{ choice.course.department }} · {{ choice.course.campuses.join(' / ') || '校区待定' }}</span></section>
        <footer><button class="button secondary" @click="$emit('add', 'backup')">加入备选</button><button class="button primary" :disabled="Boolean(formalBlockReason)" :title="formalBlockReason || undefined" @click="$emit('add', 'formal')">加入正式方案</button></footer>
        <p v-if="formalBlockReason" class="drawer-action-note">{{ formalBlockReason }}</p>
      </aside>
    </div>
  </Teleport>
</template>
