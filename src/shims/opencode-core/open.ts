export function openUrl(input: string): Promise<void> {
  const url = URL.canParse(input) ? new URL(input) : undefined
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return Promise.reject(new Error(`Only http and https links can be opened in the browser: ${input}`))
  }
  return Promise.resolve()
}
