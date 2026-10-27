/** Crawlers, link previews and lab tools: not visitors, and their clicks are not counted. */
const BOT =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp\/|headlesschrome|lighthouse|pingdom|uptime|monitor/i;

export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT.test(userAgent);
}
