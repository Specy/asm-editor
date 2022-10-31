import { browser } from "$app/environment";
import { writable } from "svelte/store";


export enum ShortcutAction {
    SaveCode,
    ToggleDocs,
    ToggleSettings,
    RunCode,
    BuildCode,
    ClearExecution,
    Step,
}
type Shortcut = {
    type: ShortcutAction
    description: string
    defaultValue: string
    id: number
}
function createShortcut(type: ShortcutAction, defaultValue: string, description:string, id: number): Shortcut {
    return { type, description , defaultValue, id};
}
type StoredSettings = {
    meta: {
        version: string
    }
    shortcuts: Array<[string, Shortcut]>
}
const shortcuts = new Map([
    ["Shift+KeyS", createShortcut(ShortcutAction.SaveCode, "Shift+KeyS", "Save code",1)],
    ["Shift+KeyD", createShortcut(ShortcutAction.ToggleDocs, "Shift+KeyD", "Toggle docs",2)],
    ["Shift+KeyP", createShortcut(ShortcutAction.ToggleSettings, "Shift+KeyP", "Toggle settings",3)],
    ["Shift+KeyR", createShortcut(ShortcutAction.RunCode, "Shift+KeyR", "Run code",4)],
    ["Shift+KeyB", createShortcut(ShortcutAction.BuildCode, "Shift+KeyB", "Build code",5)],
    ["Shift+KeyC", createShortcut(ShortcutAction.ClearExecution, "Shift+KeyC", "Clear execution",6)],
    ["Shift+ArrowDown", createShortcut(ShortcutAction.Step, "Shift+ArrowDown", "Step",7)],
]);
const CURRENT_VERSION = "1.0.0";


function createShortcutStore() {

    const { subscribe, set, update } = writable(shortcuts);

    function get(key: string, shift = true): Shortcut | undefined {
        return shortcuts.get(`${shift ? "Shift+" : ""}${key}`);
    }
    function updateKey(prev:string, next: string) {
        update((shortcuts) => {
            const shortcut = shortcuts.get(prev);
            if (shortcut && !shortcuts.has(next)) {
                shortcuts.set(next, shortcut);
                shortcuts.delete(prev);
            }
            return shortcuts;   
        });
        saveStorage()
    }
    function saveStorage(){
        const storedSettings: StoredSettings = {
            meta: {
                version: CURRENT_VERSION
            },
            shortcuts: Array.from(shortcuts.entries())
        }
        localStorage.setItem("shortcuts", JSON.stringify(storedSettings));
    }
    function loadFromStorage(){
        const storedShortcuts = localStorage.getItem("shortcuts");
        if (storedShortcuts) {
            const storedSettings: StoredSettings = JSON.parse(storedShortcuts);
            if (storedSettings.meta.version === CURRENT_VERSION) {
                set(new Map(storedSettings.shortcuts));
            }
        }
    }
    if(browser) loadFromStorage()
    return {
        subscribe,
        get,
        updateKey
    }
}



export const shortcutsStore = createShortcutStore();