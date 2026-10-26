<script lang="ts">
    import {
        connectToDiscernsChatbot,
        type RegisteredTool,
        type WebsiteProtocol
    } from '@discerns/sdk'
    import { DISCERNS_AVATAR_ID, DISCERNS_AVATAR_INSTANCE_ID } from '#lib/Config.ts'

    interface Props {
        tools?: RegisteredTool[]
        avatarContext?: string | null
        style?: string
        theme?: 'dark' | 'light'
        accent?: string
    }

    let { tools = [], avatarContext = null, style = '', theme = 'dark', accent }: Props = $props()

    const BASE_URL = 'https://app.discerns.ai'

    let iframeSrc = $derived.by(() => {
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Temporary params only build this derived URL.
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
    //the tools the protocol has been given, which the connect effect resets with it
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Reactive mutation would self-invalidate and repeat tool side effects.
    let registeredToolNames = new Set<string>()

    // Connect to the chatbot when the iframe is available
    $effect(() => {
        if (!iframe) return

        let disposed = false
        let disposeProtocol: (() => void) | undefined

        // Reset tracked state on recreation
        registeredToolNames = new Set()
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

        //an ask the chatbot does not answer rejects after the SDK's timeout, which leaves nothing to
        //do but say so: the SDK keeps a tool it was asked to register and registers it again when
        //the chatbot next says it is ready
        // Unregister removed tools
        for (const name of registeredToolNames) {
            if (!currentToolNames.has(name)) {
                protocol
                    .unregisterTool(name)
                    .catch((error) => console.error(`Could not unregister tool "${name}"`, error))
                registeredToolNames.delete(name)
            }
        }

        // Register new tools
        for (const t of tools) {
            if (!registeredToolNames.has(t.name)) {
                protocol
                    .registerTool(t)
                    .catch((error) => console.error(`Could not register tool "${t.name}"`, error))
                registeredToolNames.add(t.name)
            }
        }
    })

    // Sync avatar context
    $effect(() => {
        protocol?.setAvatarContext(avatarContext ?? null)
    })
</script>

<iframe
    bind:this={iframe}
    src={iframeSrc}
    allow="microphone; picture-in-picture;"
    {style}
    title="AI Chat"
></iframe>
