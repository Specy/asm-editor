import { Renderer, marked } from 'marked'
type MarkdownRendererProps = {
    linksInNewTab?: boolean
}

export function createMarkdownRenderer(props: MarkdownRendererProps){
    const renderer = new Renderer()
    if(props.linksInNewTab){
        renderer.link = (href, title, text) => {
            return `<a href="${href}" title="${title ?? text}" target="_blank">${text}</a>`
        }
    }
    return renderer
}

export function createMarkdownWithRenderer(text: string, renderer: Renderer){
    return marked(text, {renderer})
}

export function createMarkdownWithOptions(text: string, options: MarkdownRendererProps){
    return marked(text, { renderer: createMarkdownRenderer(options)})
}