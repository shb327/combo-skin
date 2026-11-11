import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiSearch } from 'react-icons/fi'
import { getAllKnives } from '@/data/knives'
import { getAllGloves } from '@/data/gloves'
import { finishCount } from '@/api/counts'
import { useComboCounts } from '@/api/queries'
import { comboCount } from '@/components/comboText'

const ALIASES: Record<string, string[]> = {
  'bfk': ['butterfly'],
  'kara': ['karambit'],
  'bayo': ['bayonet'],
  'daggers': ['shadow daggers'],
  'sd': ['shadow daggers'],
  'bt': ['butterfly'],
  'hw': ['hand wraps'],
  'bf': ['broken fang'],
  'ch': ['case hardened'],
  'cw': ['crimson web'],
  'mf': ['marble fade'],
  'tt': ['tiger tooth'],
  'bp': ['black pearl'],
  'p1': ['phase 1'],
  'p2': ['phase 2'],
  'p3': ['phase 3'],
  'p4': ['phase 4'],
}

interface SearchItem {
  id: string
  fullName: string
  type: 'knife' | 'glove'
  typeId: string
  finishId: string
}

export function Search() {
  const [isOpen, setIsOpen] = useState(false)
  // Counts are asked for once the search has been opened, not on every page load.
  const [opened, setOpened] = useState(false)
  const counts = useComboCounts(opened)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const allItems = useMemo<SearchItem[]>(() => {
    const knives = getAllKnives().map((k) => ({
      id: k.id,
      fullName: k.fullName,
      type: 'knife' as const,
      typeId: k.typeId,
      finishId: k.finishId,
    }))
    const gloves = getAllGloves().map((g) => ({
      id: g.id,
      fullName: g.fullName,
      type: 'glove' as const,
      typeId: g.typeId,
      finishId: g.finishId,
    }))
    return [...knives, ...gloves]
  }, [])

  const filteredItems = useMemo(() => {
    if (!query.trim()) {
      return allItems.slice(0, 6)
    }
    const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean)

    const expandedWords = queryWords.map((word) => {
      const aliases = ALIASES[word]
      return aliases ? [word, ...aliases] : [word]
    })

    return allItems
      .filter((item) => {
        const lowerName = item.fullName.toLowerCase()
        return expandedWords.every((wordOptions) =>
          wordOptions.some((word) => lowerName.includes(word))
        )
      })
      .slice(0, 6)
  }, [query, allItems])

  const open = () => {
    setIsOpen(true)
    setOpened(true)
  }

  /** The item's published combos, or null while counts load, fail, or for none. */
  const countOf = (item: SearchItem): string | null => {
    if (!counts) return null
    const count = finishCount(counts, item.type === 'knife' ? 'knives' : 'gloves', item.typeId, item.finishId)
    return count > 0 ? comboCount(count) : null
  }

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const handleItemClick = (item: SearchItem) => {
    setIsOpen(false)
    setQuery('')
    if (item.type === 'knife') {
      navigate(`/knives/${item.typeId}/${item.finishId}/combos`)
    } else {
      navigate(`/gloves/${item.typeId}/${item.finishId}/combos`)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {!isOpen ? (
        <>
          {/* Mobile: icon only */}
          <button
            onClick={open}
            className="md:hidden flex items-center justify-center w-10 h-10 text-white/70 hover:text-white transition-colors"
          >
            <FiSearch className="w-5 h-5" />
          </button>
          {/* Desktop: pill button */}
          <button
            onClick={open}
            className="hidden md:flex items-center gap-3 px-6 py-2.5 w-72 text-sm text-white/50 bg-[#27272a] rounded-full hover:bg-[#323236] hover:text-white/70 transition-colors"
          >
            <FiSearch className="w-4 h-4" />
            <span>Search</span>
          </button>
        </>
      ) : (
        <>
          {/* Mobile: full-screen overlay */}
          <div className="md:hidden fixed inset-0 z-50 bg-[#0A0A0C] p-4">
            <div className="flex items-center gap-3 px-4 py-3 bg-[#27272a] rounded-full">
              <FiSearch className="w-5 h-5 text-white/50" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search knives & gloves..."
                className="flex-1 bg-transparent text-base text-white placeholder-white/50 outline-none"
              />
              <button
                onClick={() => {
                  setIsOpen(false)
                  setQuery('')
                }}
                className="text-white/50 hover:text-white text-sm"
              >
                Cancel
              </button>
            </div>

            <div className="mt-4">
              {filteredItems.length > 0 ? (
                <ul className="bg-[#27272a] rounded-2xl overflow-hidden">
                  {filteredItems.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => handleItemClick(item)}
                        className="w-full px-4 py-3.5 text-left text-base text-white/80 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5 last:border-0"
                      >
                        {item.fullName}
                        <ResultCount text={countOf(item)} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : query.trim() ? (
                <div className="px-4 py-3 text-base text-white/50">No results found</div>
              ) : null}
            </div>
          </div>

          {/* Desktop: dropdown */}
          <div className="hidden md:block w-72">
            <div className="flex items-center gap-3 px-6 py-2.5 bg-[#27272a] rounded-full">
              <FiSearch className="w-4 h-4 text-white/50" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search knives & gloves..."
                className="flex-1 bg-transparent text-sm text-white placeholder-white/50 outline-none"
              />
            </div>

            <div className="absolute top-full left-0 right-0 mt-2 bg-[#27272a] rounded-2xl shadow-xl overflow-hidden">
              {filteredItems.length > 0 ? (
                <ul className="py-2">
                  {filteredItems.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => handleItemClick(item)}
                        className="w-full px-4 py-2.5 text-left text-sm text-white/80 hover:bg-white/5 hover:text-white transition-colors"
                      >
                        {item.fullName}
                        <ResultCount text={countOf(item)} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-3 text-sm text-white/50">No results found</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** A result's count after its name, in the finish cards' wording. */
function ResultCount({ text }: { text: string | null }) {
  if (!text) return null
  // The space keeps the name and the count apart for screen readers too.
  return (
    <>
      {' '}
      <span className="ml-1 text-white/40 whitespace-nowrap">{text}</span>
    </>
  )
}
