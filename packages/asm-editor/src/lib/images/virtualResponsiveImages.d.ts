declare module 'virtual:responsive-images' {
    /**
     * Each static picture that has smaller copies, by its address: its own width and height, and
     * the widths of its copies ([responsive-images-plugin.ts](../../../scripts/responsive-images-plugin.ts)).
     */
    const images: Readonly<Record<string, readonly [number, number, readonly number[]]>>
    export default images
}
