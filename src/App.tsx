import { Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { Login } from '@/pages/Login'
import { Onboarding } from '@/pages/Onboarding'
import { Dashboard } from '@/pages/Dashboard'
import { Bills } from '@/pages/Bills'
import { Buckets } from '@/pages/Buckets'
import { Credit } from '@/pages/Credit'
import { Plan } from '@/pages/Plan'
import { Settings } from '@/pages/Settings'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { OfflineBanner } from '@/components/layout/OfflineBanner'

function App() {
  return (
    <TooltipProvider>
      <OfflineBanner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute requireOnboarded={false}>
              <Onboarding />
            </ProtectedRoute>
          }
        />
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
          <Route path="/credit" element={<Credit />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
      <Toaster position="top-right" />
    </TooltipProvider>
  )
}

export default App
