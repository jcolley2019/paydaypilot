import { Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { Bills } from '@/pages/Bills'
import { Buckets } from '@/pages/Buckets'
import { Settings } from '@/pages/Settings'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

function App() {
  return (
    <TooltipProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/bills" element={<Bills />} />
          <Route path="/buckets" element={<Buckets />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
      <Toaster position="top-right" />
    </TooltipProvider>
  )
}

export default App
