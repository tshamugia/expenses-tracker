'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

const plans = [
  {
    name: 'Starter',
    price: 'Free',
    description: 'Perfect for getting started',
    features: [
      'Up to 10 expenses',
      'Basic analytics',
      'Manual payment tracking',
      'Email support',
    ],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$4.99',
    period: '/month',
    description: 'Best for regular users',
    features: [
      'Unlimited expenses',
      'Advanced analytics',
      'Recurring payments',
      'Payment reminders',
      'Category tracking',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Business',
    price: '$9.99',
    period: '/month',
    description: 'For teams and businesses',
    features: [
      'Everything in Pro',
      'Multi-user collaboration',
      'Custom reports',
      'API access',
      'Dedicated support',
      'Advanced security',
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8 },
  },
};

export function Pricing() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-6xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Choose the perfect plan for your needs. No hidden fees.
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {plans.map((plan, index) => (
            <motion.div
              key={index}
              className={`relative rounded-lg p-8 transition-all ${
                plan.highlighted
                  ? 'bg-blue-600 text-white shadow-2xl scale-105'
                  : 'bg-slate-50 text-slate-900 shadow-lg hover:shadow-xl'
              }`}
              variants={cardVariants}
            >
              {plan.highlighted && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                  <span className="bg-amber-400 text-slate-900 px-3 py-1 rounded-full text-sm font-semibold">
                    Most Popular
                  </span>
                </div>
              )}

              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <p className={plan.highlighted ? 'text-blue-100' : 'text-slate-600'}>
                {plan.description}
              </p>

              <div className="my-6">
                <span className="text-5xl font-bold">{plan.price}</span>
                {plan.period && (
                  <span
                    className={plan.highlighted ? 'text-blue-100' : 'text-slate-600'}
                  >
                    {plan.period}
                  </span>
                )}
              </div>

              <Button
                className={`w-full mb-8 ${
                  plan.highlighted
                    ? 'bg-white text-blue-600 hover:bg-slate-100'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {plan.cta}
              </Button>

              <div className="space-y-4">
                {plan.features.map((feature, idx) => (
                  <div key={idx} className="flex items-center space-x-3">
                    <Check
                      className={`h-5 w-5 flex-shrink-0 ${
                        plan.highlighted ? 'text-white' : 'text-green-600'
                      }`}
                    />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
