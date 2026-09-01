import { describe, expect, it } from 'vitest'
import { isVisibleForOwnDiscipline, ownDisciplineCoursePriority, ownDisciplinePlanPriority } from '../src/domain/catalogFilters'
import type { Course, StudentProfile } from '../src/types'

const profile: StudentProfile = {
  name: '', studentId: '', trainingUnit: '计算机科学与技术学院', major: '', category: 'academic_master', programKind: 'academic',
  discipline: '计算机科学与技术', campusPreference: '雁栖湖',
  english: { masterMethod: 'offline', doctorEnglishRequired: false }, createdAt: '',
}

const course = (name: string, overrides: Partial<Course> = {}): Course => ({
  id: name, term: 'fall', baseCode: name, name, englishName: '', department: '', campuses: [], attribute: '专业课',
  level: '硕博通用课程', subject: '计算机科学与技术', firstLevelDiscipline: '计算机科学与技术',
  sharedSubjects: [], sharedFirstLevels: [], sharedAttributes: [], sharedLevels: [], hours: 32, credits: 2,
  professionalProgramCourse: false, isBenYan: false, sourceKinds: ['test'], ...overrides,
})

describe('课程目录本学科筛选', () => {
  it('同时展示本一级学科、公共必修课和英语，但排除其他学科专业课', () => {
    const own = course('矩阵分析')
    const publicCourse = course('新时代中国特色社会主义理论与实践', { attribute: '公共必修课', department: '马克思主义学院', level: '硕士课程', firstLevelDiscipline: '马克思主义理论' })
    const english = course('英语A', { attribute: '公共必修课', department: '外语系', level: '硕士课程', firstLevelDiscipline: '外国语言文学' })
    const other = course('量子力学', { firstLevelDiscipline: '物理学', subject: '物理学' })
    expect(isVisibleForOwnDiscipline(profile, own)).toBe(true)
    expect(isVisibleForOwnDiscipline(profile, publicCourse)).toBe(true)
    expect(isVisibleForOwnDiscipline(profile, english)).toBe(true)
    expect(isVisibleForOwnDiscipline(profile, other)).toBe(false)
  })

  it('公共必修课程按学生类别显示，不把二外和语言类课程整体放行', () => {
    const doctorEnglish = course('英语B', { attribute: '公共必修课', department: '外语系', level: '博士课程', firstLevelDiscipline: '外国语言文学' })
    const secondLanguage = course('德语（二外）（中级）', { attribute: '公共必修课', department: '外语系', firstLevelDiscipline: '外国语言文学' })
    const engineeringEthics = course('工程伦理（雁栖湖慕课）', { attribute: '公共必修课', department: '工程科学学院', level: '', firstLevelDiscipline: '' })
    const doctorProfile = { ...profile, category: 'ordinary_doctor' as const, english: { masterMethod: 'not_applicable' as const, doctorEnglishRequired: true } }
    const engineeringProfile = { ...profile, category: 'engineering_master' as const, programKind: 'professional' as const }
    const engineeringDoctorProfile = { ...doctorProfile, category: 'engineering_doctor' as const, programKind: 'professional' as const }
    const otherProfessionalProfile = { ...profile, category: 'professional_master' as const, programKind: 'professional' as const }
    expect(isVisibleForOwnDiscipline(profile, doctorEnglish)).toBe(false)
    expect(isVisibleForOwnDiscipline(doctorProfile, doctorEnglish)).toBe(true)
    expect(isVisibleForOwnDiscipline(profile, secondLanguage)).toBe(false)
    expect(isVisibleForOwnDiscipline(profile, engineeringEthics)).toBe(false)
    expect(isVisibleForOwnDiscipline(engineeringProfile, engineeringEthics)).toBe(true)
    expect(isVisibleForOwnDiscipline(engineeringDoctorProfile, engineeringEthics)).toBe(true)
    expect(isVisibleForOwnDiscipline(otherProfessionalProfile, engineeringEthics)).toBe(false)
  })

  it('硕士英语按照免修、慕课和线下方案精确筛选', () => {
    const offlineEnglish = course('英语A', { attribute: '公共必修课', department: '外语系', level: '硕士课程' })
    const moocEnglish = course('硕士学位英语（慕课学习）', { attribute: '公共必修课', department: '外语系', level: '硕士课程' })
    const exemptProfile = { ...profile, english: { ...profile.english, masterMethod: 'exempt' as const } }
    const moocProfile = { ...profile, english: { ...profile.english, masterMethod: 'mooc' as const } }
    const offlineProfile = { ...profile, english: { ...profile.english, masterMethod: 'offline' as const } }

    expect(isVisibleForOwnDiscipline(exemptProfile, offlineEnglish)).toBe(false)
    expect(isVisibleForOwnDiscipline(exemptProfile, moocEnglish)).toBe(false)
    expect(isVisibleForOwnDiscipline(moocProfile, moocEnglish)).toBe(true)
    expect(isVisibleForOwnDiscipline(moocProfile, offlineEnglish)).toBe(false)
    expect(isVisibleForOwnDiscipline(offlineProfile, offlineEnglish)).toBe(true)
    expect(isVisibleForOwnDiscipline(offlineProfile, moocEnglish)).toBe(false)
  })

  it('本学科非公共必修课优先，学术道德与写作规范最后', () => {
    const rows = [
      course('学术道德与学术写作规范-通论', { attribute: '公共必修课', department: '公共政策与管理学院' }),
      course('新时代中国特色社会主义理论与实践', { attribute: '公共必修课', department: '马克思主义学院', level: '硕士课程' }),
      course('英语A', { attribute: '公共必修课', department: '外语系', level: '硕士课程' }),
      course('数据挖掘'),
    ].sort((left, right) => ownDisciplineCoursePriority(profile, left) - ownDisciplineCoursePriority(profile, right))
    expect(rows.map((item) => item.name)).toEqual(['数据挖掘', '英语A', '新时代中国特色社会主义理论与实践', '学术道德与学术写作规范-通论'])
  })

  it('博士英语B同样排在其他公共必修课之前', () => {
    const doctorProfile = {
      ...profile,
      category: 'ordinary_doctor' as const,
      english: { masterMethod: 'not_applicable' as const, doctorEnglishRequired: true },
    }
    const rows = [
      course('学术道德与学术写作规范-通论', { attribute: '公共必修课', department: '公共政策与管理学院' }),
      course('中国马克思主义与当代', { attribute: '公共必修课', department: '马克思主义学院', level: '博士课程' }),
      course('英语B', { attribute: '公共必修课', department: '外语系', level: '博士课程' }),
      course('高级人工智能'),
    ].sort((left, right) => ownDisciplineCoursePriority(doctorProfile, left) - ownDisciplineCoursePriority(doctorProfile, right))
    expect(rows.map((item) => item.name)).toEqual(['高级人工智能', '英语B', '中国马克思主义与当代', '学术道德与学术写作规范-通论'])
  })

  it('选课方案保留只看本学科的排序，并把已选的非本学科课程放在最后', () => {
    const rows = [
      course('学术道德与学术写作规范-通论', { attribute: '公共必修课', department: '公共政策与管理学院' }),
      course('英语A', { attribute: '公共必修课', department: '外语系', level: '硕士课程' }),
      course('物理学专题', { subject: '物理学', firstLevelDiscipline: '物理学' }),
      course('数据挖掘'),
    ].sort((left, right) => ownDisciplinePlanPriority(profile, left) - ownDisciplinePlanPriority(profile, right))
    expect(rows.map((item) => item.name)).toEqual(['数据挖掘', '物理学专题', '英语A', '学术道德与学术写作规范-通论'])
  })
})
