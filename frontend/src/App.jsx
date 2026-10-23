import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { LayoutDashboard, FileText, BarChart3, RefreshCw, Menu, X, Play, LogOut, User } from 'lucide-react'
import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Dashboard from './pages/Dashboard'
import Records from './pages/Records'
import RecordDetail from './pages/RecordDetail'
import FactChecks from './pages/FactChecks'
import AgentTimeline from './pages/AgentTimeline'
import Brief from './pages/Brief'
import Landing from './pages/Landing'
import Login from './pages/Login'
import ProtectedRoute from './components/ProtectedRoute'
import { cn } from './lib/utils'

function AppContent() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { user, logout } = useAuth()

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-white">
        <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <Link to="/" className="flex items-center space-x-2">
                  <div className="bg-royal rounded-lg p-2">
                    <LayoutDashboard className="h-6 w-6 text-white" />
                  </div>
                  <span className="text-xl font-bold text-gray-900">Revnexa</span>
                </Link>
              </div>

              {/* Desktop Navigation */}
              <div className="hidden lg:flex items-center space-x-8">
                <NavLink to="/">Overview</NavLink>
                <NavLink to="/dashboard">Platform</NavLink>
                <NavLink to="/fact-checks">Evidence Intelligence</NavLink>
                <NavLink to="/records">Solutions</NavLink>
                <NavLink to="/brief">Resources</NavLink>
              </div>

              {/* Desktop CTA Buttons */}
              <div className="hidden lg:flex items-center space-x-4">
                {user ? (
                  <>
                    <div className="flex items-center space-x-3 border-l border-gray-200 pl-4">
                      <div className="flex items-center space-x-2">
                        <User className="h-4 w-4 text-gray-600" />
                        <span className="text-sm text-gray-700">{user.username}</span>
                      </div>
                      <button
                        onClick={logout}
                        className="flex items-center px-3 py-2 text-sm text-gray-600 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        title="Logout"
                      >
                        <LogOut className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <Link
                      to="/login"
                      className="px-4 py-2 text-royal font-medium rounded-full border-2 border-royal hover:bg-royal-50 transition-colors"
                    >
                      View Demo
                    </Link>
                    <Link
                      to="/login"
                      className="px-6 py-2 bg-royal text-white font-medium rounded-full hover:bg-royal-700 transition-colors"
                    >
                      Open Dashboard
                    </Link>
                  </>
                )}
              </div>

              {/* Mobile Menu Button */}
              <div className="lg:hidden flex items-center">
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="p-2 rounded-md text-gray-600 hover:bg-gray-100"
                >
                  {mobileMenuOpen ? (
                    <X className="h-6 w-6" />
                  ) : (
                    <Menu className="h-6 w-6" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden border-t border-gray-100 bg-white">
              <div className="px-4 py-4 space-y-3">
                <MobileNavLink to="/" onClick={() => setMobileMenuOpen(false)}>Overview</MobileNavLink>
                <MobileNavLink to="/dashboard" onClick={() => setMobileMenuOpen(false)}>Platform</MobileNavLink>
                <MobileNavLink to="/fact-checks" onClick={() => setMobileMenuOpen(false)}>Evidence Intelligence</MobileNavLink>
                <MobileNavLink to="/records" onClick={() => setMobileMenuOpen(false)}>Solutions</MobileNavLink>
                <MobileNavLink to="/brief" onClick={() => setMobileMenuOpen(false)}>Resources</MobileNavLink>
                <div className="pt-4 space-y-3">
                  {user ? (
                    <>
                      <div className="flex items-center space-x-2 px-4 py-2 bg-gray-50 rounded-lg">
                        <User className="h-4 w-4 text-gray-600" />
                        <span className="text-sm text-gray-700">{user.username}</span>
                      </div>
                      <button
                        onClick={() => {
                          logout()
                          setMobileMenuOpen(false)
                        }}
                        className="flex items-center px-4 py-2 text-sm text-gray-600 hover:text-red-600 rounded-lg hover:bg-red-50"
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Logout
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        to="/login"
                        onClick={() => setMobileMenuOpen(false)}
                        className="block w-full px-4 py-2 text-royal font-medium rounded-full border-2 border-royal text-center"
                      >
                        View Demo
                      </Link>
                      <Link
                        to="/login"
                        onClick={() => setMobileMenuOpen(false)}
                        className="block w-full px-4 py-2 bg-royal text-white font-medium rounded-full text-center"
                      >
                        Open Dashboard
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </nav>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
              errorElement={<ErrorPage />}
            />
            <Route
              path="/records"
              element={
                <ProtectedRoute>
                  <Records />
                </ProtectedRoute>
              }
            />
            <Route
              path="/records/:id"
              element={
                <ProtectedRoute>
                  <RecordDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/fact-checks"
              element={
                <ProtectedRoute>
                  <FactChecks />
                </ProtectedRoute>
              }
            />
            <Route
              path="/agents"
              element={
                <ProtectedRoute>
                  <AgentTimeline />
                </ProtectedRoute>
              }
            />
            <Route
              path="/brief"
              element={
                <ProtectedRoute>
                  <Brief />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

function NavLink({ to, children }) {
  return (
    <Link
      to={to}
      className={({ isActive }) =>
        cn(
          "text-sm font-medium transition-colors",
          isActive
            ? "text-royal"
            : "text-gray-600 hover:text-royal"
        )
      }
    >
      {children}
    </Link>
  )
}

function MobileNavLink({ to, onClick, children }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="block px-4 py-2 text-gray-600 hover:text-royal hover:bg-gray-50 rounded-lg transition-colors"
    >
      {children}
    </Link>
  )
}

function ErrorPage() {
  return (
    <div className="text-center py-12">
      <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
      <p className="text-gray-600 mt-2">Please refresh the page and try again.</p>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
