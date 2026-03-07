import { createFileRoute, Link } from '@tanstack/react-router'
import { Music } from 'lucide-react'

export const Route = createFileRoute('/_authenticated/tools/')({
  component: ToolsPage,
})

function ToolsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Tools</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          to="/tools/create-playlist"
          className="group rounded-lg border border-gray-200 bg-white p-6 transition-colors hover:border-gray-300 hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-50 text-pink-600 group-hover:bg-pink-100">
              <Music size={20} />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Create Playlist</h2>
              <p className="text-sm text-gray-500">
                Generate an Apple Music playlist with AI
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
