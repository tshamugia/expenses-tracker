import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import type { StabilityStage } from '@/types/plan-types'
import { StabilityStepper } from './stability-stepper'

function renderStepper(stage: StabilityStage) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <StabilityStepper stage={stage} />
    </NextIntlClientProvider>
  )
}

function states(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-state]')).map((el) =>
    el.getAttribute('data-state')
  )
}

describe('StabilityStepper', () => {
  it('marks the current rung and none done at stage 0', () => {
    const { container } = renderStepper(0)
    expect(states(container)).toEqual(['current', 'todo', 'todo', 'todo'])
  })

  it('checks cleared rungs and highlights the current at stage 2', () => {
    const { container } = renderStepper(2)
    expect(states(container)).toEqual(['done', 'done', 'current', 'todo'])
  })

  it('marks every rung done once the path is achieved (stage 4)', () => {
    const { container } = renderStepper(4)
    expect(states(container)).toEqual(['done', 'done', 'done', 'done'])
  })
})
