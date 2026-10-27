/** One server-sent event (`event:` name and the joined `data:` lines). */
export type SseEvent = { event: string; data: string };

/**
 * Parses a `text/event-stream` body (as the Messages API streams it). Works on the Workers
 * runtime and in Node: only ReadableStream and TextDecoder.
 */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "message";
  let data: string[] = [];

  const flush = (): SseEvent | null => {
    if (data.length === 0) {
      event = "message";
      return null;
    }
    const out = { event, data: data.join("\n") };
    event = "message";
    data = [];
    return out;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.search(/\r?\n/)) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(buffer[newline] === "\r" ? newline + 2 : newline + 1);
        if (line === "") {
          const out = flush();
          if (out) yield out;
        } else if (line.startsWith(":")) {
          // comment / keep-alive
        } else {
          const colon = line.indexOf(":");
          const field = colon < 0 ? line : line.slice(0, colon);
          let value = colon < 0 ? "" : line.slice(colon + 1);
          if (value.startsWith(" ")) value = value.slice(1);
          if (field === "event") event = value;
          else if (field === "data") data.push(value);
        }
      }
      if (done) {
        if (buffer) data.push(...(buffer.startsWith("data:") ? [buffer.slice(5).trim()] : []));
        const out = flush();
        if (out) yield out;
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
