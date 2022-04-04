import { writable } from "svelte/store";
import { browser } from '$app/env'
const storage = browser ? localStorage.getItem('theme') : ""
const base = storage || 'light'
export const theme = writable(base)

theme.subscribe((value) => {
    if(browser) localStorage.setItem('theme',value)
})