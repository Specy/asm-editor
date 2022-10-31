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
function createShortcut(type: ShortcutAction, defaultValue: string, description: string, id: number): Shortcut {
    return { type, description, defaultValue, id };
}
type StoredSettings = {
    meta: {
        version: string
    }
    shortcuts: Array<[string, Shortcut]>
}
const shortcuts = new Map([
    ["ShiftLeft+KeyS", createShortcut(ShortcutAction.SaveCode, "ShiftLeft+KeyS", "Save code", 1)],
    ["ShiftLeft+KeyD", createShortcut(ShortcutAction.ToggleDocs, "ShiftLeft+KeyD", "Toggle docs", 2)],
    ["ShiftLeft+KeyP", createShortcut(ShortcutAction.ToggleSettings, "ShiftLeft+KeyP", "Toggle settings", 3)],
    ["ShiftLeft+KeyR", createShortcut(ShortcutAction.RunCode, "ShiftLeft+KeyR", "Run code", 4)],
    ["ShiftLeft+KeyB", createShortcut(ShortcutAction.BuildCode, "ShiftLeft+KeyB", "Build code", 5)],
    ["ShiftLeft+KeyC", createShortcut(ShortcutAction.ClearExecution, "ShiftLeft+KeyC", "Clear execution", 6)],
    ["ShiftLeft+ArrowDown", createShortcut(ShortcutAction.Step, "ShiftLeft+ArrowDown", "Step", 7)],
]);
const CURRENT_VERSION = "1.0.0";


function createShortcutStore() {

    const { subscribe, update } = writable(shortcuts);

    function get(key: string): Shortcut | undefined {
        return shortcuts.get(key);
    }
    function updateKey(prev: string, next: string) {
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
    function saveStorage() {
        const storedSettings: StoredSettings = {
            meta: {
                version: CURRENT_VERSION
            },
            shortcuts: Array.from(shortcuts.entries())
        }
        localStorage.setItem("shortcuts", JSON.stringify(storedSettings));
    }
    function loadFromStorage() {
        const storedShortcuts = localStorage.getItem("shortcuts");
        if (storedShortcuts) {
            const storedSettings: StoredSettings = JSON.parse(storedShortcuts);
            if (storedSettings.meta.version === CURRENT_VERSION) {
                shortcuts.clear()
                storedSettings.shortcuts.forEach(([key, shortcut]) => {
                    shortcuts.set(key, shortcut);
                });
            }
        }
    }
    if (browser) loadFromStorage()
    return {
        subscribe,
        get,
        updateKey
    }
}



export const shortcutsStore = createShortcutStore();