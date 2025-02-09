export type Justify =
    | 'start'
    | 'end'
    | 'center'
    | 'between'
    | 'around'
    | 'evenly'
    | 'unset'
    | 'inherit'
    | 'stretch'

export const justifyMap: Record<Justify, string> = {
    start: 'flex-start',
    end: 'flex-end',
    center: 'center',
    between: 'space-between',
    around: 'space-around',
    evenly: 'space-evenly',
    unset: 'unset',
    inherit: 'inherit',
    stretch: 'stretch'
}
