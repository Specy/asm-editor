export const prerender = false
export const ssr = false

let didInit = false
/** @type {import('./$types').LayoutLoad} */
export async function load() {
    if(didInit) return 
    //await init()
    didInit = true
}