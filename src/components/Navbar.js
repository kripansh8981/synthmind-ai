'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { FiBarChart2, FiFolder, FiMessageSquare, FiZap, FiLogOut, FiUser, FiArrowUpRight } from 'react-icons/fi';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      const u = JSON.parse(userData);
      setUser(u);
      setCredits(u.credits || 0);
    }
  }, []);

  // Listen for credit updates
  useEffect(() => {
    const handleCredits = (e) => setCredits(e.detail);
    window.addEventListener('credits-update', handleCredits);
    return () => window.removeEventListener('credits-update', handleCredits);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  const navItems = [
    { label: 'Dashboard', icon: FiBarChart2, path: '/dashboard' },
    { label: 'Workspace', icon: FiFolder, path: '/workspace' },
    { label: 'Chat', icon: FiMessageSquare, path: '/chat' },
  ];

  return (
    <nav style={{
      background: 'rgba(3, 7, 18, 0.85)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--border-color)',
      padding: '0 24px',
      height: '56px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
           onClick={() => router.push('/dashboard')}>
        <div style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: 'linear-gradient(135deg, var(--primary), var(--accent-secondary))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '16px',
          boxShadow: '0 2px 8px var(--primary-glow)',
        }}>🧠</div>
        <span style={{
          fontWeight: 700, fontSize: 17,
          background: 'linear-gradient(135deg, var(--primary-light), var(--accent))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          letterSpacing: '-0.02em',
        }}>
          SynthMind
        </span>
      </div>

      {/* Nav Links */}
      <div style={{ display: 'flex', gap: 2 }}>
        {navItems.map(item => (
          <button key={item.path}
            onClick={() => router.push(item.path)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '7px 16px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: 13,
              fontFamily: 'Inter, sans-serif',
              transition: 'all 0.2s ease',
              background: pathname === item.path
                ? 'rgba(14, 165, 233, 0.12)'
                : 'transparent',
              color: pathname === item.path ? 'var(--primary-light)' : 'var(--text-muted)',
              borderBottom: pathname === item.path ? '2px solid var(--primary)' : '2px solid transparent',
            }}>
            <item.icon size={15} />
            {item.label}
          </button>
        ))}
      </div>

      {/* Right Side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Credits */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 12px',
          borderRadius: 8,
          background: credits <= 10 ? 'rgba(244, 63, 94, 0.1)' : 'rgba(14, 165, 233, 0.08)',
          border: `1px solid ${credits <= 10 ? 'rgba(244, 63, 94, 0.25)' : 'rgba(14, 165, 233, 0.2)'}`,
        }}>
          <FiZap size={13} color={credits <= 10 ? 'var(--danger)' : 'var(--primary-light)'} />
          <span style={{ fontSize: 12, fontWeight: 600, color: credits <= 10 ? 'var(--danger)' : 'var(--primary-light)' }}>
            {credits}
          </span>
        </div>

        {/* Upgrade Button */}
        <button
          onClick={() => router.push('/upgrade')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '5px 12px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 11,
            fontFamily: 'Inter, sans-serif',
            background: credits <= 10
              ? 'linear-gradient(135deg, var(--danger), #fb923c)'
              : 'linear-gradient(135deg, var(--accent), #d97706)',
            color: credits <= 10 ? 'white' : '#1c1917',
            transition: 'all 0.2s ease',
            animation: credits <= 0 ? 'pulse-glow 2s infinite' : 'none',
            letterSpacing: '0.02em',
          }}
        >
          <FiArrowUpRight size={12} />
          {credits <= 0 ? 'Upgrade Now' : 'Upgrade'}
        </button>

        {/* User */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '4px 10px',
          borderRadius: 8,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
        }}>
          <div style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: 'linear-gradient(135deg, var(--primary), var(--accent-secondary))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <FiUser size={13} color="white" />
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email || ''}
          </span>
        </div>

        {/* Logout */}
        <button onClick={handleLogout} className="btn-danger" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', fontSize: 12 }}>
          <FiLogOut size={13} /> Logout
        </button>
      </div>
    </nav>
  );
}
