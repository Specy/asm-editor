import Axios from 'axios'
import type { AxiosRequestConfig} from 'axios'
import type { AxiosError } from 'axios'
import createAuthRefreshInterceptor from 'axios-auth-refresh'
import storage from '../utils/storage'
const API_URL = 'http://localhost:5000/' //ENV???

//@ts-ignore
const authInterceptor = createAuthRefreshInterceptor.default || createAuthRefreshInterceptor

function authRequestInterceptor(config: AxiosRequestConfig) {
	if (config.url === 'auth/login') return config
	const token = storage.token
	if (token) {
		config.headers.authorization = `Bearer ${token}`
	}
	config.headers.Accept = 'application/json'
	return config
}

export const axios = Axios.create({
	baseURL: API_URL,
	withCredentials: true
})
axios.interceptors.request.use(authRequestInterceptor)

axios.interceptors.response.use(
	(res) => res.data,
	(err:AxiosError) => {
		storage.token = ""
		return Promise.reject(err)
	}
)
authInterceptor(axios, async (err) => {
	console.log("Fetch refresh")
	const response = await Axios.post(API_URL + 'auth/refresh', {}, { withCredentials: true })
	if (response.data)
		storage.token = response.data
	return Promise.resolve()
})
