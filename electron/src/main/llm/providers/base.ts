import { FrameAnalysis, ChatMessage } from '../types'

export interface LLMProvider {
  name: string
  supportsVision: boolean
  supportsEmbeddings: boolean

  analyzeImage(imageBuffer: Buffer, prompt: string): Promise<FrameAnalysis>
  generateEmbedding(text: string): Promise<number[]>
  chat(messages: ChatMessage[]): Promise<string>
}

export function buildAnalysisPrompt(userPrompt: string): string {
  return `Analyze this screenshot and extract data in a semantically meaningful way.

${userPrompt}

IMPORTANT: Extract structured data where possible:
- For messaging apps (iMessage, Slack, Discord, Teams, etc.): Extract messages with sender name, timestamp, and message content
- For email clients: Extract sender, subject, date, and preview text
- For social media: Extract posts with author, content, and engagement metrics
- For documents/editors: Extract document title and key content
- For terminals/code: Extract commands, output, or code snippets
- For calendars: Extract event names, times, and participants
- For browsers: Extract page title, URL if visible, and main content

Structure the visibleText array to preserve semantic relationships (e.g., "John Doe (2:30 PM): Hello there" for messages).

Respond with a JSON object matching this schema:
{
    "summary": "Brief description of what's shown",
    "activeApplication": "Name of the main application visible",
    "userActivity": "What the user appears to be doing",
    "visibleText": ["Array of significant text, structured semantically where applicable"],
    "uiElements": ["Array of notable UI elements"],
    "metadata": {"key": "value pairs for additional context like conversation_participants, email_thread_subject, etc."}
}`
}

export function parseFrameAnalysis(text: string): FrameAnalysis {
  try {
    const parsed = JSON.parse(text)
    return {
      summary: parsed.summary || text,
      activeApplication: parsed.activeApplication || null,
      userActivity: parsed.userActivity || null,
      visibleText: Array.isArray(parsed.visibleText) ? parsed.visibleText : [],
      uiElements: Array.isArray(parsed.uiElements) ? parsed.uiElements : [],
      metadata: typeof parsed.metadata === 'object' ? parsed.metadata : {}
    }
  } catch {
    // If JSON parsing fails, create a basic analysis from the text
    return {
      summary: text,
      activeApplication: null,
      userActivity: null,
      visibleText: [],
      uiElements: [],
      metadata: {}
    }
  }
}
