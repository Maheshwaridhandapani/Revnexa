import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search, Filter, Phone, Users, FileText, AlertCircle, CheckCircle } from 'lucide-react'
import { api } from '../lib/api'
import { cn, formatDate } from '../lib/utils'

export default function Records() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    q: '',
    source_type: '',
    transcript: '',
    review_status: '',
    route: '',
  })
  const [meta, setMeta] = useState(null)

  useEffect(() => {
    loadRecords()
    loadMeta()
  }, [filters])

  const loadRecords = async () => {
    setLoading(true)
    try {
      const data = await api.records(filters)
      setRecords(data.records || [])
    } catch (error) {
      console.error('Failed to load records:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadMeta = async () => {
    try {
      const data = await api.meta()
      setMeta(data)
    } catch (error) {
      console.error('Failed toload meta:', error)
    }
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Records</h1>
        <p className="text-gray-600 mt-1">
          {records.length} records found • Routes: {meta?.routes?.join(', ')}
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-card-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, ID, title..."
                value={filters.q}
                onChange={(e) => handleFilterChange('q', e.target.value)}
                className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-royal focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={filters.source_type}
              onChange={(e) => handleFilterChange('source_type', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-royal focus:border-transparent"
            >
              <option value="">All</option>
              <option value="call">Call</option>
              <option value="meeting">Meeting</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Transcript</label>
            <select
              value={filters.transcript}
              onChange={(e) => handleFilterChange('transcript', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-royal focus:border-transparent"
            >
              <option value="">All</option>
              <option value="usable">Has Transcript</option>
              <option value="missing">Missing Transcript</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Review Status</label>
            <select
              value={filters.review_status}
              onChange={(e) => handleFilterChange('review_status', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-royal focus:border-transparent"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="needs_review">Needs Review</option>
            </select>
          </div>
        </div>
      </div>

      {/* Records List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No records found</div>
      ) : (
        <div className="bg-white rounded-xl shadow-card-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Ref</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Person</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Routes</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Freshness</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-royal-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link to={`/records/${record.id}`} className="text-royal hover:text-royal-700 font-medium">
                      {record.record_ref}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {record.source_type === 'call' ? (
                        <Phone className="h-4 w-4 text-royal mr-2" />
                      ) : (
                        <Users className="h-4 w-4 text-green-600 mr-2" />
                      )}
                      <span className="capitalize">{record.source_type}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{record.title || 'Untitled'}</div>
                    <div className="text-xs text-gray-500">{formatDate(record.activity_at)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {record.person_label || 'Unknown'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {record.routes.map((route) => (
                        <span
                          key={route}
                          className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                            record.is_human_corrected
                              ? "bg-orange-100 text-orange-800"
                              : "bg-royal-100 text-royal-800"
                          )}
                        >
                          {route}
                        </span>
                      ))}
                      {record.routes.length === 0 && (
                        <span className="text-gray-400 text-xs">None</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                        record.review_status === 'approved' && "bg-green-100 text-green-800",
                        record.review_status === 'rejected' && "bg-red-100 text-red-800",
                        record.review_status === 'pending' && "bg-yellow-100 text-yellow-800",
                        record.review_status === 'needs_review' && "bg-orange-100 text-orange-800"
                      )}
                    >
                      {record.review_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {record.analysis_freshness === 'stale' && (
                      <span className="text-red-600 flex items-center">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Stale
                      </span>
                    )}
                    {record.analysis_freshness === 'current' && (
                      <span className="text-green-600 flex items-center">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Current
                      </span>
                    )}
                    {record.analysis_freshness === 'pending-review' && (
                      <span className="text-orange-600 flex items-center">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Pending Review
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
