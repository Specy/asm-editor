/**
 * The sections of the x86 Executables Chapter the Workbench points at
 * ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md), decisions
 * 6 and 9): the "?" of the Listing's and the Pseudocode's notices opens them in the Documentation
 * panel, and the Pseudocode's hovers on Ghidra's own words link to the second.
 */
export const LISTING_DOCUMENTATION = '/documentation/x86/executables#listing'
export const PSEUDOCODE_DOCUMENTATION = '/documentation/x86/executables#pseudocode'

/**
 * The x86 Syscalls Chapter's entry for a call the Core implements, which the Pseudocode's hover on
 * that system call (`sys_write`) links to; `x86.ts` gives each entry the anchor `syscall-` and the
 * call's name.
 */
export const syscallDocumentation = (name: string) => `/documentation/x86/syscall#syscall-${name}`
