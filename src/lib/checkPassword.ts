const statuses = [
    {
        regex: /[a-z]/,
        id: 0,
        value: "Weak"
    }, {
        regex: /(?=.*\d)(?=.*[A-Z])/,
        id: 0,
        value: "Medium"
    }, {
        regex: /.[!,@,#,$,%,^,&,*,?,_,\~,\-,\_,(,),\.,\,,;,',\/,\\,\[,\],\{,\},\=,\+,\,€]/,
        id: 0,
        value: "Strong"
    },
]

function checkStrenght(value: string) {
    let strength = statuses.filter(e => e.regex.test(value) && value.length > 7).length - 1
    if (value === "") return {
        id: 0,
        status: "Empty"
    }
    if (strength < 0) return {
        id: 0,
        status: "Weak"
    }
    return {
        id: strength,
        status: statuses[strength].value
    }
}

export default checkStrenght