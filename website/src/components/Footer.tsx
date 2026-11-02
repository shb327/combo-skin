import { Link, useLocation } from 'react-router-dom'
import logo from '@/assets/logo.svg'

export function Footer() {
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <footer className={`px-4 py-8 mt-24 md:px-16 lg:px-44 bg-[#161617] ${isHome ? 'md:bg-transparent' : ''}`}>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex flex-col gap-3">
          <Link to="/" className="cursor-pointer">
            <img src={logo} alt="ComboSkin" className="h-[54px] w-auto select-none" draggable={false} />
          </Link>
          <div className="flex flex-col gap-2.5 text-white/50">
            <span className="text-xs">Powered by Steam.</span>
            <span className="text-xs">Not affiliated with Valve Corp.</span>
            <span className="text-sm">2026 @ CHOOSE, LLC.</span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 md:gap-8 text-sm">
          <Link
            to="/terms"
            className="text-white/50 hover:text-white transition-colors"
          >
            Terms of Usage
          </Link>
          <Link
            to="/privacy"
            className="text-white/50 hover:text-white transition-colors"
          >
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  )
}
