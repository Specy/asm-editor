export default function downloader(blob:Blob,fileName:string){
    const a = document.createElement('a')
    a.style.display = 'none'
    document.body.appendChild(a)
    a.href = window.URL.createObjectURL(blob)
    a.download = fileName
    a.click()
    a.remove()
}