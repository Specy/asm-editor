import { writable } from 'svelte/store'
enum Colors {
    Green = "rgb(85, 143, 144)",
    Red = "#B33A3A",
    Orange = "#FFA500",
    Hint = "#b00752"
}
function Toast() {
    const title = writable("")
    const message = writable("")
    const duration = writable(3000)
    const visible = writable(false)
    const color = writable("")
    let timeout = setTimeout(() => { }, 10)
    function execute(text: string, time: number, colorName: Colors) {
        color.set(colorName)
        message.set(text)
        duration.set(time)
        clearTimeout(timeout)
        visible.set(true)
        timeout = setTimeout(() => {
            visible.set(false)
            duration.set(0)
        }, time)
    }
    function error(text: string, timeout = 3000) {
        title.set("Error")
        execute(text, timeout, Colors.Red)
    }
    function success(text: string, timeout = 3000) {
        title.set("Success")
        execute(text, timeout, Colors.Green)
    }
    function warn(text: string, timeout = 3000) {
        title.set("Warning")
        execute(text, timeout, Colors.Orange)
    }
    function log(text: string, timeout = 5000) {
        title.set("Warning")
        execute(text, timeout, Colors.Hint)
    }
    function closeToast() {
        duration.set(0)
        clearTimeout(timeout)
        visible.set(false)
    }
    function custom(textTitle: string, text: string, timeout = 3000) {
        title.set(textTitle)
        execute(text, timeout, Colors.Hint)
    }
    return {
        title, message, duration, error, success, custom, visible, closeToast, log, warn, color
    }
}

export const toast = Toast()