'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import toast from 'react-hot-toast';
import { FiZap, FiCheck, FiStar, FiShield, FiTrendingUp, FiCpu, FiLayers, FiGlobe, FiArrowRight } from 'react-icons/fi';
import Script from 'next/script';

export default function UpgradePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  const getToken = () => localStorage.getItem('token');

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push('/login'); return; }
    const userData = localStorage.getItem('user');
    if (userData) setUser(JSON.parse(userData));
  }, [router]);

  const plans = [
    {
      id: 'free',
      name: 'Starter',
      price: '₹0',
      period: 'forever',
      credits: 100,
      description: 'Get started with AI-powered document intelligence',
      features: [
        '100 AI Credits',
        'Up to 5 Documents',
        'PDF, DOCX, TXT Support',
        'Basic RAG Pipeline',
        'Community Support',
      ],
      color: '#64748b',
      gradient: 'linear-gradient(135deg, #334155, #475569)',
      popular: false,
    },
    {
      id: 'pro',
      name: 'Professional',
      price: '₹499',
      period: '/month',
      credits: 5000,
      description: 'For power users who need unlimited intelligence',
      features: [
        '5,000 AI Credits',
        'Unlimited Documents',
        'Web Scraping Support',
        'Priority RAG Pipeline',
        'Advanced Analytics',
        'Priority Support',
        'API Access',
      ],
      color: '#7c3aed',
      gradient: 'linear-gradient(135deg, #7c3aed, #a855f7)',
      popular: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: '₹1,499',
      period: '/month',
      credits: 25000,
      description: 'Custom solutions for teams and organizations',
      features: [
        '25,000 AI Credits',
        'Unlimited Everything',
        'Custom Integrations',
        'Dedicated Pipeline',
        'Team Collaboration',
        'SLA Guarantee',
        '24/7 Premium Support',
        'Custom Model Tuning',
      ],
      color: '#06d6a0',
      gradient: 'linear-gradient(135deg, #059669, #06d6a0)',
      popular: false,
    },
  ];

  const handleUpgrade = async (planId) => {
    if (planId === 'free') return;
    setSelectedPlan(planId);
    setLoading(true);

    try {
      // Create order
      const res = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ plan: planId }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to create order');
        setLoading(false);
        return;
      }

      // Open Razorpay Checkout
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: data.amount,
        currency: data.currency,
        name: 'SynthMind AI',
        description: `${data.planName} — ${data.credits} Credits`,
        order_id: data.orderId,
        handler: async function (response) {
          try {
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getToken()}`,
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                plan: planId,
              }),
            });

            const verifyData = await verifyRes.json();
            if (verifyRes.ok) {
              toast.success(`🎉 Upgraded to ${planId.charAt(0).toUpperCase() + planId.slice(1)}! ${data.credits} credits added.`);
              // Update local storage
              const u = JSON.parse(localStorage.getItem('user') || '{}');
              u.credits = verifyData.credits;
              u.plan = verifyData.plan;
              localStorage.setItem('user', JSON.stringify(u));
              window.dispatchEvent(new CustomEvent('credits-update', { detail: verifyData.credits }));
              setUser(u);
            } else {
              toast.error(verifyData.error || 'Payment verification failed');
            }
          } catch (e) {
            toast.error('Verification error');
          }
        },
        prefill: {
          email: user?.email || '',
        },
        theme: {
          color: '#7c3aed',
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
            setSelectedPlan(null);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
      setLoading(false);
    } catch (e) {
      toast.error('Payment error');
      setLoading(false);
    }
  };

  const currentPlan = user?.plan || 'free';

  return (
    <div className="gradient-bg" style={{ minHeight: '100vh' }}>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" />
      <Navbar />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 24px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 56 }} className="animate-slide-up">
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 16px', borderRadius: 20,
            background: 'rgba(124, 58, 237, 0.12)',
            border: '1px solid rgba(124, 58, 237, 0.3)',
            marginBottom: 20,
          }}>
            <FiZap size={14} color="var(--primary-light)" />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary-light)', letterSpacing: 1 }}>UPGRADE YOUR PLAN</span>
          </div>

          <h1 style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}>
            Supercharge Your{' '}
            <span style={{
              background: 'linear-gradient(135deg, var(--primary-light), var(--accent))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              AI Intelligence
            </span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 16, maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>
            Unlock the full power of SynthMind AI with more credits, priority pipeline access, and advanced features.
          </p>

          {/* Current credits indicator */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 12,
            padding: '12px 24px', borderRadius: 14,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            marginTop: 24,
          }}>
            <FiZap size={18} color={user?.credits <= 10 ? 'var(--danger)' : 'var(--accent)'} />
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              You have <span style={{ fontWeight: 700, color: user?.credits <= 10 ? 'var(--danger)' : 'var(--accent)' }}>{user?.credits ?? '—'}</span> credits remaining
            </span>
            {user?.credits <= 0 && (
              <span style={{
                padding: '3px 10px', borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.15)',
                color: 'var(--danger)',
                fontSize: 11, fontWeight: 700,
              }}>UPGRADE REQUIRED</span>
            )}
          </div>
        </div>

        {/* Pricing Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginBottom: 64 }}>
          {plans.map((plan, i) => (
            <div
              key={plan.id}
              className="animate-slide-up"
              style={{
                animationDelay: `${i * 0.1}s`,
                position: 'relative',
                borderRadius: 20,
                background: 'rgba(19, 19, 43, 0.7)',
                backdropFilter: 'blur(12px)',
                border: `1px solid ${plan.popular ? plan.color : 'var(--border-color)'}`,
                padding: plan.popular ? '3px' : 0,
                transform: plan.popular ? 'scale(1.04)' : 'scale(1)',
                transition: 'all 0.3s ease',
                zIndex: plan.popular ? 2 : 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = plan.popular ? 'scale(1.06)' : 'scale(1.02)';
                e.currentTarget.style.boxShadow = `0 8px 40px ${plan.color}30`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = plan.popular ? 'scale(1.04)' : 'scale(1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* Popular badge */}
              {plan.popular && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: plan.gradient,
                  padding: '5px 20px', borderRadius: 20,
                  fontSize: 11, fontWeight: 700, color: 'white',
                  letterSpacing: 1, zIndex: 3,
                  boxShadow: `0 4px 15px ${plan.color}50`,
                }}>
                  ⭐ MOST POPULAR
                </div>
              )}

              <div style={{
                background: plan.popular ? 'var(--bg-card)' : 'transparent',
                borderRadius: plan.popular ? 18 : 20,
                padding: '36px 28px',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}>
                {/* Plan header */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 14,
                    background: `${plan.color}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 16,
                  }}>
                    {plan.id === 'free'
                      ? <FiZap size={22} color={plan.color} />
                      : plan.id === 'pro'
                        ? <FiStar size={22} color={plan.color} />
                        : <FiShield size={22} color={plan.color} />}
                  </div>

                  <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{plan.name}</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{plan.description}</p>
                </div>

                {/* Price */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 40, fontWeight: 800, color: plan.color }}>{plan.price}</span>
                    <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}>{plan.period}</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {plan.credits.toLocaleString()} AI credits included
                  </p>
                </div>

                {/* Features */}
                <div style={{ flex: 1, marginBottom: 28 }}>
                  {plan.features.map((feature, j) => (
                    <div key={j} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 0',
                      borderBottom: j < plan.features.length - 1 ? '1px solid rgba(42, 42, 90, 0.3)' : 'none',
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 6,
                        background: `${plan.color}15`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <FiCheck size={12} color={plan.color} />
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{feature}</span>
                    </div>
                  ))}
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={currentPlan === plan.id || (plan.id === 'free' && currentPlan !== 'free') || loading}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    borderRadius: 14,
                    border: 'none',
                    cursor: currentPlan === plan.id ? 'default' : 'pointer',
                    fontWeight: 700,
                    fontSize: 14,
                    fontFamily: 'Inter, sans-serif',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'all 0.3s ease',
                    background: currentPlan === plan.id
                      ? 'rgba(100, 116, 139, 0.15)'
                      : plan.popular
                        ? plan.gradient
                        : `${plan.color}18`,
                    color: currentPlan === plan.id
                      ? 'var(--text-muted)'
                      : plan.popular
                        ? 'white'
                        : plan.color,
                    boxShadow: plan.popular && currentPlan !== plan.id
                      ? `0 4px 20px ${plan.color}40`
                      : 'none',
                    opacity: loading && selectedPlan === plan.id ? 0.7 : 1,
                  }}
                >
                  {currentPlan === plan.id ? (
                    <>
                      <FiCheck size={16} /> Current Plan
                    </>
                  ) : loading && selectedPlan === plan.id ? (
                    <>
                      <div className="spinner" style={{ width: 16, height: 16 }}></div> Processing...
                    </>
                  ) : plan.id === 'free' ? (
                    'Included Free'
                  ) : (
                    <>
                      Upgrade Now <FiArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Features Grid */}
        <div style={{ marginBottom: 64 }}>
          <h2 style={{
            fontSize: 28, fontWeight: 800, textAlign: 'center', marginBottom: 40,
            background: 'linear-gradient(135deg, var(--text-primary), var(--text-secondary))',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Why Upgrade?
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
            {[
              { icon: FiCpu, title: 'Priority Pipeline', desc: 'Faster processing with dedicated resources', color: '#7c3aed' },
              { icon: FiLayers, title: 'More Credits', desc: 'Up to 25,000 credits for heavy workloads', color: '#3b82f6' },
              { icon: FiGlobe, title: 'Web Scraping', desc: 'Scrape and index live web pages', color: '#06d6a0' },
              { icon: FiTrendingUp, title: 'Analytics', desc: 'Deep insights into your query patterns', color: '#f59e0b' },
            ].map((feat, i) => (
              <div key={i} className="glass-card animate-slide-up" style={{ padding: 24, animationDelay: `${0.3 + i * 0.1}s` }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: `${feat.color}12`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 16,
                }}>
                  <feat.icon size={22} color={feat.color} />
                </div>
                <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{feat.title}</h4>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div style={{ maxWidth: 700, margin: '0 auto', marginBottom: 64 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, textAlign: 'center', marginBottom: 32 }}>
            Frequently Asked Questions
          </h2>
          {[
            { q: 'What happens when my credits run out?', a: 'You\'ll need to upgrade to continue using the AI pipeline. Your documents and chat history remain safe.' },
            { q: 'Can I switch plans anytime?', a: 'Yes! You can upgrade at any time and your new credits will be added to your existing balance.' },
            { q: 'Is the payment secure?', a: 'All payments are processed securely through Razorpay with bank-grade encryption.' },
            { q: 'Do credits carry over?', a: 'Yes, unused credits carry over month-to-month. Upgrade credits are added on top of your existing balance.' },
          ].map((faq, i) => (
            <div key={i} className="glass-card" style={{ padding: '20px 24px', marginBottom: 12 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--primary-light)' }}>{faq.q}</h4>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
