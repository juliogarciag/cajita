import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getAnthropicClient } from './claude.js'
import { authMiddleware } from './middleware.js'

const songsSchema = z.object({
  songs: z.array(
    z.object({
      artist: z.string(),
      title: z.string(),
    }),
  ),
})

const playlistMetaSchema = z.object({
  name: z.string(),
  description: z.string(),
})

type Song = z.infer<typeof songsSchema>['songs'][number]

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getAnthropicClient()
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    temperature: 0.7,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const block = response.content[0]
  if (block.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }
  return block.text
}

function parseJsonResponse<T>(text: string, schema: z.ZodType<T>): T {
  // Extract JSON from response (Claude sometimes wraps in markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text]
  const jsonStr = (jsonMatch[1] ?? text).trim()
  return schema.parse(JSON.parse(jsonStr))
}

export async function generateSongs(prompt: string, count: number): Promise<Song[]> {
  const systemPrompt = `You are a music recommendation expert. You generate song recommendations based on user queries.

Guidelines:
- For mood queries (sad, happy, chill, etc.), pick popular songs that evoke that mood
- For genre queries, pick iconic songs from that genre
- For artist queries, list their popular songs and similar artists
- For decade queries, pick hits from that era
- Mix well-known classics with some popular recent songs when appropriate
- Each song must be a real, existing song

Return your response as a JSON object with a "songs" array. Each song has "artist" and "title" fields.

Example:
{"songs": [{"artist": "Adele", "title": "Someone Like You"}, {"artist": "Johnny Cash", "title": "Hurt"}]}`

  const userPrompt = `Generate exactly ${count} specific, well-known songs that match this request: "${prompt}"`

  const text = await callClaude(systemPrompt, userPrompt)
  const result = parseJsonResponse(text, songsSchema)
  return result.songs.slice(0, count)
}

export async function generateReplacementSong(
  prompt: string,
  currentSongs: Song[],
  rejectedSong: Song,
): Promise<Song> {
  const currentList = currentSongs.map((s) => `${s.artist} - ${s.title}`).join('\n')

  const systemPrompt = `You are a music recommendation expert. You generate song recommendations based on user queries.

Return your response as a JSON object with a "songs" array containing exactly 1 song. Each song has "artist" and "title" fields.

Example:
{"songs": [{"artist": "Adele", "title": "Someone Like You"}]}`

  const userPrompt = `The user wants songs matching: "${prompt}"

They rejected this song: "${rejectedSong.artist} - ${rejectedSong.title}"

Here are the songs already in the list (DO NOT suggest any of these):
${currentList}

Generate exactly 1 DIFFERENT song that:
- Matches the user's original query
- Is NOT similar to the rejected song
- Avoids the same artist as the rejected song
- Is NOT already in the list above`

  const text = await callClaude(systemPrompt, userPrompt)
  const result = parseJsonResponse(text, songsSchema)
  if (result.songs.length === 0) {
    throw new Error('Claude returned no replacement songs')
  }
  return result.songs[0]
}

export async function generatePlaylistMetadata(
  prompt: string,
): Promise<{ name: string; description: string }> {
  const systemPrompt = `Generate a creative playlist name and description.

Return a JSON object with "name" (max 100 chars, short and catchy) and "description" (max 200 chars, brief).

Example:
{"name": "Late Night Vibes", "description": "Smooth tracks for winding down after midnight"}`

  const userPrompt = `Generate a playlist name and description for a playlist based on this query: "${prompt}"`

  const text = await callClaude(systemPrompt, userPrompt)
  return parseJsonResponse(text, playlistMetaSchema)
}

// --- Server Functions ---

export const generatePlaylistSongs = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ prompt: z.string(), count: z.number().optional() }))
  .handler(async ({ data }) => {
    const { prompt, count = 50 } = data
    if (!prompt.trim()) {
      throw new Error('Prompt is required')
    }
    const songs = await generateSongs(prompt, count)
    const meta = await generatePlaylistMetadata(prompt)
    return { songs, suggestedName: meta.name, suggestedDescription: meta.description }
  })

const reloadSongValidator = z.object({
  prompt: z.string(),
  currentSongs: z.array(z.object({ artist: z.string(), title: z.string() })),
  rejectedSong: z.object({ artist: z.string(), title: z.string() }),
})

export const reloadSong = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(reloadSongValidator)
  .handler(async ({ data }) => {
    const song = await generateReplacementSong(data.prompt, data.currentSongs, data.rejectedSong)
    return { song }
  })
