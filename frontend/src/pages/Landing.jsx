import { Link } from 'react-router-dom'
import { ArrowRight, Play, LayoutDashboard, CheckCircle, Shield, RefreshCw, Brain } from 'lucide-react'

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-royal py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div className="text-white">
              <p className="text-royal-100 font-semibold text-sm tracking-wide uppercase mb-4">
                Evidence-First Revenue Intelligence
              </p>
              <h1 className="text-4xl lg:text-6xl font-bold leading-tight mb-6">
                Turn conversation signals into revenue action.
              </h1>
              <p className="text-xl text-royal-100 mb-8 leading-relaxed">
                Transform sales conversations into traceable insights, evidence-backed decisions, and actionable revenue intelligence.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  to="/dashboard"
                  className="inline-flex items-center justify-center px-8 py-4 bg-white text-royal font-semibold rounded-full hover:bg-royal-50 transition-colors shadow-lg"
                >
                  Explore the Platform
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center justify-center px-8 py-4 bg-transparent border-2 border-white text-white font-semibold rounded-full hover:bg-white/10 transition-colors"
                >
                  <Play className="mr-2 h-5 w-5" />
                  View Product Demo
                </Link>
              </div>
            </div>

            {/* Right Content - Dashboard Preview */}
            <div className="relative">
              <div className="bg-white rounded-2xl shadow-floating p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Dashboard Preview</h3>
                  <span className="text-xs text-gray-500">Live</span>
                </div>
                
                {/* Mini KPI Cards */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="bg-royal-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-royal">44</div>
                    <div className="text-xs text-gray-600">Records</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-green-600">18</div>
                    <div className="text-xs text-gray-600">Transcripts</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-purple-600">92%</div>
                    <div className="text-xs text-gray-600">Coverage</div>
                  </div>
                </div>

                {/* Evidence Verification Status */}
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700">Evidence Verification</span>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Verified</span>
                      <span className="text-green-600 font-medium">156</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Needs Review</span>
                      <span className="text-yellow-600 font-medium">12</span>
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="space-y-2">
                  <div className="flex items-center text-xs text-gray-600">
                    <RefreshCw className="h-3 w-3 mr-2 text-royal" />
                    <span>Agent handoff completed</span>
                  </div>
                  <div className="flex items-center text-xs text-gray-600">
                    <Brain className="h-3 w-3 mr-2 text-royal" />
                    <span>AI analysis updated</span>
                  </div>
                </div>
              </div>

              {/* Floating Elements */}
              <div className="absolute -top-4 -right-4 bg-white rounded-lg shadow-card p-3">
                <div className="flex items-center space-x-2">
                  <Shield className="h-5 w-5 text-green-500" />
                  <span className="text-sm font-medium text-gray-700">Evidence Gate Active</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Intelligence You Can Trust
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Four signature capabilities that set Revnexa apart
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard
              icon={<Brain className="h-8 w-8 text-royal" />}
              title="AI Meeting Fact Checker"
              description="Validate extracted claims against supplied transcript text in real-time."
            />
            <FeatureCard
              icon={<Shield className="h-8 w-8 text-royal" />}
              title="Evidence Gate"
              description="Verify source existence, quote matching, version, and freshness."
            />
            <FeatureCard
              icon={<RefreshCw className="h-8 w-8 text-royal" />}
              title="Agent Handoff Timeline"
              description="Visualize the workflow of three collaborating logical agents."
            />
            <FeatureCard
              icon={<LayoutDashboard className="h-8 w-8 text-royal" />}
              title="Decision Memory"
              description="Show AI recommendations alongside manager corrections."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-royal-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
            Ready to transform your revenue intelligence?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Start using Revnexa today and turn conversation signals into actionable insights.
          </p>
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center px-8 py-4 bg-royal text-white font-semibold rounded-full hover:bg-royal-700 transition-colors shadow-lg"
          >
            Open Dashboard
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </div>
      </section>
    </div>
  )
}

function FeatureCard({ icon, title, description }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-card-lg transition-shadow group">
      <div className="mb-4 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm leading-relaxed">{description}</p>
    </div>
  )
}
