import { writable } from "svelte/store"
import { axios } from "../lib/axios"
import { BASEURL } from "../lib/apiFetch"
function userStore(){
    const user = writable(null)

    async function fetchUser(){
        let res = null
        try{
            res = (await axios.get(BASEURL + "/auth/status"))
        }catch(e){
            console.error(e)
        }
        user.set(res)
    }
    fetchUser()
    return { user, fetchUser}
}
export const User = userStore()