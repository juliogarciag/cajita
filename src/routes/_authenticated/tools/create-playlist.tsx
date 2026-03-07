import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/tools/create-playlist')({
  component: CreatePlaylistPage,
})

function CreatePlaylistPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Create Playlist</h1>
      <p className="mt-2 text-gray-600">
        Describe the playlist you want and AI will generate it for you.
      </p>
    </div>
  )
}
