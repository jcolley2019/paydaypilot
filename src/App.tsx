import { Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { Dashboard } from '@/pages/Dashboard'
import { Bills } from '@/pages/Bills'
import { Buckets } from '@/pages/Buckets'
import { Settings } from '@/pages/Settings'

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/buckets" element={<Buckets />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

export default App
