import { Routes, Route } from 'react-router-dom'
import { AppBar } from './components/AppBar'
import { Footer } from './components/Footer'
import { ScrollToTop } from './components/ScrollToTop'
import { Home } from './pages/Home'
import { SearchGloves } from './pages/SearchGloves'
import { SearchKnives } from './pages/SearchKnives'
import { GloveFinishes } from './pages/GloveFinishes'
import { KnifeFinishes } from './pages/KnifeFinishes'
import { Combos } from './pages/Combos'

function App() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ScrollToTop />
      <AppBar />
      <main className="pt-24 flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/gloves" element={<SearchGloves />} />
          <Route path="/gloves/:gloveId" element={<GloveFinishes />} />
          <Route path="/gloves/:itemId/:finishId/combos" element={<Combos />} />
          <Route path="/knives" element={<SearchKnives />} />
          <Route path="/knives/:knifeId" element={<KnifeFinishes />} />
          <Route path="/knives/:itemId/:finishId/combos" element={<Combos />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}

export default App
