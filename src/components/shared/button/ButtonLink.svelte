<script>
	/** @type {{ target?: string, href: any, color?: string, style?: string, bg?: string, onClick?: (e: MouseEvent) => void , hasIcon?: boolean, title?: string, cssVar?: string, disabled?: boolean, children?: import('svelte').Snippet}} */
	let {
		href,
		disabled = false,
		color = 'var(--accent-text)',
		target = '',
		style = '',
		bg = 'var(--accent)',
		hasIcon = false,
		title = '',
		cssVar = 'unset',
		onClick,
		children
	} = $props()
</script>

<a
	type="button"
	class="btn"
	class:disabled
	class:hasIcon
	{href}
	{title}
	{target}
	style={`--btn-color:var(--${cssVar},${bg}); --btn-text:var(--${cssVar}-text,${color});${style}; `}
	onclick={(e) => {
        if (disabled) return e.preventDefault()
        if (onClick) onClick(e)
    }}
>
	{@render children?.()}
</a>

<style lang="scss">
  .btn {
    padding: 0.6rem 1rem;
    border-radius: 0.4rem;
    color: var(--btn-text, --accent-text);
    background-color: var(--btn-color, --accent);
    text-align: center;
    display: flex;
    transition: all 0.3s;
    font-size: 1rem;
    align-items: center;
    justify-content: center;
    border: none;
    width: fit-content;
    user-select: none;
    position: relative;
    cursor: pointer;
  }

  .btn:hover {
    filter: brightness(1.2);
  }

  .disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .disabled:hover {
    filter: none !important;
  }

  .hasIcon {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.35rem 0.8rem;
  }
</style>
