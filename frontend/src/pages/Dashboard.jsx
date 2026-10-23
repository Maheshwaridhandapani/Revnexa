import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  Phone, Users, FileText, CheckCircle, AlertTriangle, 
  RefreshCw, Download, Play, RotateCcw, TrendingUp 
} from 'lucide-react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

export default function Dashboard() {
  const [meta, setMeta] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [metaData, metricsData] = await Promise.all([
        api.meta(),
        api.dashboard(),
      ])
      setMeta(metaData)
      setMetrics(metricsData)
    } catch (error) {
      console.error('Failed to load dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (action) => {
    setActionLoading(action)
    try {
      if (action === 'demo') {
        await api.demoLoad()
      } else if (action === 'reset') {
        await api.reset()
      } else if (action === 'replay') {
        await api.replay()
      }
      await loadData()
    } catch (error) {
      console.error(`Action ${action} failed:`, error)
      alert(`Action failed: ${error.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const coveragePercent = metrics?.transcript_coverage 
    ? Math.round((metrics.transcript_coverage.numerator / metrics.transcript_coverage.denominator) * 100)
    : 0

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            {meta?.tagline} • AI Mode: {meta?.ai_mode}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleAction('demo')}
            disabled={actionLoading}
            className={cn(
              "flex items-center px-6 py-2.5 bg-royal text-white rounded-full hover:bg-royal-700 disabled:opacity-50 transition-colors shadow-md"
            )}
          >
            {actionLoading === 'demo' ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Demo Load
          </button>
          <button
            onClick={() => handleAction('reset')}
            disabled={actionLoading}
            className="flex items-center px-6 py-2.5 bg-gray-600 text-white rounded-full hover:bg-gray-700 disabled:opacity-50 transition-colors shadow-md"
          >
            {actionLoading === 'reset' ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-2" />
            )}
            Reset
          </button>
          <button
            onClick={() => handleAction('replay')}
            disabled={actionLoading}
            className="flex items-center px-6 py-2.5 bg-green-600 text-white rounded-full hover:bg-green-700 disabled:opacity-50 transition-colors shadow-md"
          >
            {actionLoading === 'replay' ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Run Replay
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          icon={<Phone className="h-6 w-6 text-royal" />}
          label="Total Calls"
          value={metrics?.calls || 0}
          sublabel="Selected records"
          color="royal"
        />
        <MetricCard
          icon={<Users className="h-6 w-6 text-green-600" />}
          label="Total Meetings"
          value={metrics?.meetings || 0}
          sublabel="Selected records"
          color="green"
        />
        <MetricCard
          icon={<FileText className="h-6 w-6 text-purple-600" />}
          label="Usable Transcripts"
          value={metrics?.usable_transcript_text || 0}
          sublabel={`${coveragePercent}% coverage`}
          color="purple"
        />
        <MetricCard
          icon={<CheckCircle className="h-6 w-6 text-emerald-600" />}
          label="Unique Records"
          value={metrics?.total_source_records || 0}
          sublabel="After deduplication"
          color="emerald"
        />
      </div>

      {/* Transcript Coverage */}
      <div className="bg-white rounded-xl shadow-card-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Transcript Coverage</h2>
        <div className="space-y-4">
          <CoverageBar
            label="Calls with transcript"
            current={metrics?.call_transcript_coverage?.numerator || 0}
            total={metrics?.call_transcript_coverage?.denominator || 0}
            color="royal"
          />
          <CoverageBar
            label="Meetings with transcript"
            current={metrics?.meeting_transcript_coverage?.numerator || 0}
            total={metrics?.meeting_transcript_coverage?.denominator || 0}
            color="green"
          />
          <CoverageBar
            label="Overall coverage"
            current={metrics?.transcript_coverage?.numerator || 0}
            total={metrics?.transcript_coverage?.denominator || 0}
            color="purple"
          />
        </div>
      </div>

      {/* Routing Overview */}
      <div className="bg-white rounded-xl shadow-card-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Routing Overview</h2>
        {metrics?.route_distribution && Object.keys(metrics.route_distribution).length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.entries(metrics.route_distribution).map(([route, count]) => (
              <div key={route} className="bg-royal-50 rounded-lg p-4 border border-royal-100">
                <div className="text-2xl font-bold text-royal">{count}</div>
                <div className="text-sm text-gray-700 mt-1">{route}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No routing data available. Load demo data to see routing distribution.</p>
        )}
      </div>

      {/* Review Status */}
      <div className="bg-white rounded-xl shadow-card-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Review Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="text-2xl font-bold text-blue-700">{metrics?.awaiting_analysis || 0}</div>
            <div className="text-sm text-gray-600 mt-1">Awaiting Analysis</div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <div className="text-2xl font-bold text-yellow-700">{metrics?.awaiting_review || 0}</div>
            <div className="text-sm text-gray-600 mt-1">Awaiting Review</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="text-2xl font-bold text-green-700">{metrics?.human_corrected_decisions || 0}</div>
            <div className="text-sm text-gray-600 mt-1">Human Corrected</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <div className="text-2xl font-bold text-purple-700">{metrics?.route_assignment_count || 0}</div>
            <div className="text-sm text-gray-600 mt-1">Routes Assigned</div>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-white rounded-xl shadow-card-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link to="/records" className="flex items-center p-4 bg-royal-50 rounded-lg hover:bg-royal-100 transition-colors border border-royal-100">
            <FileText className="h-5 w-5 text-royal mr-3" />
            <span className="font-medium text-gray-900">View All Records</span>
          </Link>
          <Link to="/records?transcript=missing" className="flex items-center p-4 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors border border-yellow-200">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mr-3" />
            <span className="font-medium text-gray-900">Missing Transcripts</span>
          </Link>
          <Link to="/fact-checks" className="flex items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors border border-purple-200">
            <CheckCircle className="h-5 w-5 text-purple-600 mr-3" />
            <span className="font-medium text-gray-900">View Fact Checks</span>
          </Link>
          <Link to="/brief" className="flex items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors border border-green-200">
            <Download className="h-5 w-5 text-green-600 mr-3" />
            <span className="font-medium text-gray-900">Manager Brief</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ icon, label, value, sublabel, color }) {
  const colorClasses = {
    royal: 'bg-royal-50 border-royal-100',
    green: 'bg-green-50 border-green-200',
    purple: 'bg-purple-50 border-purple-200',
    emerald: 'bg-emerald-50 border-emerald-200',
  }
  
  return (
    <div className={`bg-white rounded-xl shadow-card-lg p-6 border ${colorClasses[color] || colorClasses.royal}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          <p className="text-xs text-gray-500 mt-1">{sublabel}</p>
        </div>
        {icon}
      </div>
    </div>
  )
}

function CoverageBar({ label, current, total, color }) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  const colorClasses = {
    royal: 'bg-royal',
    green: 'bg-green-600',
    purple: 'bg-purple-600',
  }
  
  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="text-gray-700 font-medium">{label}</span>
        <span className="text-gray-600">{current} / {total} ({percent}%)</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className={cn('h-3 rounded-full transition-all', colorClasses[color])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
