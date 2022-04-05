
import Color from 'Color'
import cloneDeep from 'clone-deep'
import { get, Writable, writable } from 'svelte/store'
const themeObject = {
    primary: {
        color: '#1E2035',
        name: 'primary'
    },
    secondary: {
        color: '#28294c',
        name: 'secondary'
    },
    tertiary: {
        color: '#E0E0E0',
        name: 'tertiary'
    },
    mainText: {
        color: '#f1f1f1',
        name: 'main-text'
    },
    accent: {
        color: '#6E98F6',
        name: 'accent'
    },
    hint: {
        color: '#737373',
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
            //@ts-ignore
            listened[key] = writable({
                //@ts-ignore
                ...value, 
                //@ts-ignore
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
    getColor(key: ThemeKeys): Color{
        return new Color(get(this.get(key)).color)
    }
}

export const ThemeStore = new ThemeStoreClass()