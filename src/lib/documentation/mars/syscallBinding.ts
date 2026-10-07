/**
 * The shape of the MARS and RARS services as data: what the Documentation shows of each, and how
 * the Environment library, `<sim.h>`, calls it from C. This module and the two that hold the data
 * (`mipsSyscalls.ts`, `riscvSyscalls.ts`) import nothing at run time, neither a Core nor a `$lib`
 * path, so a build script reads them with plain Node.
 */

/** A C type of the Environment library, spelled as its prototypes spell it. */
export type SimType =
    | 'void'
    | 'int'
    | 'unsigned'
    | 'long long'
    | 'float'
    | 'double'
    | 'char *'
    | 'const char *'
    | 'void *'
    | 'const void *'
    | 'int *'

/**
 * One parameter of a `sim_` function. Registers are spelled as the Documentation spells them
 * (`$a0`, `$f12`, `a0`, `fa0`); a register variable's `__asm__` names a MIPS general register by
 * number (`$4`), the spelling the planning spike compiled under GCC and Clang.
 */
export type SimParameter = {
    name: string
    type: SimType
    /** The register the argument is passed in. */
    register: string
    /**
     * Set on a pointer the function writes through instead of passing: after the service it stores
     * what `register` holds there, as the input dialogs return their status.
     */
    out?: true
}

/**
 * What a `sim_` function returns: nothing, a register, or a 64-bit value the service splits into two
 * registers of 32 bits each. RISC-V-64 sign-extends every 32-bit result, so the low half of a split
 * value is read unsigned.
 */
export type SimReturn =
    | { type: 'void' }
    | { type: Exclude<SimType, 'void' | 'long long'>; register: string }
    | { type: 'long long'; low: string; high: string }

/**
 * How the Environment library's function for one service calls it: the name and the prototype are
 * the same on every Target that has the service, and only the registers differ.
 */
export type SimBinding = {
    name: string
    parameters: SimParameter[]
    returns: SimReturn
    /** The service ends the program, so the function never returns. */
    noreturn?: true
    /** Registers the service changes besides its results, which the function must clobber. */
    clobbers?: string[]
}

/**
 * A MARS or RARS service. MIPS and RISC-V share most of them under the same numbers, with their
 * own registers; RARS numbers the file services and exit2 as Linux does.
 */
export type MarsSyscall = {
    name: string
    code: number
    arguments: { name: string; description: string }[]
    result: { arguments?: { name: string; description: string }[]; other?: string }
    /**
     * False while the Core does not offer the service: the Documentation leaves it out and
     * `<sim.h>` declares no function for it, though its binding is ready.
     */
    implemented: boolean
    binding: SimBinding
}

/** The C prototype of a binding, as `int sim_input_dialog_int(const char *message, int *status)`. */
export function simPrototype(binding: SimBinding): string {
    const declare = (type: SimType, name: string) =>
        type.endsWith('*') ? `${type}${name}` : `${type} ${name}`
    const parameters = binding.parameters.map((parameter) =>
        declare(parameter.type, parameter.name)
    )
    return `${declare(binding.returns.type, binding.name)}(${parameters.join(', ') || 'void'})`
}
