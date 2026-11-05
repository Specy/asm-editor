import { absoluteUrl, LLMS_PATHNAME } from './urls'

/**
 * The message a reader sends to an AI assistant so it finds the site's **Markdown twins** through
 * `/llms.txt` ([ADR 0077](../../../../../docs/adr/0077-agents-read-markdown-twins-derived-from-the-pages-sources.md)),
 * copied from the "Documentation for agents" section of `/documentation`.
 */
export const AGENT_MESSAGE = `Look at ${absoluteUrl(LLMS_PATHNAME)} for information on how to use ASM Editor's documentation for M68K, MIPS, RISC-V, X86 and Z80 Assembly languages.`
