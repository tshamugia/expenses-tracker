/**
 * Framer Motion Animation Variants
 * Reusable animation configurations for landing page
 */

import type { Variants } from 'framer-motion'

export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 },
}

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

export const slideInLeft: Variants = {
  initial: { opacity: 0, x: -50 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -50 },
}

export const slideInRight: Variants = {
  initial: { opacity: 0, x: 50 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 50 },
}

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
}

export const staggerContainer: Variants = {
  animate: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
}

export const hoverScale = {
  whileHover: { scale: 1.05 },
  whileTap: { scale: 0.95 },
}

export const hoverScaleUp = {
  whileHover: { scale: 1.1, y: -5 },
}

export const buttonHover = {
  whileHover: { scale: 1.02, boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)' },
  whileTap: { scale: 0.98 },
}

export const cardHover = {
  whileHover: {
    y: -10,
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
  },
}
