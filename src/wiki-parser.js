// Parses LLM output that contains multiple files separated by --- FILE: name ---
export function parseWikiFiles(llmOutput) {
    const files = {}
    const regex = /---\s*FILE:\s*(.+?)\s*---\n([\s\S]*?)(?=---\s*FILE:|\s*$)/g
    let match

    while ((match = regex.exec(llmOutput)) !== null) {
        const filename = match[1].trim()
        const content = match[2].trim()
        files[filename] = content
    }

    return files
}
