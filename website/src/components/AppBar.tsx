import { Link, useLocation } from 'react-router-dom'
import { Search } from './Search'
import logo from '@/assets/logo.svg'

export function AppBar() {
  const isHome = useLocation().pathname === '/'

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:px-16 md:py-5 lg:px-44 bg-[#161617] ${isHome ? 'md:bg-[#0A0A0C]' : ''}`}>
      <Link to="/" className="cursor-pointer">
        <img src={logo} alt="ComboSkin" className="h-10 md:h-[54px] select-none" draggable={false} />
      </Link>

      <Search />
    </header>
  )
}
