import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

const setProfile = vi.hoisted(() => vi.fn(async () => {}))
const store = vi.hoisted(() => ({
  catalog: {
    disciplines: ['计算机科学与技术', '电子科学与技术'],
    professionalFields: ['电子信息', '材料与化工'],
  },
  setProfile,
}))

vi.mock('../src/stores/planner', () => ({ usePlannerStore: () => store }))

import SetupWizard from '../src/components/SetupWizard.vue'

function buttonByText(wrapper: ReturnType<typeof mount>, text: string) {
  const button = wrapper.findAll('button').find((item) => item.text().includes(text))
  if (!button) throw new Error(`未找到按钮：${text}`)
  return button
}

describe('培养信息设置', () => {
  it('工程硕士先选择一级学科，并可选填专业学位类别或领域', async () => {
    setProfile.mockClear()
    const wrapper = mount(SetupWizard, { props: { initialProfile: null, canCancel: false } })
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('测试学生')
    await inputs[1].setValue('20260001')
    await inputs[2].setValue('测试培养单位')
    await inputs[3].setValue('计算机应用技术')
    await buttonByText(wrapper, '继续').trigger('click')
    await buttonByText(wrapper, '工程硕士').trigger('click')
    await buttonByText(wrapper, '继续').trigger('click')

    expect(wrapper.get('h2').text()).toBe('选择一级学科')
    expect(wrapper.text()).toContain('专业学位类别 / 领域（选填）')
    const selects = wrapper.findAll('select')
    await selects[0].setValue('计算机科学与技术')
    await selects[1].setValue('电子信息')
    await buttonByText(wrapper, '继续').trigger('click')
    await buttonByText(wrapper, '保存并进入').trigger('click')
    await flushPromises()

    expect(setProfile).toHaveBeenCalledWith(expect.objectContaining({
      category: 'engineering_master',
      programKind: 'professional',
      discipline: '计算机科学与技术',
      professionalField: '电子信息',
    }))
    wrapper.unmount()
  })
})
