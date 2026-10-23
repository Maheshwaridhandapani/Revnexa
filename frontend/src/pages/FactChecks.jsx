import { useState, useEffect } from 'react'
import { CheckCircle, AlertTriangle, XCircle, HelpCircle, RefreshCw, Shield } from 'lucide-react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

export default function FactChecks() {
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    loadClaims()
  }, [filter])

  const loadClaims = async () => {
    setLoading(true)
    try {
      const data = await api.factChecks(filter ? { status: filter } : {})
      setClaims(data.claims || [])
    } catch (error) {
      console.error('Failed to load claims:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRunGate = async (findingId) => {
    try {
      await api.runGate(findingId)
      await loadClaims()
    } catch (error) {
      console.error('Failed to run gate:', error)
      alert('Failed to run gate: ' + error.message)
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Supported by transcript':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'Partially supported':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />
      case 'Unsupported':
        return <XCircle className="h-5 w-5 text-red-600" />
      case 'Ambiguous':
      case 'Needs human review':
        return <HelpCircle className="h-5 w-5 text-orange-600" />
      default:
        return <HelpCircle className="h-5 w-5 text-gray-400" />
    }
  }

  const getGateBadge = (status) => {
    switch (status) {
      case 'Verified':
        return 'bg-green-100 text-green-800'
      case 'Needs Review':
        return 'bg-yellow-100 text-yellow-800'
      case 'Invalid Evidence':
        return 'bg-red-100 text-red-800'
      case 'Stale':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Real-Time AI Meeting Fact Checker</h1>
          <p className="text-gray-600 mt-1">
            Signature Feature 1 — Verify claims against transcript evidence
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-royal focus:border-transparent"
          >
            <option value="">All Statuses</option>
            <option value="Supported by transcript">Supported</option>
            <option value="Partially supported">Partially Supported</option>
            <option value="Unsupported">Unsupported</option>
            <option value="Ambiguous">Ambiguous</option>
            <option value="Needs human review">Needs Review</option>
            <option value="Stale — source changed">Stale</option>
          </select>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-royal-50 border border-royal-200 rounded-xl p-4">
        <div className="flex items-start">
          <Shield className="h-5 w-5 text-royal mt-0.5 mr-3" />
          <div className="text-sm text-royal-900">
            <p className="font-medium mb-1">Evidence-First Verification</p>
            <p>
              Every claim is validated against the actual transcript text. We never invent quotes.
              A quote's existence does not prove every interpretation is correct.
              Statuses reflect what the evidence supports, not what we wish it said.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-royal" />
        </div>
      ) : claims.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No claims found</div>
      ) : (
        <div className="space-y-4">
          {claims.map((claim) => (
            <div key={claim.id} className="bg-white rounded-xl shadow-card-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start space-x-3">
                  {getStatusIcon(claim.verification_status)}
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="font-medium text-gray-900">{claim.record_ref}</span>
                      <span className="text-gray-400">•</span>
                      <span className="text-sm text-gray-600 capitalize">{claim.category}</span>
                    </div>
                    <p className="text-gray-900 font-medium">{claim.finding_text}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", getGateBadge(claim.evidence_gate_status))}>
                    {claim.evidence_gate_status}
                  </span>
                  <button
                    onClick={() => handleRunGate(claim.id)}
                    className="p-2 text-gray-400 hover:text-royal hover:bg-royal-50 rounded"
                    title="Run Evidence Gate"
                  >
                    <Shield className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {claim.evidence_quote && (
                <div className="bg-gray-50 rounded-lg p-4 mb-3">
                  <div className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                    <span className="font-medium">Evidence Quote:</span>
                    {claim.turn_number && (
                      <>
                        <span>•</span>
                        <span>Turn {claim.turn_number}</span>
                        <span>•</span>
                        <span>{claim.speaker}</span>
                      </>
                    )}
                  </div>
                  <p className="text-gray-900 italic">"{claim.evidence_quote}"</p>
                </div>
              )}

              {claim.verification_reason && (
                <div className="text-sm text-gray-600 mb-3">
                  <span className="font-medium">Reason:</span> {claim.verification_reason}
                </div>
              )}

              {claim.limitations && (
                <div className="text-sm text-gray-600 mb-3">
                  <span className="font-medium">Limitations:</span> {claim.limitations}
                </div>
              )}

              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <span>Source revision: {claim.source_revision}</span>
                {claim.is_stale && (
                  <span className="text-red-600 font-medium">Stale — source changed</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
