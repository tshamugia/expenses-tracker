'use client';

import { motion } from 'framer-motion';
import { Star } from 'lucide-react';

const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'Freelance Designer',
    content:
      'ExTracker has made managing my recurring expenses so much easier. I never miss a payment deadline anymore!',
    rating: 5,
    image: '👩‍💼',
  },
  {
    name: 'Michael Rodriguez',
    role: 'Small Business Owner',
    content:
      'The analytics features help me understand my spending patterns. Highly recommend for anyone serious about budgeting.',
    rating: 5,
    image: '👨‍💼',
  },
  {
    name: 'Emma Thompson',
    role: 'Project Manager',
    content:
      'Simple, intuitive, and exactly what I needed. The payment reminders have saved me from late fees multiple times.',
    rating: 5,
    image: '👩‍🔬',
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
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.8 },
  },
};

export function Testimonials() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-50">
      <div className="max-w-6xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4">
            Loved by Users
          </h2>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            See what our users are saying about ExTracker.
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              className="bg-white rounded-lg p-8 shadow-lg hover:shadow-xl transition-shadow"
              variants={cardVariants}
            >
              <div className="flex mb-4">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-5 w-5 text-yellow-400 fill-yellow-400"
                  />
                ))}
              </div>

              <p className="text-slate-700 mb-6 italic">
                &quot;{testimonial.content}&quot;
              </p>

              <div className="flex items-center space-x-4">
                <div className="text-4xl">{testimonial.image}</div>
                <div>
                  <p className="font-semibold text-slate-900">
                    {testimonial.name}
                  </p>
                  <p className="text-sm text-slate-600">{testimonial.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
