/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        srotram: {
          black: '#0A0C10',
          dark: '#12161D',
          panel: '#1A202C',
          border: '#2D3748',
          text: '#F7FAFC',
          muted: '#A0AEC0',
          green: '#48BB78',
          red: '#F56565',
          cyan: '#38B2AC',
          blue: '#4299E1'
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
