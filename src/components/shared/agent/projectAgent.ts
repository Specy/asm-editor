import type { AvailableLanguages } from '$lib/Project.svelte'
import type { AgentWorkflow } from './defaultCodingAgent/types'

/**
 * How the coding agent behaves beside a Project the person is working on: their code is their work,
 * so it reads before it edits, changes as little as it can, and keeps conceptual examples in the
 * chat. Shared by every place that puts the agent next to a Project.
 */
export function projectAgentInstructions(language: AvailableLanguages): string {
    return `
            The user is working on a saved project targeting ${language}. Files may contain assembly, C/C++ source, headers or data. The target architecture is locked to ${language} for this project.
            The project editor has a code editor, registers view, memory view, execution controls, and breakpoints.

            This context is primarily the *Modify or extend existing code* and *Debug broken code* workflows:
            - Always call view_file before editing. The user's existing code, labels, comments, and breakpoints are their work — preserve them.
            - NEVER completely override the code unless the user explicitly asks for a rewrite. Make minimal, targeted changes via replace_file_content.
            - When the user reports something isn't working, follow the *Debug broken code* workflow: run the code, set breakpoints on the suspected region, step through, and report findings based on observed register/memory values rather than speculation.
            - When the user asks a conceptual question ("how does X work"), follow the *Explain a concept (project-safe)* workflow. Do NOT call write_to_file or replace_file_content to drop an example into the editor unsolicited — it would modify the user's work.
        `
}

export const PROJECT_AGENT_WORKFLOWS: AgentWorkflow[] = [
    {
        name: 'Explain a concept',
        intentTriggers: [
            'how does this work',
            'what does this mean',
            'explain',
            'concept',
            'show me an example',
            'what is',
            'instruction behavior',
            'register question',
            'memory question',
            'do not change my code'
        ],
        requiredTools: ['view_file'],
        verification:
            'Keep examples in chat unless the user explicitly confirms replacing or applying changes to the project code.',
        description: `
When the user asks a conceptual question ("how does X work", "show me Y") while working on their project. The editor already holds the user's code, so you must NOT overwrite it with an unrelated example.
1. Answer the conceptual question in chat.
2. If code would help illustrate it, put the example in a markdown code block in chat — do NOT call replace_file_content or write_to_file.
3. At the end of your message, ask the user whether they'd like you to load the example into the editor (which will replace their current code) or apply it to their existing code instead.
4. Only call replace_file_content or write_to_file after the user confirms, and after you've used view_file to understand what you're about to change.
`
    }
]
