import { NavLink, Outlet } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { cn } from '@/lib/utils'
import { navItems } from './nav-items'

export function AppShell() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="flex min-h-svh">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-background md:flex">
          <div className="flex h-16 items-center gap-2 border-b border-border px-6">
            <Compass className="size-6 text-primary" />
            <span className="text-lg font-semibold tracking-tight">PaydayPilot</span>
          </div>
          <nav className="flex flex-1 flex-col gap-1 p-3">
            {navItems.map(({ label, path, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center border-b border-border px-4 md:hidden">
            <Compass className="size-5 text-primary" />
            <span className="ml-2 text-base font-semibold tracking-tight">PaydayPilot</span>
          </header>

          <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-8 md:pb-8">
            <Outlet />
          </main>

          <nav className="fixed inset-x-0 bottom-0 flex border-t border-border bg-background md:hidden">
            {navItems.map(({ label, path, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition-colors',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )
                }
              >
                <Icon className="size-5" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </div>
  )
}
