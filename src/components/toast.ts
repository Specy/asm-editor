import { writable } from 'svelte/store'
enum Colors {
    Green = "rgb(85, 143, 144)",
    Red = "#B33A3A",
    Orange = "#FFA500",
    Hint = "var(--accent)"
}


function Toast() {
    const { set, update, subscribe } = writable({
        title: '',
        message: '',
        duration: 3000,
        visible: false,
        color: '',
        id: 0
    })
    let id = 0
    let timeout
    function execute(message: string, duration: number, color: Colors, title = '') {
        update(data => {
            id++
            return {
                ...data,
                title,
                color,
                message,
                duration,
                visible: true,
                id
            }
        })

        clearTimeout(timeout)
        timeout = setTimeout(close, duration)
    }
    function error(text: string, timeout = 3000) {
        execute(text, timeout, Colors.Red, "Error")
    }
    function success(text: string, timeout = 3000) {
        execute(text, timeout, Colors.Green, "Success")
    }
    function warn(text: string, timeout = 3000) {
        execute(text, timeout, Colors.Orange, "Warning")
    }
    function log(text: string, timeout = 5000) {
        execute(text, timeout, Colors.Hint, "Warning")
    }
    function close() {
        update(data => {
            return { ...data, visible: false, duration: 0}
        })
        clearTimeout(timeout)
    }
    function custom(title: string, text: string, timeout = 3000) {
        execute(text, timeout, Colors.Hint, title)
    }
    return {
        error, success, custom, closeToast: close, log, warn, subscribe
    }
}

export const toast = Toast()