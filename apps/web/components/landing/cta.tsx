'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function CTA() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-600 to-blue-800 text-white">
      <motion.div
        className="max-w-4xl mx-auto text-center"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true }}
      >
        <h2 className="text-4xl sm:text-5xl font-bold mb-6">
          Ready to Take Control of Your Finances?
        </h2>
        <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
          Start using ExTracker today and never worry about missed payments again.
          Join thousands of users managing their expenses smarter.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/register">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-slate-100">
              Get Started Free
            </Button>
          </Link>
          <Link href="/#features">
            <Button
              size="lg"
              className="bg-blue-700 text-white hover:bg-blue-800 border-2 border-white"
              variant="outline"
            >
              Learn More
            </Button>
          </Link>
        </div>

        <p className="text-blue-100 text-sm mt-6">
          No credit card required • 14-day free trial • Cancel anytime
        </p>
      </motion.div>
    </section>
  );
}
