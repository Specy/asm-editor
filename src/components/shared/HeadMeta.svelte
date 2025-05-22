<script lang="ts">
    interface Props {
        title: any
        description: any
    }

    let { title, description }: Props = $props()
</script>

<title>
    {title}
</title>
<meta name="description" content={description} />
<meta property="og:description" content={description} />
<meta property="og:title" content={title} />
