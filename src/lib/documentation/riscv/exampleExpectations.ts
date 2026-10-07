import type { InstructionExampleExpectation } from '$lib/documentation/instructions/expectations'

/** Expected observable results for the authored RISC-V instruction programs. */
export const riscvExampleExpectations: Record<string, InstructionExampleExpectation> = {
    add: {
        registers: {
            t2: '18'
        }
    },
    'add.uw': {
        registers: {
            t2: '2147483650'
        }
    },
    addi: {
        registers: {
            t2: '18'
        }
    },
    addiw: {
        registers: {
            t2: '18446744071562067968'
        }
    },
    addw: {
        registers: {
            t2: '18446744071562067968'
        }
    },
    'amoadd.d': {
        registers: {
            t2: '305419896'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [125, 86, 52, 18, 0, 0, 0, 0]
            }
        ]
    },
    'amoadd.w': {
        registers: {
            t2: '305419896'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [125, 86, 52, 18]
            }
        ]
    },
    'amoand.d': {
        registers: {
            t2: '305419896'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [0, 0, 0, 0, 0, 0, 0, 0]
            }
        ]
    },
    'amoand.w': {
        registers: {
            t2: '305419896'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [0, 0, 0, 0]
            }
        ]
    },
    'amomax.d': {
        registers: {
            t2: '305419896'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [120, 86, 52, 18, 0, 0, 0, 0]
            }
        ]
    },
    'amomax.w': {
        registers: {
            t2: '305419896'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [120, 86, 52, 18]
            }
        ]
    },
    'amomaxu.d': {
        registers: {
            t2: '305419896'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [120, 86, 52, 18, 0, 0, 0, 0]
            }
        ]
    },
    'amomaxu.w': {
        registers: {
            t2: '305419896'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [120, 86, 52, 18]
            }
        ]
    },
    'amomin.d': {
        registers: {
            t2: '305419896'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [5, 0, 0, 0, 0, 0, 0, 0]
            }
        ]
    },
    'amomin.w': {
        registers: {
            t2: '305419896'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [5, 0, 0, 0]
            }
        ]
    },
    'amominu.d': {
        registers: {
            t2: '305419896'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [5, 0, 0, 0, 0, 0, 0, 0]
            }
        ]
    },
    'amominu.w': {
        registers: {
            t2: '305419896'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [5, 0, 0, 0]
            }
        ]
    },
    'amoor.d': {
        registers: {
            t2: '305419896'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [125, 86, 52, 18, 0, 0, 0, 0]
            }
        ]
    },
    'amoor.w': {
        registers: {
            t2: '305419896'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [125, 86, 52, 18]
            }
        ]
    },
    'amoswap.d': {
        registers: {
            t2: '305419896'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [5, 0, 0, 0, 0, 0, 0, 0]
            }
        ]
    },
    'amoswap.w': {
        registers: {
            t2: '305419896'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [5, 0, 0, 0]
            }
        ]
    },
    'amoxor.d': {
        registers: {
            t2: '305419896'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [125, 86, 52, 18, 0, 0, 0, 0]
            }
        ]
    },
    'amoxor.w': {
        registers: {
            t2: '305419896'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [125, 86, 52, 18]
            }
        ]
    },
    and: {
        registers: {
            t2: '5'
        }
    },
    andi: {
        registers: {
            t2: '5'
        }
    },
    andn: {
        registers: {
            t2: '8'
        }
    },
    auipc: {
        registers: {
            t0: '0x00401000'
        }
    },
    b: {
        registers: {
            t2: '1'
        }
    },
    bclr: {
        registers: {
            t2: '9'
        }
    },
    bclri: {
        registers: {
            t2: '9'
        }
    },
    beq: {
        registers: {
            t2: '11'
        }
    },
    beqz: {
        registers: {
            t2: '11'
        }
    },
    bext: {
        registers: {
            t2: '1'
        }
    },
    bexti: {
        registers: {
            t2: '1'
        }
    },
    bge: {
        registers: {
            t2: '11'
        }
    },
    bgeu: {
        registers: {
            t2: '11'
        }
    },
    bgez: {
        registers: {
            t2: '11'
        }
    },
    bgt: {
        registers: {
            t2: '11'
        }
    },
    bgtu: {
        registers: {
            t2: '11'
        }
    },
    bgtz: {
        registers: {
            t2: '11'
        }
    },
    binv: {
        registers: {
            t2: '9'
        }
    },
    binvi: {
        registers: {
            t2: '9'
        }
    },
    ble: {
        registers: {
            t2: '11'
        }
    },
    bleu: {
        registers: {
            t2: '11'
        }
    },
    blez: {
        registers: {
            t2: '11'
        }
    },
    blt: {
        registers: {
            t2: '11'
        }
    },
    bltu: {
        registers: {
            t2: '11'
        }
    },
    bltz: {
        registers: {
            t2: '11'
        }
    },
    bne: {
        registers: {
            t2: '11'
        }
    },
    bnez: {
        registers: {
            t2: '11'
        }
    },
    bset: {
        registers: {
            t2: '13'
        }
    },
    bseti: {
        registers: {
            t2: '13'
        }
    },
    call: {
        registers: {
            t2: '1',
            ra: '0x0040000c'
        }
    },
    clz: {
        registers: {
            t2: '28'
        }
    },
    clzw: {
        registers: {
            t2: '28'
        }
    },
    cpop: {
        registers: {
            t2: '3'
        }
    },
    cpopw: {
        registers: {
            t2: '3'
        }
    },
    csrc: {
        registers: {
            t2: '0'
        },
        registerFiles: {
            csr: {
                fcsr: '0'
            }
        }
    },
    csrci: {
        registers: {
            t2: '0'
        },
        registerFiles: {
            csr: {
                fcsr: '0'
            }
        }
    },
    csrr: {
        registers: {
            t0: '0'
        },
        registerFiles: {
            csr: {
                fcsr: '0'
            }
        }
    },
    csrrc: {
        registers: {
            t0: '1'
        },
        registerFiles: {
            csr: {
                fcsr: '0'
            }
        }
    },
    csrrci: {
        registers: {
            t0: '1'
        },
        registerFiles: {
            csr: {
                fcsr: '0'
            }
        }
    },
    csrrs: {
        registers: {
            t0: '0'
        },
        registerFiles: {
            csr: {
                fcsr: '1'
            }
        }
    },
    csrrsi: {
        registers: {
            t0: '0'
        },
        registerFiles: {
            csr: {
                fcsr: '1'
            }
        }
    },
    csrrw: {
        registers: {
            t0: '0'
        },
        registerFiles: {
            csr: {
                fcsr: '1'
            }
        }
    },
    csrrwi: {
        registers: {
            t0: '0'
        },
        registerFiles: {
            csr: {
                fcsr: '1'
            }
        }
    },
    csrs: {
        registers: {
            t2: '1'
        },
        registerFiles: {
            csr: {
                fcsr: '1'
            }
        }
    },
    csrsi: {
        registers: {
            t2: '1'
        },
        registerFiles: {
            csr: {
                fcsr: '1'
            }
        }
    },
    csrw: {
        registers: {
            t2: '1'
        },
        registerFiles: {
            csr: {
                fcsr: '1'
            }
        }
    },
    csrwi: {
        registers: {
            t2: '1'
        },
        registerFiles: {
            csr: {
                fcsr: '1'
            }
        }
    },
    ctz: {
        registers: {
            t2: '0'
        }
    },
    ctzw: {
        registers: {
            t2: '0'
        }
    },
    div: {
        registers: {
            t2: '3'
        }
    },
    divu: {
        registers: {
            t2: '3'
        }
    },
    divuw: {
        registers: {
            t2: '3'
        }
    },
    divw: {
        registers: {
            t2: '3'
        }
    },
    ebreak: {
        stop: 'breakpoint',
        registers: {
            t0: '7'
        }
    },
    ecall: {
        output: '42'
    },
    'fabs.d': {
        registerFiles: {
            fpu: {
                ft3: '0x4018000000000000'
            }
        }
    },
    'fabs.s': {
        registerFiles: {
            fpu: {
                ft3: '0xffffffff40c00000'
            }
        }
    },
    'fadd.d': {
        registerFiles: {
            fpu: {
                ft3: '0x4020000000000000'
            }
        }
    },
    'fadd.s': {
        registerFiles: {
            fpu: {
                ft3: '0xffffffff41000000'
            }
        }
    },
    'fclass.d': {
        registers: {
            t2: '64'
        }
    },
    'fclass.s': {
        registers: {
            t2: '64'
        }
    },
    'fcvt.d.l': {
        registerFiles: {
            fpu: {
                ft2: '0x4018000000000000'
            }
        }
    },
    'fcvt.d.lu': {
        registerFiles: {
            fpu: {
                ft2: '0x4018000000000000'
            }
        }
    },
    'fcvt.d.s': {
        registerFiles: {
            fpu: {
                ft2: '0x4018000000000000'
            }
        }
    },
    'fcvt.d.w': {
        registerFiles: {
            fpu: {
                ft2: '0x4018000000000000'
            }
        }
    },
    'fcvt.d.wu': {
        registerFiles: {
            fpu: {
                ft2: '0x4018000000000000'
            }
        }
    },
    'fcvt.l.d': {
        registers: {
            t1: '6'
        }
    },
    'fcvt.l.s': {
        registers: {
            t1: '6'
        }
    },
    'fcvt.lu.d': {
        registers: {
            t1: '6'
        }
    },
    'fcvt.lu.s': {
        registers: {
            t1: '6'
        }
    },
    'fcvt.s.d': {
        registerFiles: {
            fpu: {
                ft2: '0xffffffff40c00000'
            }
        }
    },
    'fcvt.s.l': {
        registerFiles: {
            fpu: {
                ft2: '0xffffffff40c00000'
            }
        }
    },
    'fcvt.s.lu': {
        registerFiles: {
            fpu: {
                ft2: '0xffffffff40c00000'
            }
        }
    },
    'fcvt.s.w': {
        registerFiles: {
            fpu: {
                ft2: '0xffffffff40c00000'
            }
        }
    },
    'fcvt.s.wu': {
        registerFiles: {
            fpu: {
                ft2: '0xffffffff40c00000'
            }
        }
    },
    'fcvt.w.d': {
        registers: {
            t1: '6'
        }
    },
    'fcvt.w.s': {
        registers: {
            t1: '6'
        }
    },
    'fcvt.wu.d': {
        registers: {
            t1: '6'
        }
    },
    'fcvt.wu.s': {
        registers: {
            t1: '6'
        }
    },
    'fdiv.d': {
        registerFiles: {
            fpu: {
                ft3: '0x4008000000000000'
            }
        }
    },
    'fdiv.s': {
        registerFiles: {
            fpu: {
                ft3: '0xffffffff40400000'
            }
        }
    },
    fence: {
        registers: {
            t2: '42'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [42, 0, 0, 0]
            }
        ]
    },
    'fence.i': {
        registers: {
            t0: '9'
        }
    },
    'feq.d': {
        registers: {
            t2: '0'
        }
    },
    'feq.s': {
        registers: {
            t2: '0'
        }
    },
    'fge.d': {
        registers: {
            t2: '1'
        }
    },
    'fge.s': {
        registers: {
            t2: '1'
        }
    },
    'fgt.d': {
        registers: {
            t2: '1'
        }
    },
    'fgt.s': {
        registers: {
            t2: '1'
        }
    },
    fld: {
        registerFiles: {
            fpu: {
                ft1: '0x3ff8000000000000'
            }
        }
    },
    'fle.d': {
        registers: {
            t2: '0'
        }
    },
    'fle.s': {
        registers: {
            t2: '0'
        }
    },
    'flt.d': {
        registers: {
            t2: '0'
        }
    },
    'flt.s': {
        registers: {
            t2: '0'
        }
    },
    flw: {
        registerFiles: {
            fpu: {
                ft1: '0xffffffff3fc00000'
            }
        }
    },
    'fmadd.d': {
        registerFiles: {
            fpu: {
                ft3: '0x4043000000000000'
            }
        }
    },
    'fmadd.s': {
        registerFiles: {
            fpu: {
                ft3: '0xffffffff42180000'
            }
        }
    },
    'fmax.d': {
        registerFiles: {
            fpu: {
                ft3: '0x4018000000000000'
            }
        }
    },
    'fmax.s': {
        registerFiles: {
            fpu: {
                ft3: '0xffffffff40c00000'
            }
        }
    },
    'fmin.d': {
        registerFiles: {
            fpu: {
                ft3: '0x4000000000000000'
            }
        }
    },
    'fmin.s': {
        registerFiles: {
            fpu: {
                ft3: '0xffffffff40000000'
            }
        }
    },
    'fmsub.d': {
        registerFiles: {
            fpu: {
                ft3: '0x4041000000000000'
            }
        }
    },
    'fmsub.s': {
        registerFiles: {
            fpu: {
                ft3: '0xffffffff42080000'
            }
        }
    },
    'fmul.d': {
        registerFiles: {
            fpu: {
                ft3: '0x4028000000000000'
            }
        }
    },
    'fmul.s': {
        registerFiles: {
            fpu: {
                ft3: '0xffffffff41400000'
            }
        }
    },
    'fmv.d': {
        registerFiles: {
            fpu: {
                ft2: '0x3ff0000000000000'
            }
        }
    },
    'fmv.d.x': {
        registerFiles: {
            fpu: {
                ft1: '0x3ff0000000000000'
            }
        }
    },
    'fmv.s': {
        registerFiles: {
            fpu: {
                ft2: '0xffffffff3f800000'
            }
        }
    },
    'fmv.s.x': {
        registerFiles: {
            fpu: {
                ft1: '0xffffffff3f800000'
            }
        }
    },
    'fmv.w.x': {
        registerFiles: {
            fpu: {
                ft1: '0xffffffff3f800000'
            }
        }
    },
    'fmv.x.d': {
        registers: {
            t2: '4607182418800017408'
        }
    },
    'fmv.x.s': {
        registers: {
            t2: '1065353216'
        }
    },
    'fmv.x.w': {
        registers: {
            t2: '1065353216'
        }
    },
    'fneg.d': {
        registerFiles: {
            fpu: {
                ft3: '0xc018000000000000'
            }
        }
    },
    'fneg.s': {
        registerFiles: {
            fpu: {
                ft3: '0xffffffffc0c00000'
            }
        }
    },
    'fnmadd.d': {
        registerFiles: {
            fpu: {
                ft3: '0xc043000000000000'
            }
        }
    },
    'fnmadd.s': {
        registerFiles: {
            fpu: {
                ft3: '0xffffffffc2180000'
            }
        }
    },
    'fnmsub.d': {
        registerFiles: {
            fpu: {
                ft3: '0xc041000000000000'
            }
        }
    },
    'fnmsub.s': {
        registerFiles: {
            fpu: {
                ft3: '0xffffffffc2080000'
            }
        }
    },
    frcsr: {
        registers: {
            t1: '0'
        },
        registerFiles: {
            csr: {
                fcsr: '0'
            }
        }
    },
    frflags: {
        registers: {
            t1: '0'
        },
        registerFiles: {
            csr: {
                fflags: '0'
            }
        }
    },
    frrm: {
        registers: {
            t1: '0'
        },
        registerFiles: {
            csr: {
                frm: '0'
            }
        }
    },
    frsr: {
        registers: {
            t1: '0'
        },
        registerFiles: {
            csr: {
                fcsr: '0'
            }
        }
    },
    fscsr: {
        registers: {
            t1: '0'
        },
        registerFiles: {
            csr: {
                fcsr: '1'
            }
        }
    },
    fsd: {
        memory: [
            {
                address: '0x10010000',
                bytes: [0, 0, 0, 0, 0, 0, 69, 64]
            }
        ]
    },
    fsflags: {
        registers: {
            t1: '0'
        },
        registerFiles: {
            csr: {
                fflags: '1'
            }
        }
    },
    'fsgnj.d': {
        registerFiles: {
            fpu: {
                ft3: '0xc018000000000000'
            }
        }
    },
    'fsgnj.s': {
        registerFiles: {
            fpu: {
                ft3: '0xffffffffc0c00000'
            }
        }
    },
    'fsgnjn.d': {
        registerFiles: {
            fpu: {
                ft3: '0x4018000000000000'
            }
        }
    },
    'fsgnjn.s': {
        registerFiles: {
            fpu: {
                ft3: '0xffffffff40c00000'
            }
        }
    },
    'fsgnjx.d': {
        registerFiles: {
            fpu: {
                ft3: '0xc018000000000000'
            }
        }
    },
    'fsgnjx.s': {
        registerFiles: {
            fpu: {
                ft3: '0xffffffffc0c00000'
            }
        }
    },
    'fsqrt.d': {
        registerFiles: {
            fpu: {
                ft3: '0x4003988e1409212e'
            }
        }
    },
    'fsqrt.s': {
        registerFiles: {
            fpu: {
                ft3: '0xffffffff401cc471'
            }
        }
    },
    fsrm: {
        registers: {
            t1: '0'
        },
        registerFiles: {
            csr: {
                frm: '1'
            }
        }
    },
    fssr: {
        registers: {
            t1: '0'
        },
        registerFiles: {
            csr: {
                fcsr: '1'
            }
        }
    },
    'fsub.d': {
        registerFiles: {
            fpu: {
                ft3: '0x4010000000000000'
            }
        }
    },
    'fsub.s': {
        registerFiles: {
            fpu: {
                ft3: '0xffffffff40800000'
            }
        }
    },
    fsw: {
        memory: [
            {
                address: '0x10010000',
                bytes: [0, 0, 40, 66]
            }
        ]
    },
    j: {
        registers: {
            t2: '1'
        }
    },
    jal: {
        registers: {
            t2: '1',
            ra: '0x00400008'
        }
    },
    jalr: {
        registers: {
            t2: '1',
            ra: '0x00400010'
        }
    },
    jr: {
        registers: {
            t2: '1'
        }
    },
    la: {
        registers: {
            t0: '0x10010000'
        }
    },
    lb: {
        registers: {
            t2: '4294967168'
        }
    },
    lbu: {
        registers: {
            t2: '128'
        }
    },
    ld: {
        registers: {
            t2: '305419896'
        }
    },
    lh: {
        registers: {
            t2: '4294967168'
        }
    },
    lhu: {
        registers: {
            t2: '65408'
        }
    },
    li: {
        registers: {
            t0: '123'
        }
    },
    'lr.d': {
        registers: {
            t2: '305419896'
        }
    },
    'lr.w': {
        registers: {
            t2: '305419896'
        }
    },
    lui: {
        registers: {
            t0: '73728'
        }
    },
    lw: {
        registers: {
            t2: '0xffffffff817fff80'
        }
    },
    lwu: {
        registers: {
            t2: '2172649344'
        }
    },
    max: {
        registers: {
            t2: '18'
        }
    },
    maxu: {
        registers: {
            t2: '18'
        }
    },
    min: {
        registers: {
            t2: '5'
        }
    },
    minu: {
        registers: {
            t2: '5'
        }
    },
    mul: {
        registers: {
            t2: '65'
        }
    },
    mulh: {
        registers: {
            t2: '4294967295'
        }
    },
    mulhsu: {
        registers: {
            t2: '4294967295'
        }
    },
    mulhu: {
        registers: {
            t2: '1'
        }
    },
    mulw: {
        registers: {
            t2: '65'
        }
    },
    mv: {
        registers: {
            t2: '12'
        }
    },
    neg: {
        registers: {
            t2: '4294967283'
        }
    },
    negw: {
        registers: {
            t2: '18446744073709551603'
        }
    },
    nop: {
        registers: {
            t0: '9'
        }
    },
    not: {
        registers: {
            t2: '4294967282'
        }
    },
    or: {
        registers: {
            t2: '13'
        }
    },
    'orc.b': {
        registers: {
            t2: '4278255360'
        }
    },
    ori: {
        registers: {
            t2: '13'
        }
    },
    orn: {
        registers: {
            t2: '4294967295'
        }
    },
    rdcycle: {
        registers: {
            t2: '0'
        }
    },
    rdcycleh: {
        registers: {
            t2: '0'
        }
    },
    rdinstret: {
        registers: {
            t2: '0'
        }
    },
    rdinstreth: {
        registers: {
            t2: '0'
        }
    },
    rdtime: {
        registers: {
            t2: '0'
        }
    },
    rdtimeh: {
        registers: {
            t2: '0'
        }
    },
    rem: {
        registers: {
            t2: '3'
        }
    },
    remu: {
        registers: {
            t2: '3'
        }
    },
    remuw: {
        registers: {
            t2: '3'
        }
    },
    remw: {
        registers: {
            t2: '3'
        }
    },
    ret: {
        registers: {
            t2: '1'
        }
    },
    rev8: {
        registers: {
            t2: '218103808'
        }
    },
    rol: {
        registers: {
            t2: '52'
        }
    },
    rolw: {
        registers: {
            t2: '52'
        }
    },
    ror: {
        registers: {
            t2: '1073741827'
        }
    },
    rori: {
        registers: {
            t2: '1073741827'
        }
    },
    roriw: {
        registers: {
            t2: '1073741827'
        }
    },
    rorw: {
        registers: {
            t2: '1073741827'
        }
    },
    sb: {
        memory: [
            {
                address: '0x10010000',
                bytes: [42]
            }
        ]
    },
    'sc.d': {
        registers: {
            t2: '0',
            t4: '1'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [42, 0, 0, 0, 0, 0, 0, 0]
            }
        ]
    },
    'sc.w': {
        registers: {
            t2: '0',
            t4: '1'
        },
        memory: [
            {
                address: '0x10010000',
                bytes: [42, 0, 0, 0]
            }
        ]
    },
    sd: {
        memory: [
            {
                address: '0x10010000',
                bytes: [42, 0, 0, 0, 0, 0, 0, 0]
            }
        ]
    },
    seqz: {
        registers: {
            t2: '1'
        }
    },
    'sext.b': {
        registers: {
            t2: '4294967168'
        }
    },
    'sext.h': {
        registers: {
            t2: '4294934528'
        }
    },
    'sext.w': {
        registers: {
            t2: '18446744071562067969'
        }
    },
    sgt: {
        registers: {
            t2: '1'
        }
    },
    sgtu: {
        registers: {
            t2: '1'
        }
    },
    sgtz: {
        registers: {
            t2: '1'
        }
    },
    sh: {
        memory: [
            {
                address: '0x10010000',
                bytes: [42, 0]
            }
        ]
    },
    sh1add: {
        registers: {
            t2: '31'
        }
    },
    'sh1add.uw': {
        registers: {
            t2: '31'
        }
    },
    sh2add: {
        registers: {
            t2: '57'
        }
    },
    'sh2add.uw': {
        registers: {
            t2: '57'
        }
    },
    sh3add: {
        registers: {
            t2: '109'
        }
    },
    'sh3add.uw': {
        registers: {
            t2: '109'
        }
    },
    sll: {
        registers: {
            t2: '52'
        }
    },
    slli: {
        registers: {
            t2: '52'
        }
    },
    'slli.uw': {
        registers: {
            t2: '52'
        }
    },
    slliw: {
        registers: {
            t2: '52'
        }
    },
    sllw: {
        registers: {
            t2: '52'
        }
    },
    slt: {
        registers: {
            t2: '1'
        }
    },
    slti: {
        registers: {
            t2: '1'
        }
    },
    sltiu: {
        registers: {
            t2: '1'
        }
    },
    sltu: {
        registers: {
            t2: '0'
        }
    },
    sltz: {
        registers: {
            t2: '1'
        }
    },
    snez: {
        registers: {
            t2: '1'
        }
    },
    sra: {
        registers: {
            t2: '3'
        }
    },
    srai: {
        registers: {
            t2: '3'
        }
    },
    sraiw: {
        registers: {
            t2: '3'
        }
    },
    sraw: {
        registers: {
            t2: '3'
        }
    },
    srl: {
        registers: {
            t2: '3'
        }
    },
    srli: {
        registers: {
            t2: '3'
        }
    },
    srliw: {
        registers: {
            t2: '3'
        }
    },
    srlw: {
        registers: {
            t2: '3'
        }
    },
    sub: {
        registers: {
            t2: '8'
        }
    },
    subw: {
        registers: {
            t2: '8'
        }
    },
    sw: {
        memory: [
            {
                address: '0x10010000',
                bytes: [42, 0, 0, 0]
            }
        ]
    },
    tail: {
        registers: {
            t2: '123'
        }
    },
    uret: {
        registers: {
            t1: '7'
        }
    },
    wfi: {
        registers: {
            t0: '9',
            t1: '1'
        }
    },
    xnor: {
        registers: {
            t2: '4294967287'
        }
    },
    xor: {
        registers: {
            t2: '8'
        }
    },
    xori: {
        registers: {
            t2: '8'
        }
    },
    'zext.b': {
        registers: {
            t2: '128'
        }
    },
    'zext.h': {
        registers: {
            t2: '65535'
        }
    },
    'zext.w': {
        registers: {
            t2: '4294967295'
        }
    }
}
