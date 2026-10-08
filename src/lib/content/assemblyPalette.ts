/** The editor's token colours, shared by prerendered lectures and instruction examples. */
export function assemblyPalette(isDark: boolean) {
    return isDark
        ? {
              comment: '#1f619a',
              mnemonic: '#ff9d00',
              directive: '#eb939a',
              number: '#80ffbb',
              string: '#3ad900',
              register: '#8673ff'
          }
        : {
              comment: '#506696',
              mnemonic: '#473fd8',
              directive: '#9f3b3b',
              number: '#006d4c',
              string: '#0a7b3e',
              register: '#037280'
          }
}
