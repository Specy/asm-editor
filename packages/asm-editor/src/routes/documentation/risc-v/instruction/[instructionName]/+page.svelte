<script lang="ts">
    import type { PageData } from './$types'
    import InstructionPage from '#cmp/documentation/instruction/InstructionPage.svelte'

    let { data }: { data: PageData } = $props()
</script>

<InstructionPage language="RISC-V" {data} />
