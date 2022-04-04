import { axios } from './axios'
import { writable } from 'svelte/store'
import type { AxiosError } from 'axios'
import type { Writable } from 'svelte/store'

const BASEURL = "http://localhost:5000"
interface BaseConfig {
    onSuccess?: (res: any) => void,
    onError?: (err: AxiosError) => void,
}
interface MutationConfig extends BaseConfig {
    method?: "POST" | "PATCH" | "DELETE"
    body?: object
}
interface QueryConfig extends BaseConfig {
    params?: ""
}
interface MutateParams {
    params?: string
}
const DefaultQueryConfig: QueryConfig = {
    params: ""
}
const DefaultMutationConfig: MutationConfig = {
    method: "POST"
}
const DefaultMutateParams: MutateParams = {
    params: ""
}
function useMutation(url: string, config = DefaultMutationConfig):
    [(body?: object, config?: MutateParams) => void, Writable<boolean>, Writable<any>, Writable<any>] {
    const isLoading = writable(false)
    const data = writable(null)
    const error = writable(null)

    const mutate = (body?: object, mutateConfig = DefaultMutateParams) => {
        isLoading.set(true)

        axios({
            url: BASEURL + url + mutateConfig.params,
            data: body,
            ...config
        }).then((res: any) => { data.set(res); config.onSuccess && config.onSuccess(res) })
            .catch((err: AxiosError) => { error.set(err); config.onError && config.onError(err) })
            .finally(() => isLoading.set(false))
    }
    return [mutate, isLoading, data, error]
}


function useQuery(url: string, config = DefaultQueryConfig):
    [(body?: object, config?: QueryConfig) => void, Writable<boolean>, Writable<any>, Writable<any>] {
    const isLoading = writable(true)
    const data = writable(null)
    const error = writable(null)

    const query = (queryConfig = DefaultQueryConfig) => {
        axios.get(BASEURL + url + queryConfig.params)
            .then((res: any) => { data.set(res); config.onSuccess && config.onSuccess(res) })
            .catch((err: AxiosError) => { error.set(err); config.onError && config.onError(err) })
            .finally(() => isLoading.set(false))
    }

    return [query, isLoading, data, error]
}

export {
    useQuery,
    useMutation,
    BASEURL
}