import { createServerFn } from '@tanstack/react-start'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { getAnthropicClient } from './claude.js'
import { authMiddleware } from './middleware.js'

const MODEL = 'claude-opus-5'

const songSchema = z.object({
  artist: z.string(),
  title: z.string(),
})

// Name and description come back with the songs rather than from a second call,
// so the name can reflect what actually got picked.
const playlistSchema = z.object({
  name: z.string(),
  description: z.string(),
  songs: z.array(songSchema),
})

const replacementSchema = z.object({
  song: songSchema,
})

type Song = z.infer<typeof songSchema>

/**
 * Room for the whole answer. A song entry runs ~20 tokens; 40 leaves slack for
 * long titles, and the flat 400 covers the name, description, and JSON wrapper.
 * The old flat 2048 silently truncated at the 75- and 100-song options.
 */
function budgetFor(songCount: number): number {
  return 400 + songCount * 40
}

async function generate<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  maxTokens: number,
): Promise<T> {
  const client = getAnthropicClient()
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: maxTokens,
    // Picking well-known songs is recall, not reasoning — thinking would spend
    // output tokens without improving the list. Allowed below `xhigh` effort.
    thinking: { type: 'disabled' },
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    output_config: { format: zodOutputFormat(schema) },
  })

  if (!response.parsed_output) {
    throw new Error(`Claude returned no parseable output (stop reason: ${response.stop_reason})`)
  }
  return response.parsed_output
}

export async function generatePlaylist(
  prompt: string,
  count: number,
): Promise<{ name: string; description: string; songs: Song[] }> {
  const systemPrompt = `You are a music recommendation expert. You generate song recommendations based on user queries, plus a name and description for the resulting playlist.

Guidelines for songs:
- For mood queries (sad, happy, chill, etc.), pick popular songs that evoke that mood
- For genre queries, pick iconic songs from that genre
- For artist queries, list their popular songs and similar artists
- For decade queries, pick hits from that era
- Mix well-known classics with some popular recent songs when appropriate
- Each song must be a real, existing song, with the artist and title spelled as they appear on streaming services

Guidelines for the playlist name and description:
- Name: short and catchy, max 100 characters
- Description: brief, max 200 characters`

  const userPrompt = `Generate exactly ${count} specific, well-known songs that match this request: "${prompt}"`

  const result = await generate(systemPrompt, userPrompt, playlistSchema, budgetFor(count))
  return { ...result, songs: result.songs.slice(0, count) }
}

export async function generateReplacementSong(
  prompt: string,
  currentSongs: Song[],
  rejectedSong: Song,
): Promise<Song> {
  const currentList = currentSongs.map((s) => `${s.artist} - ${s.title}`).join('\n')

  const systemPrompt = `You are a music recommendation expert. You suggest a single replacement song based on a user query and a list of songs to avoid.`

  const userPrompt = `The user wants songs matching: "${prompt}"

They rejected this song: "${rejectedSong.artist} - ${rejectedSong.title}"

Here are the songs already in the list (DO NOT suggest any of these):
${currentList}

Generate exactly 1 DIFFERENT song that:
- Matches the user's original query
- Is NOT similar to the rejected song
- Avoids the same artist as the rejected song
- Is NOT already in the list above`

  const result = await generate(systemPrompt, userPrompt, replacementSchema, 200)
  return result.song
}

// --- Server Functions ---

export const generatePlaylistSongs = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({ prompt: z.string(), count: z.number().min(1).max(100).optional() }))
  .handler(async ({ data }) => {
    const { prompt, count = 25 } = data
    if (!prompt.trim()) {
      throw new Error('Prompt is required')
    }
    const { songs, name, description } = await generatePlaylist(prompt, count)
    return { songs, suggestedName: name, suggestedDescription: description }
  })

const reloadSongValidator = z.object({
  prompt: z.string(),
  currentSongs: z.array(songSchema),
  rejectedSong: songSchema,
})

export const reloadSong = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(reloadSongValidator)
  .handler(async ({ data }) => {
    const song = await generateReplacementSong(data.prompt, data.currentSongs, data.rejectedSong)
    return { song }
  })
