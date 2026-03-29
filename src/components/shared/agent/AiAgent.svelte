<script lang="ts">
    import { connectToDiscernsChatbot, type RegisteredTool, type EnvironmentContext, type WebsiteProtocol } from '@discerns/sdk'
    import { DISCERNS_AVATAR_ID, DISCERNS_AVATAR_INSTANCE_ID } from '$lib/Config'

    interface Props {
        tools?: RegisteredTool[]
        environmentContext?: Record<string, EnvironmentContext>
        avatarContext?: string | null
        style?: string
        theme?: 'dark' | 'light'
        accent?: string
        onConnectionStatusChange?: (connected: boolean) => void
        onNewConversation?: (conversationId: string) => void
    }

    let {
        tools = [],
        environmentContext = {},
        avatarContext = null,
        style = '',
        theme = 'dark',
        accent,
        onConnectionStatusChange,
        onNewConversation,
    }: Props = $props()

    const BASE_URL = 'https://app.discerns.ai'

    let iframeSrc = $derived.by(() => {
        const params = new URLSearchParams()
        if (DISCERNS_AVATAR_INSTANCE_ID) {
            params.set('avatarInstanceId', String(DISCERNS_AVATAR_INSTANCE_ID))
        }
        params.set('theme', theme)
        if (accent) {
            params.set('accent', accent)
        }
        return `${BASE_URL}/avatars/${DISCERNS_AVATAR_ID}/chat/embed?${params.toString()}`
    })

    let iframe: HTMLIFrameElement | undefined = $state()
    let protocol: WebsiteProtocol | undefined = $state()
    let registeredToolNames: Set<string> = $state(new Set())
    let registeredContextKeys: Set<string> = $state(new Set())

    // Connect to the chatbot when the iframe is available
    $effect(() => {
        if (!iframe) return

        let disposed = false
        let disposeProtocol: (() => void) | undefined

        // Reset tracked state on recreation
        registeredToolNames = new Set()
        registeredContextKeys = new Set()
        protocol = undefined

        connectToDiscernsChatbot(iframe).then((result) => {
            if (disposed) {
                result.dispose()
                return
            }
            protocol = result
            disposeProtocol = result.dispose
        })

        return () => {
            disposed = true
            disposeProtocol?.()
            protocol = undefined
        }
    })

    // Sync tools reactively
    $effect(() => {
        if (!protocol) return

        const currentToolNames = new Set(tools.map((t) => t.name))

        // Unregister removed tools
        for (const name of registeredToolNames) {
            if (!currentToolNames.has(name)) {
                protocol.unregisterTool(name)
                registeredToolNames.delete(name)
            }
        }

        // Register new tools
        for (const t of tools) {
            if (!registeredToolNames.has(t.name)) {
                protocol.registerTool(t)
                registeredToolNames.add(t.name)
            }
        }
    })

    // Sync environment context reactively
    $effect(() => {
        if (!protocol) return

        const currentKeys = new Set(Object.keys(environmentContext))

        // Remove stale context
        for (const key of registeredContextKeys) {
            if (!currentKeys.has(key)) {
                protocol.removeFromContext(key)
                registeredContextKeys.delete(key)
            }
        }

        // Add/update context
        for (const [key, ctx] of Object.entries(environmentContext)) {
            protocol.addToContext(key, ctx)
            registeredContextKeys.add(key)
        }
    })

    // Sync avatar context
    $effect(() => {
        protocol?.setAvatarContext(avatarContext ?? null)
    })

    // Sync connection status callback
    $effect(() => {
        if (!onConnectionStatusChange) return
        return protocol?.onConnectionStatus(onConnectionStatusChange)
    })

    // Sync new conversation callback
    $effect(() => {
        if (!onNewConversation) return
        return protocol?.onNewConversation(onNewConversation)
    })
</script>

<iframe
    bind:this={iframe}
    src={iframeSrc}
    allow="microphone; picture-in-picture;"
    {style}
    title="AI Chat"
></iframe>

<style lang="scss">
</style>