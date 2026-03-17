export const CHUNK_SIZE = 800;
export const CHUNK_OVERLAP = 100;

export function chunkText(
  text: string,
  chunkSize = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP,
): { content: string; char_start: number; char_end: number }[] {
  const chunks: { content: string; char_start: number; char_end: number }[] =
    [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;
    let chunk = text.slice(start, end);

    // Try to break at sentence/word boundary
    if (end < text.length) {
      const separators = [". ", ".\n", "\n\n", "\n", " "];
      for (const sep of separators) {
        const lastBreak = chunk.lastIndexOf(sep);
        if (lastBreak > chunkSize * 0.5) {
          end = start + lastBreak + sep.length;
          chunk = text.slice(start, end);
          break;
        }
      }
    }

    const trimmed = chunk.trim();
    if (trimmed.length > 20) {
      chunks.push({ content: trimmed, char_start: start, char_end: end });
    }

    start = end - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}

export async function generateEmbeddings(
  texts: string[],
  openaiKey: string,
): Promise<number[][]> {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts.map((t) => t.slice(0, 32000)),
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI API error: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  return data.data.map((item: { embedding: number[] }) => item.embedding);
}
