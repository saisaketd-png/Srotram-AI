/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        aegis: {
          black: '#020617',
          dark: '#0a0f1e',
          panel: '#0f172a',
          border: '#1e293b',
          green: '#22c55e',
          'green-dim': '#166534',
          red: '#ef4444',
          'red-dim': '#991b1b',
          amber: '#f59e0b',
          cyan: '#06b6d4',
          blue: '#3b82f6',
          text: '#e2e8f0',
          muted: '#64748b'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'scan-line': 'scanLine 3s linear infinite',
        'shield-spin': 'shieldSpin 8s linear infinite',
        'fade-in-up': 'fadeInUp 0.5s ease-out'
      },
      keyframes: {
        pulseGlow: { '0%, 100%': { opacity: '0.4' }, '50%': { opacity: '1' } },
        scanLine: { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(100%)' } },
        shieldSpin: { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
        fadeInUp: { '0%': { opacity: '0', transform: 'translateY(20px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } }
      }
    }
  },
  plugins: []
}
