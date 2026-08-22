'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import {
  fadeInUp,
  staggerContainer,
  buttonHover,
} from '@/lib/animations/variants'

export function HeroSection() {
  return (
    <section className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-teal-50 flex items-center justify-center px-4 sm:px-6 lg:px-8 pt-20 relative">
      {/* Login & Register buttons in top-right corner */}
      <div className="absolute top-4 right-4 flex items-center gap-2 sm:top-6 sm:right-6 sm:gap-3">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-white border-2 border-gray-200 text-gray-700 font-semibold rounded-lg hover:border-teal-600 hover:text-teal-600 hover:shadow-md transition-all duration-300 sm:px-6 sm:py-2.5 sm:text-base"
        >
          Login
        </Link>
        <Link
          href="/login?mode=signup"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all duration-300 sm:px-6 sm:py-2.5 sm:text-base"
        >
          Register
        </Link>
      </div>

      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {/* Badge */}
          <motion.div
            variants={fadeInUp}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-100 rounded-full text-teal-700 text-sm font-medium mb-6"
          >
            <span className="inline-block w-2 h-2 bg-teal-500 rounded-full animate-pulse" />
            Welcome to Expense Tracker
          </motion.div>

          {/* Main Heading */}
          <motion.h1
            variants={fadeInUp}
            className="text-4xl sm:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight"
          >
            Take Control of Your{' '}
            <span className="bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
              Finances
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={fadeInUp}
            className="text-lg sm:text-2xl text-gray-600 mb-8 max-w-2xl mx-auto leading-relaxed"
          >
            Track your expenses, set budgets, and gain insights into your spending habits. Smart financial management made simple.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            variants={fadeInUp}
            className="flex flex-col sm:flex-row gap-4 justify-center mb-12"
          >
            <motion.div {...buttonHover}>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all duration-300"
              >
                Start Tracking Now
                <ArrowRight size={20} />
              </Link>
            </motion.div>

            <motion.div {...buttonHover}>
              <Link
                href="#how-it-works"
                className="inline-flex items-center gap-2 px-8 py-4 border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:border-teal-600 hover:text-teal-600 transition-all duration-300"
              >
                Learn More
              </Link>
            </motion.div>
          </motion.div>

          {/* Stats */}
          <motion.div
            variants={fadeInUp}
            className="grid grid-cols-3 gap-4 sm:gap-8 text-center pt-8 border-t border-gray-200"
          >
            {[
              { number: '10K+', label: 'Users' },
              { number: '500M+', label: 'Tracked' },
              { number: '4.9★', label: 'Rating' },
            ].map((stat, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                className="py-4"
              >
                <div className="text-2xl sm:text-3xl font-bold text-teal-600">
                  {stat.number}
                </div>
                <div className="text-sm sm:text-base text-gray-600">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* Floating Elements */}
      <motion.div
        className="absolute top-20 right-10 w-72 h-72 bg-teal-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20"
        animate={{
          y: [0, 30, 0],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        className="absolute bottom-20 left-10 w-72 h-72 bg-cyan-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20"
        animate={{
          y: [0, -30, 0],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </section>
  )
}
