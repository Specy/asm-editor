import { TinyColor } from '@ctrl/tinycolor';

import cloneDeep from 'clone-deep'
import { get, writable } from 'svelte/store'
import type { Writable } from "svelte/store"

const themeObject = {
    primary: {
        color: '#171A21',
        name: 'primary'
    },
    secondary: {
        color: '#212630',
        name: 'secondary'
    },
    secondaryDarker: {
        color: '#1D2026',
        name: 'secondary-darker'
    },
    tertiary:  {
        color: '#2d3950',
        name: 'tertiary'
    },
    mainText: {
        color: '#f1f1f1',
        name: 'main-text'
    },
    textDarker: {
        color: '#c1c1c1',
        name: 'text-darker'
    },
    accent: {
        color: '#F2A65A',
        name: 'accent'
    },
    accent2: {
        color: '#596c6a',
        name: 'accent2',
    },
    hint: {
        color: '#939393',
        name: 'hint'
    },
    red: {
        color: 'rgb(237, 79, 79)',
        name: 'red'
    },
    green: {
        color: 'rgb(16, 185, 129)',
        name: 'green'
    }
}
type ThemeKeys = keyof typeof themeObject
export type ThemeProp = {
    name: ThemeKeys
    color: string
}
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
    set(key: ThemeKeys, color: string): void{
        this.theme.update(theme => {
            theme[key].update(themeProp => {
                themeProp.color = color
                return themeProp   
            })
            return theme
        })
    }
    get(key: ThemeKeys): Writable<ThemeProp>{
        return get(this.theme)[key]
    }
    getColor(key: ThemeKeys): TinyColor{
        return new TinyColor(get(this.get(key)).color)
    }
}

export const ThemeStore = new ThemeStoreClass()