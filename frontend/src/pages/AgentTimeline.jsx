import { useState, useEffect } from 'react'
import { Bot, RefreshCw, Clock, CheckCircle, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

export default function AgentTimeline() {
  const [events, setEvents] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await api.agents()
      setEvents(data.events || [])
      setAgents(data.agents || [])
    } catch (error) {
      console.error('Failed to load agent data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getAgentColor = (agentName) => {
    switch (agentName) {
      case 'Intake & Evidence':
        return 'blue'
      case 'Conversation Intelligence':
        return 'purple'
      case 'Routing & Action':
        return 'green'
      default:
        return 'gray'
    }
  }

  const getModeBadge = (mode) => {
    switch (mode) {
      case 'deterministic':
        return 'bg-blue-100 text-blue-800'
      case 'hybrid_llm':
        return 'bg-purple-100 text-purple-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Agent Handoff Timeline</h1>
        <p className="text-gray-600 mt-1">
          Signature Feature 3 — Transparent multi-agent workflow
        </p>
      </div>

      {/* Agent Descriptions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {agents.map((agent) => (
          <div key={agent.name} className="bg-white rounded-xl shadow-card-lg p-6">
            <div className="flex items-center space-x-3 mb-3">
              <Bot className={`h-6 w-6 text-${getAgentColor(agent.name)}-600`} />
              <h3 className="font-semibold text-gray-900">{agent.name}</h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Mode:</span>
                <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", getModeBadge(agent.mode))}>
                  {agent.mode}
                </span>
              </div>
              <p className="text-sm text-gray-600">{agent.role}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Info Banner */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
        <div className="flex items-start">
          <Bot className="h-5 w-5 text-purple-600 mt-0.5 mr-3" />
          <div className="text-sm text-purple-900">
            <p className="font-medium mb-1">Transparent Agent Workflow</p>
            <p>
              This timeline shows actual work performed by three collaborating logical agents.
              We display real inputs, outputs, status changes, validation results, errors, and handoff information.
              We do not animate fictional progress or claim that an LLM was used when the result came from deterministic logic.
            </p>
          </div>
        </div>
      </div>

      {/* Events Timeline */}
      <div className="bg-white rounded-xl shadow-card-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Event Timeline</h2>
          <button
            onClick={loadData}
            className="flex items-center px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-royal" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No events found</div>
        ) : (
          <div className="space-y-4">
            {events.map((event) => (
              <div key={event.id} className="flex items-start space-x-4 pb-4 border-b border-gray-100 last:border-0">
                <div className="flex-shrink-0">
                  <div className={`w-10 h-10 rounded-full bg-${getAgentColor(event.agent_name)}-100 flex items-center justify-center`}>
                    <Bot className={`h-5 w-5 text-${getAgentColor(event.agent_name)}-600`} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-medium text-gray-900">{event.agent_name}</span>
                    <span className="text-gray-400">•</span>
                    <span className="text-sm text-gray-600 capitalize">{event.event_type}</span>
                    <span className="text-gray-400">•</span>
                    <span className="text-sm text-gray-500">{new Date(event.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center space-x-3 text-sm mb-2">
                    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", getModeBadge(event.processing_mode))}>
                      {event.processing_mode}
                    </span>
                    <span className="flex items-center text-gray-600">
                      {event.status === 'completed' ? (
                        <CheckCircle className="h-4 w-4 text-green-600 mr-1" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-red-600 mr-1" />
                      )}
                      <span className="capitalize">{event.status}</span>
                    </span>
                  </div>
                  {event.error_text && (
                    <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-800">
                      {event.error_text}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
