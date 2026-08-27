import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CategoryProgressBar } from './category-progress-bar'

describe('CategoryProgressBar', () => {
  it('renders ok level below the warning threshold', () => {
    render(<CategoryProgressBar spent={200} limit={500} level="ok" />)

    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('data-level', 'ok')
    expect(bar).toHaveAttribute('aria-valuenow', '40')
  })

  it('renders warning level at 84%', () => {
    render(<CategoryProgressBar spent={420} limit={500} level="warning" />)

    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('data-level', 'warning')
    expect(bar).toHaveAttribute('aria-valuenow', '84')
  })

  it('renders over level past 100% with the fill capped at 100', () => {
    render(<CategoryProgressBar spent={505} limit={500} level="over" />)

    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('data-level', 'over')
    expect(bar).toHaveAttribute('aria-valuenow', '101')
    const fill = bar.firstElementChild as HTMLElement
    expect(fill.style.width).toBe('100%')
  })

  it('renders an empty bar when there is no limit', () => {
    render(<CategoryProgressBar spent={300} limit={null} level="ok" />)

    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    const fill = bar.firstElementChild as HTMLElement
    expect(fill.style.width).toBe('0%')
  })
})
