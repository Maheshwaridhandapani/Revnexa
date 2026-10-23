import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  ArrowLeft, Phone, Users, FileText, CheckCircle, AlertTriangle, 
  RefreshCw, Edit, Save, X, Clock, Shield, Bot
} from 'lucide-react'
import { api } from '../lib/api'
import { cn, formatDate } from '../lib/utils'

export default function RecordDetail() {
  const { id } = useParams()
  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editingRoute, setEditingRoute] = useState(false)
  const [selectedRoutes, setSelectedRoutes] = useState([])
  const [routeNote, setRouteNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [gating, setGating] = useState(false)
  const [gateResult, setGateResult] = useState(null)
  const [gateError, setGateError] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState(null)
  const [allAvailableRoutes, setAllAvailableRoutes] = useState([
    'Sales Coaching', 'Deal Next Steps', 'Customer Follow-up',
    'Internal/Vendor Notes', 'Human Decision Required', 'Do Not Contact', 'No Action Required',
  ])

  useEffect(() => {
    loadRecord()
    // Load available routes from meta
    api.meta().then(m => { if (m?.routes) setAllAvailableRoutes(m.routes) }).catch(() => {})
  }, [id])

  const loadRecord = async () => {
    setLoading(true)
    try {
      const data = await api.record(id)
      setRecord(data)
      setSelectedRoutes(data.routing?.current_routes || [])
    } catch (error) {
      console.error('Failed to load record:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveRoute = async () => {
    setSaving(true)
    try {
      await api.correctRoute(id, selectedRoutes, routeNote, 'approved')
      await loadRecord()
      setEditingRoute(false)
    } catch (error) {
      console.error('Failed to save route:', error)
      alert('Failed to save route: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRunGate = async () => {
    setGating(true)
    setGateResult(null)
    setGateError(null)
    try {
      const result = await api.runRecordGate(id)
      setGateResult(result)
      await loadRecord()
    } catch (error) {
      setGateError(error.message)
      console.error('Failed to run gate:', error)
    } finally {
      setGating(false)
    }
  }

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      const result = await api.analyzeRecord(id)
      await loadRecord()
    } catch (error) {
      setAnalyzeError(error.message)
      console.error('Failed to analyze:', error)
    } finally {
      setAnalyzing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!record) {
    return <div className="text-center py-12 text-gray-500">Record not found</div>
  }

  const allRoutes = record.routing?.ai_suggested_routes || []

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center space-x-4">
            <Link to="/records" className="text-gray-600 hover:text-gray-900">
              <ArrowLeft className="h-6 w-6" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {record.record_ref} — {record.title || 'Untitled'}
              </h1>
              <p className="text-gray-600 mt-1 flex flex-wrap items-center gap-x-2">
                {record.source_type === 'call' ? (
                  <span className="flex items-center">
                    <Phone className="h-4 w-4 mr-1 text-royal" /> Call
                  </span>
                ) : (
                  <span className="flex items-center">
                    <Users className="h-4 w-4 mr-1 text-green-600" /> Meeting
                  </span>
                )}
                <span>•</span>
                {record.person_label || 'Unknown person'}
                <span>•</span>
                Revision {record.applied_revision}
                <span>•</span>
                {formatDate(record.activity_at)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleRunGate}
              disabled={gating}
              className="flex items-center px-6 py-2.5 bg-purple-600 text-white rounded-full hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-md"
            >
              {gating ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Shield className="h-4 w-4 mr-2" />
              )}
              Run Evidence Gate
            </button>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="flex items-center px-6 py-2.5 bg-royal text-white rounded-full hover:bg-royal-700 disabled:opacity-50 transition-colors shadow-md"
            >
              {analyzing ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Re-Analyze
            </button>
          </div>
        </div>

        {/* Feedback banners — outside the flex row */}
        {gateResult && (
          <div className="p-4 rounded-lg bg-purple-50 border border-purple-200">
            <div className="font-semibold mb-1 text-purple-900">Evidence Gate Results</div>
            {Array.isArray(gateResult.results) ? (
              <ul className="list-disc ml-5 space-y-1 text-sm text-purple-800">
                {gateResult.results.map((res, idx) => (
                  <li key={idx}>
                    <span className="font-medium">{res.gate_status}</span>: {res.reasons?.join('; ') || 'No issues'}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-purple-800">
                <span className="font-medium">{gateResult.gate_status}</span>: {gateResult.reasons?.join('; ') || 'No issues'}
              </div>
            )}
          </div>
        )}
        {gateError && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <span className="font-semibold">Evidence Gate Error: </span>{gateError}
          </div>
        )}
        {analyzeError && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <span className="font-semibold">Re-Analyze Error: </span>{analyzeError}
          </div>
        )}
      </div>

      {/* Routing Card */}
      <div className="bg-white rounded-xl shadow-card-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Routing Decision</h2>
          {!editingRoute && (
            <button
              onClick={() => setEditingRoute(true)}
              className="flex items-center px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
            >
              <Edit className="h-4 w-4 mr-1" />
              Edit Route
            </button>
          )}
        </div>

        {editingRoute ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Routes</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {allAvailableRoutes.map((route) => (
                  <label key={route} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={selectedRoutes.includes(route)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRoutes([...selectedRoutes, route])
                        } else {
                          setSelectedRoutes(selectedRoutes.filter(r => r !== route))
                        }
                      }}
                      className="rounded border-gray-300 text-royal focus:ring-royal"
                    />
                    <span className="text-sm">{route}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Note (optional)</label>
              <input
                type="text"
                value={routeNote}
                onChange={(e) => setRouteNote(e.target.value)}
                placeholder="Why this change?"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-royal focus:border-transparent"
              />
            </div>
            <div className="flex space-x-3">
              <button
                onClick={handleSaveRoute}
                disabled={saving}
                className="flex items-center px-6 py-2.5 bg-royal text-white rounded-full hover:bg-royal-700 disabled:opacity-50 transition-colors shadow-md"
              >
                {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save
              </button>
              <button
                onClick={() => {
                  setEditingRoute(false)
                  setSelectedRoutes(record.routing?.current_routes || [])
                  setRouteNote('')
                }}
                className="flex items-center px-6 py-2.5 bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 transition-colors"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {record.routing?.current_routes?.map((route) => (
                <span
                  key={route}
                  className={cn(
                    "inline-flex items-center px-3 py-1 rounded-full text-sm font-medium",
                    record.routing?.is_human_corrected
                      ? "bg-orange-100 text-orange-800"
                      : "bg-royal-100 text-royal-800"
                  )}
                >
                  {route}
                  {record.routing?.is_human_corrected && (
                    <Edit className="h-3 w-3 ml-1" />
                  )}
                </span>
              ))}
            </div>
            {record.routing?.review_note && (
              <p className="text-sm text-gray-600 italic">"{record.routing.review_note}"</p>
            )}
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <span>Status: <span className="font-medium capitalize">{record.routing?.review_status}</span></span>
              {record.routing?.is_human_corrected && (
                <span className="text-orange-600">Human corrected</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Transcript Card */}
      {record.usable_text && (
        <div className="bg-white rounded-xl shadow-card-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Transcript</h2>
          {record.source_type === 'meeting' && record.turns && record.turns.length > 0 ? (
            <div className="space-y-4">
              {record.turns.map((turn) => (
                <div key={turn.turn_number} className="border-l-2 border-royal-200 pl-4">
                  <div className="flex items-center space-x-2 text-sm text-gray-600 mb-1">
                    <span className="font-medium">Turn {turn.turn_number}</span>
                    <span>•</span>
                    <span>{turn.speaker}</span>
                    <span>•</span>
                    <span>{turn.timecode}</span>
                  </div>
                  <p className="text-gray-900">{turn.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="prose max-w-none">
              <p className="text-gray-900 whitespace-pre-wrap">{record.usable_text}</p>
            </div>
          )}
        </div>
      )}

      {/* Findings Card */}
      {record.findings && record.findings.length > 0 && (
        <div className="bg-white rounded-xl shadow-card-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Findings</h2>
          <div className="space-y-4">
            {record.findings.map((finding) => (
              <div key={finding.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-royal-100 text-royal-800">
                    {finding.category}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                      finding.verification_status === 'Supported by transcript' && "bg-green-100 text-green-800",
                      finding.verification_status === 'Partially supported' && "bg-yellow-100 text-yellow-800",
                      finding.verification_status === 'Unsupported' && "bg-red-100 text-red-800",
                      finding.verification_status === 'Needs human review' && "bg-orange-100 text-orange-800"
                    )}
                  >
                    {finding.verification_status}
                  </span>
                </div>
                <p className="text-gray-900 mb-2">{finding.finding_text}</p>
                {finding.evidence_quote && (
                  <div className="bg-gray-50 rounded p-3 mb-2">
                    <p className="text-sm text-gray-600 italic">"{finding.evidence_quote}"</p>
                    {finding.turn_number && (
                      <p className="text-xs text-gray-500 mt-1">Turn {finding.turn_number} • {finding.speaker}</p>
                    )}
                  </div>
                )}
                {finding.evidence_gate_status && (
                  <div className="flex items-center text-sm">
                    <Shield className="h-4 w-4 mr-1 text-purple-600" />
                    <span className="text-gray-600">Gate: <span className="font-medium">{finding.evidence_gate_status}</span></span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent Events Card */}
      {record.agent_events && record.agent_events.length > 0 && (
        <div className="bg-white rounded-xl shadow-card-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Agent Handoff Timeline</h2>
          <div className="space-y-4">
            {record.agent_events.map((event) => (
              <div key={event.id} className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <Bot className="h-5 w-5 text-royal" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-900">{event.agent_name}</span>
                    <span className="text-gray-400">•</span>
                    <span className="text-sm text-gray-600 capitalize">{event.event_type}</span>
                    <span className="text-gray-400">•</span>
                    <span className="text-sm text-gray-500">{formatDate(event.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Mode: <span className="font-medium">{event.processing_mode}</span>
                    {event.status && <span> • Status: <span className="capitalize">{event.status}</span></span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decision History Card */}
      {record.history && record.history.length > 0 && (
        <div className="bg-white rounded-xl shadow-card-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Decision History</h2>
          <div className="space-y-3">
            {record.history.map((h) => (
              <div key={h.id} className="border-l-2 border-gray-200 pl-4">
                <div className="flex items-center space-x-2 text-sm">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">{formatDate(h.created_at)}</span>
                  <span className="text-gray-400">•</span>
                  <span className="font-medium text-gray-900">{h.actor}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {h.note || 'Route change'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
