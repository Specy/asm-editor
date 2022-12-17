import { browser } from '$app/environment';
import { createDebouncer } from '$lib/utils';
import { TinyColor } from '@ctrl/tinycolor';

import cloneDeep from 'clone-deep'
import { get, writable } from 'svelte/store'
import type { Writable } from "svelte/store"

//TODO redo this with a single writable object, it doesnt need to be this complicated
const themeObject = {
    background: {
        color: "#171A21",
        name: 'background',
        prop: 'background'
    },
    primary: {
        color: '#171A21',
        name: 'primary',
        prop: 'primary'
    },
    secondary: {
        color: '#212630',
        name: 'secondary',
        prop: 'secondary'
    },
    secondaryDarker: {
        color: '#1D2026',
        name: 'secondary-darker',
        prop: 'secondaryDarker'
    },
    tertiary:  {
        color: '#2d3950',
        name: 'tertiary',
        prop: 'tertiary'
    },
    mainText: {
        color: '#f1f1f1',
        name: 'main-text',
        prop: 'mainText'
    },
    textDarker: {
        color: '#c1c1c1',
        name: 'text-darker',
        prop: 'textDarker'
    },
    accent: {
        color: '#F2A65A',
        name: 'accent',
        prop: 'accent'
    },
    accent2: {
        color: '#38454f',
        name: 'accent2',
        prop: 'accent2'
    },  
    hint: {
        color: '#939393',
        name: 'hint',
        prop: 'hint'
    },
    red: {
        color: '#ed4f4f',
        name: 'red',
        prop: 'red'
    },
    green: {
        color: '#356a59',
        name: 'green',
        prop: 'green'
    }
}
type ThemeKeys = keyof typeof themeObject
export type ThemeProp = {
    name: string
    color: string
    prop: ThemeKeys
}
const version = 1
type StoredTheme = {
    version: number
    theme: ThemeProp[]
}
const debouncer = createDebouncer(1000)
export class ThemeStoreClass{
    theme: Writable<{
        [key in ThemeKeys]: Writable<ThemeProp>
    }>
    constructor(){
        const base = cloneDeep(themeObject)
        const listened = {} as { [key in ThemeKeys]: Writable<ThemeProp> }
        Object.entries(base).forEach(([key, value]) => {
            //@ts-ignore doesnt like that i set the key
            listened[key] = writable({
                //@ts-ignore value is an object
                ...value, 
                //@ts-ignore value is unknown
                color: value.color
            })
        })
        this.theme = writable(listened)
    }
    toArray(): ThemeProp[] {
        return Object.values(get(this.theme)).map(el => get(el))
    }
    isDefault(key: ThemeKeys, color): boolean{
        return themeObject[key]?.color === color
    }
    reset(key: ThemeKeys){
        this.set(key, themeObject[key]?.color)
        
    }
    set(key: ThemeKeys, color: string): void{
        this.theme.update(theme => {
            theme[key].update(themeProp => {
                themeProp.color = color
                return themeProp   
            })
            return theme
        })
        this.save()
    }
    get(key: ThemeKeys): Writable<ThemeProp>{
        return get(this.theme)[key]
    }
    getColor(key: ThemeKeys): TinyColor{
        return new TinyColor(get(this.get(key)).color)
    }
    save(){
        const inner = () => {
            console.log("saved")
            const theme = this.toArray()
            const state: StoredTheme = {
                version: 1,
                theme
            }
            localStorage.setItem('theme', JSON.stringify(state))
        }
        debouncer(inner)
    }
    load(){
        try{
            const theme = JSON.parse(localStorage.getItem('theme')) as StoredTheme | null
            if(theme && theme.version === version){
                theme.theme.forEach((themeProp: ThemeProp) => {
                    this.set(themeProp.prop, themeProp.color)
                })
            }
        }catch(e){
            console.error(e)
        }

    }
}

export const ThemeStore = new ThemeStoreClass()
if(browser) ThemeStore.load()