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

const shortcuts = new Map([
    ["Shift+KeyS", ShortcutAction.SaveCode],
    ["Shift+KeyD", ShortcutAction.ToggleDocs],
    ["Shift+KeyP", ShortcutAction.ToggleSettings],
    ["Shift+KeyR", ShortcutAction.RunCode],
    ["Shift+KeyB", ShortcutAction.BuildCode],
    ["Shift+KeyC", ShortcutAction.ClearExecution],
    ["Shift+ArrowDown", ShortcutAction.Step]
]);



function createShortcutStore() {

    const { subscribe, set, update } = writable(shortcuts);

    function get(key: string, shift = true): ShortcutAction | undefined {
        return shortcuts.get(`${shift ? "Shift+" : ""}${key}`);
    }

    return {
        subscribe,
        get
    }
}



export const shortcutsStore = createShortcutStore();