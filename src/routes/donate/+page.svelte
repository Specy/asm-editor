<script lang="ts">
    import Button from '$cmp/shared/button/Button.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
    import FaPaypal from 'svelte-icons/fa/FaPaypal.svelte'
    import Kofi from '$cmp/shared/misc/KoFi.svelte'
    import Title from '$cmp/shared/layout/Header.svelte'
    import { afterNavigate } from '$app/navigation'
    import Page from '$cmp/shared/layout/Page.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import Card from '$cmp/shared/layout/Card.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
    //@ts-expect-error idk why this is not working
    import { PAST_DONATIONS } from '$src/routes/donate/pastDonations'

    let previousPage: string = $state('/projects')
    afterNavigate(({ from }) => {
        previousPage = from?.url.pathname ?? previousPage
    })
</script>

<svelte:head>
    <title>Donate</title>
    <meta name="description" content="Donate and support me" />
    <meta property="og:description" content="Donate and support me" />
    <meta property="og:title" content="Donate" />
</svelte:head>

<Page
    cropped
    contentStyle="max-width: 40rem; font-size: 1.1rem; line-height: 1.5rem; padding: 1rem;"
>
    <div class="top-row">
        <Row align="center">
            <a href={previousPage} class="go-back" title="Go to previous page">
                <Button
                    hasIcon
                    cssVar="primary"
                    style="padding: 0.4rem"
                    title="Go to previous page"
                >
                    <Icon size={2}>
                        <FaAngleLeft />
                    </Icon>
                </Button>
            </a>
            <Title style="margin: 0">Donate</Title>
        </Row>
    </div>
    <div>
        Thanks for using my webapp! If you want to help me continue developing new apps and
        features, you can donate to me using kofi or paypal.
        <br />
        <a href="https://specy.app" style="text-decoration: underline; color: var(--accent)">
            Or visit my website for more apps
        </a>
    </div>
    <div class="links">
        <a class="link" title="Kofi" href="https://ko-fi.com/specy ">
            <Icon size={3}>
                <Kofi />
            </Icon>
        </a>
        <a class="link" title="Paypal" href="https://www.paypal.com/paypalme/specydev">
            <Icon size={3}>
                <FaPaypal />
            </Icon>
        </a>
    </div>
    <h1 style="margin-top: 2rem">Past donations</h1>
    <Column gap="0.5rem" style="margin-top: 2rem">
        {#each PAST_DONATIONS as donation}
            <Card background="secondary" padding="1rem" gap="1rem">
                <Row justify="between">
                    <h3>
                        {donation.from}
                        <span
                            style="font-size: 1rem; opacity: 0.8; font-weight: normal; margin-left: 1rem"
                        >
                            {Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
                                new Date(donation.date)
                            )}
                        </span>
                    </h3>
                    <h3>
                        {donation.amount}€
                    </h3>
                </Row>
                <p>
                    {donation.message}
                </p>
            </Card>
        {/each}
    </Column>
</Page>

<style lang="scss">
    .top-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 4rem;
        margin-bottom: 2rem;
    }

    .links {
        display: flex;
        flex-direction: row;
        gap: 2rem;
        margin-top: 1rem;
    }
    .link {
        border: none;
        color: var(--accent);
        background-color: var(--secondary);
        border-radius: 0.4rem;
        padding: 0.6rem 1rem;
    }
    @media screen and (min-width: 650px) {
        .go-back {
            position: absolute;
            top: 1rem;
            left: 1rem;
        }
    }
    @media screen and (max-width: 650px) {
        .top-row {
            margin-top: 1rem;
        }
    }
</style>
