import { browser } from "$app/env"
import { DEFAULT_BACKGROUND, DEFAULT_COLOR, DEFAULT_PALETTE } from "$lib/cgol"
import { getScreenRefreshRate } from "$lib/getRefreshRate"
import { get, Writable, writable } from "svelte/store"

export interface SettingsData{
    scale: number
    palette: string[]
}

class SettingsStore{
    isPlaying: Writable<boolean>
    scale: Writable<number>
    palette: Writable<string[]>
    backgroundColor: Writable<string>
    mainColor: Writable<string>
    maxFps: Writable<number>
    trailToggled: Writable<boolean>
    constructor(){
        this.isPlaying = writable(true)
        this.scale = writable(1)
        this.palette = writable(DEFAULT_PALETTE)
        this.backgroundColor = writable(DEFAULT_BACKGROUND)
        this.mainColor = writable(DEFAULT_COLOR)
        this.maxFps = writable(60)
        this.trailToggled = writable(true)
        if(browser) this.init()
        this.backgroundColor.subscribe(this.save)
        this.mainColor.subscribe(this.save)
        this.palette.subscribe(this.save)
        this.scale.subscribe(this.save)
    }
    init(){
        this.backgroundColor.set(localStorage.getItem('cgol-bg-color') || DEFAULT_BACKGROUND)
        this.mainColor.set(localStorage.getItem('cgol-main-color') || DEFAULT_COLOR)
        this.palette.set(JSON.parse(localStorage.getItem('cgol-palette')) || DEFAULT_PALETTE)
        this.scale.set(JSON.parse(localStorage.getItem('cgol-scale')) || 1)
        setTimeout(() => {
			getScreenRefreshRate((fps:number) => {
				const savedFps = browser ? JSON.parse(localStorage.getItem('cgol-max-fps')) || -1 : -1
				this.maxFps.set(savedFps > 0 ? savedFps : fps)
			}, false)
		}, 1000)
    }
    save = () => {
        if(!browser) return
        localStorage.setItem('cgol-bg-color', get(this.backgroundColor))
        localStorage.setItem('cgol-main-color', get(this.mainColor))
        localStorage.setItem('cgol-palette', JSON.stringify(get(this.palette)))
        localStorage.setItem('cgol-scale', JSON.stringify(get(this.scale)))
    }
    reset(){
        this.backgroundColor.set(DEFAULT_BACKGROUND)
        this.mainColor.set(DEFAULT_COLOR)
        this.palette.set(DEFAULT_PALETTE)
        this.scale.set(1)
        this.maxFps.set(60)
        this.isPlaying.set(true)
        this.save()
    }
}


export const Settings = new SettingsStore()
