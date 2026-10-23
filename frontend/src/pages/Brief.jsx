import { useState, useEffect } from 'react'
import { Download, FileText, Calendar, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react'
import { api } from '../lib/api'
import { formatDate } from '../lib/utils'

export default function Brief() {
  const [brief, setBrief] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadBrief()
  }, [])

  const loadBrief = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.brief()
      setBrief(data)
    } catch (error) {
      console.error('Failed to load brief:', error)
      setError(error.message || 'Failed to load brief data')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    try {
      const result = await api.export()
      if (result.ok) {
        alert('Export generated successfully!')
        window.open('/api/export/download', '_blank')
      }
    } catch (error) {
      console.error('Export failed:', error)
      alert('Export failed: ' + error.message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-royal"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 font-medium">Error loading brief</p>
        <p className="text-gray-500 mt-2">{error}</p>
        <button
          onClick={loadBrief}
          className="mt-4 px-4 py-2 bg-royal text-white rounded-full hover:bg-royal-700"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!brief) {
    return <div className="text-center py-12 text-gray-500">Brief not available</div>
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Manager Brief</h1>
          <p className="text-gray-600 mt-1">
            <Calendar className="h-4 w-4 inline mr-1" />
            {brief.date} ({brief.timezone})
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center px-6 py-2.5 bg-royal text-white rounded-full hover:bg-royal-700 transition-colors shadow-md"
        >
          <Download className="h-4 w-4 mr-2" />
          Export Full Report
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={<FileText className="h-6 w-6 text-royal" />}
          label="Total Records"
          value={brief.metrics?.total_source_records || 0}
          color="royal"
        />
        <StatCard
          icon={<CheckCircle className="h-6 w-6 text-green-600" />}
          label="Usable Transcripts"
          value={brief.metrics?.usable_transcript_text || 0}
          color="green"
        />
        <StatCard
          icon={<AlertTriangle className="h-6 w-6 text-yellow-600" />}
          label="Needs Review"
          value={brief.metrics?.awaiting_review || 0}
          color="yellow"
        />
        <StatCard
          icon={<TrendingUp className="h-6 w-6 text-purple-600" />}
          label="Human Corrected"
          value={brief.metrics?.human_corrected_decisions || 0}
          color="purple"
        />
      </div>

      {/* Important Conversations (Highlights) */}
      {brief.highlights && brief.highlights.length > 0 && (
        <div className="bg-white rounded-xl shadow-card-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Important Conversations</h2>
          <div className="space-y-4">
            {brief.highlights.map((highlight, idx) => (
              <div key={idx} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900">{highlight.record_ref}</span>
                  <span className="text-sm text-gray-600 capitalize">{highlight.category}</span>
                </div>
                <p className="text-sm text-gray-900 font-medium mb-2">{highlight.finding_text}</p>
                {highlight.evidence_quote && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-600 mb-1">Evidence Quote:</p>
                    <p className="text-sm text-gray-700 italic">"{highlight.evidence_quote}"</p>
                  </div>
                )}
                <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                  <span>VerificationStatus: {highlight.verification_status}</span>
                  {highlight.turn_number && (
                    <span>Turn {highlight.turn_number}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Needs Attention */}
      {brief.attention && brief.attention.length > 0 && (
        <div className="bg-white rounded-xl shadow-card-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Cases Needing Attention</h2>
          <div className="space-y-4">
            {brief.attention.map((item, idx) => (
              <div key={idx} className="border-l-4 border-red-400 bg-red-50 rounded-r-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="font-medium text-gray-900">{item.record_ref}</span>
                  <span className="text-sm text-gray-600">•</span>
                  <span className="text-sm text-gray-600 capitalize">{item.source_type}</span>
                </div>
                <div className="space-y-1 text-sm text-gray-700">
                  <p>Review Status: <span className="font-medium capitalize">{item.review_status}</span></p>
                  <p>Analysis Freshness: <span className="font-medium capitalize">{item.analysis_freshness}</span></p>
                  <p>Human Corrected: <span className="font-medium">{item.is_human_corrected ? 'Yes' : 'No'}</span></p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Evidence Notes */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <div className="flex items-start">
          <FileText className="h-5 w-5 text-gray-600 mt-0.5 mr-3" />
          <div className="text-sm text-gray-700">
            <p className="font-medium mb-1">Evidence Notes</p>
            <p>
              This brief is generated from the actual transcript evidence. Every finding is traceable to source.
              Claims without supporting evidence are marked as such. Human review is required for ambiguous or unsupported findings.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color }) {
  const colorClasses = {
    royal: 'bg-royal-50 border-royal-100',
    green: 'bg-green-50 border-green-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    purple: 'bg-purple-50 border-purple-200',
  }
  
  return (
    <div className={`bg-white rounded-xl shadow-card-lg p-6 border ${colorClasses[color] || colorClasses.royal}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        {icon}
      </div>
    </div>
  )
}
