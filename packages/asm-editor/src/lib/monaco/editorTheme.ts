import {
    ScopedTheme,
    type ThemeKeys,
    type ThemeProp,
    ThemeStore
} from '#stores/themeStore.svelte.ts'
import { TinyColor } from '@ctrl/tinycolor'
import type monaco from 'monaco-editor'
import {
    ASSEMBLY_BRACKET_COLORS,
    ASSEMBLY_TOKEN_COLORS,
    ASSEMBLY_TOKEN_FONT_STYLES,
    type AssemblyThemeToken
} from './assemblyTokenColors'

/**
 * A theme's colours, the text that sits on each and a shade a layer away, over whichever theme is
 * being asked about: the store's own `getColor` only ever answers for the app's theme, and the
 * editor is not always wearing it.
 */
function readerOf(theme: Record<ThemeKeys, ThemeProp<ThemeKeys>>) {
    const color = (key: ThemeKeys) => new TinyColor(theme[key].color)
    const text = (key: ThemeKeys) =>
        color(key).isDark() ? ThemeStore.meta.textForDark : ThemeStore.meta.textForLight
    const layer = (key: ThemeKeys, amount: number) => {
        const of = color(key)
        return of.isDark() ? of.lighten(amount) : of.darken(amount)
    }
    return { color, text, layer }
}

export function generateTheme(): monaco.editor.IStandaloneThemeData {
    //The colours of the subtree the editor sits in when a layout has dressed one in a language's
    //theme — a lecture, a language's docs, an embed — and the app's own otherwise. Monaco paints
    //from a theme of its own rather than from custom properties, so it is the one part of such a
    //subtree that has to be told, and an editor left on the app's colours is the loudest thing on
    //the page disagreeing with the panels around it.
    const { color, text, layer } = readerOf(ScopedTheme.theme?.theme ?? ThemeStore.theme)
    const isDark = color('secondary').isDark()
    const tokens = ASSEMBLY_TOKEN_COLORS[isDark ? 'dark' : 'light']
    const brackets = ASSEMBLY_BRACKET_COLORS[isDark ? 'dark' : 'light']
    return {
        base: isDark ? 'vs-dark' : 'vs',
        inherit: true,
        rules: [
            ...(isDark ? darkOverride : whiteOverride),
            ...assemblyRules(tokens),
            //C's preprocessor lines are directives too, red like the assemblers' own
            { token: 'keyword.directive', foreground: tokens.directive.replace('#', '') },
            //punctuation is text, in the editor's own text colour rather than the near-match
            //Monaco's base themes give it, so a code block's plain text reads the same
            ...['delimiter', 'operator'].map((token) => ({
                token,
                foreground: new TinyColor(text('secondary')).toHex()
            }))
        ],
        colors: {
            'editor.foreground': text('secondary'), //CDCDCD
            'editor.background': color('secondary').toHexString(),
            'editor.selectionBackground': layer('tertiary', 2).toHexString(),
            'editor.lineHighlightBackground': layer('secondary', 5).toHexString(),
            'editorCursor.foreground': color('accent').toHexString(),
            'editorWhitespace.foreground': new TinyColor(text('secondary')).toHexString() + '2A',
            'editorWidget.background': color('tertiary').toHexString(),
            'editorSuggestWidget.selectedBackground': color('accent2').darken(5).toHexString(),
            'input.background': layer('tertiary', 10).toHexString(),
            'menu.background': color('tertiary').toHexString(),
            'menu.foreground': text('tertiary'),
            'menu.border': color('accent2').toHexString(),
            'menu.separatorBackground': layer('tertiary', 12).toHexString(),
            'menu.selectionBackground': layer('tertiary', 6).toHexString(),
            'menu.selectionForeground': text('tertiary'),
            //Monaco's context menu uses list hover colors for mouse and keyboard focus.
            'list.hoverBackground': layer('tertiary', 6).toHexString(),
            'list.hoverForeground': text('tertiary'),
            'editorBracketHighlight.foreground1': brackets.levels[0],
            'editorBracketHighlight.foreground2': brackets.levels[1],
            'editorBracketHighlight.foreground3': brackets.levels[2],
            'editorBracketHighlight.unexpectedBracket.foreground': brackets.unexpected
        }
    }
}

/**
 * The rules for the assembly grammars' tokens and C/C++'s, from the table the code blocks paint
 * with too. A C++ attribute's is one though the base theme gives it the same colour, so that the
 * editor and the code blocks read it from one place.
 */
function assemblyRules(
    colors: Record<AssemblyThemeToken, string>
): monaco.editor.ITokenThemeRule[] {
    return Object.entries(colors).map(([token, foreground]) => ({
        token,
        foreground: foreground.replace('#', ''),
        fontStyle: ASSEMBLY_TOKEN_FONT_STYLES[token as AssemblyThemeToken]
    }))
}

const common = [
    {
        fontStyle: 'underline',
        token: 'label'
    }
]

const whiteOverride = [
    ...common,
    {
        foreground: 'ff628c',
        token: 'constant'
    },
    {
        foreground: 'ffdd00',
        token: 'entity'
    }
]

const darkOverride = [
    ...common,
    {
        background: '002240',
        token: ''
    },
    {
        foreground: 'e1efff',
        token: 'punctuation - (punctuation.definition.string || punctuation.definition.comment)'
    },
    {
        foreground: 'ff628c',
        token: 'constant'
    },
    {
        foreground: 'ffdd00',
        token: 'entity'
    },
    {
        foreground: 'ffee80',
        token: 'storage'
    },
    {
        foreground: '3ad900',
        token: 'string -string.unquoted.old-plist -string.unquoted.heredoc'
    },
    {
        foreground: '3ad900',
        token: 'string.unquoted.heredoc string'
    },
    {
        foreground: '80ffbb',
        token: 'support'
    },
    {
        foreground: 'cccccc',
        token: 'variable'
    },
    {
        foreground: 'ff80e1',
        token: 'variable.language'
    },
    {
        foreground: 'ffee80',
        token: 'meta.function-call'
    },
    {
        foreground: 'ffffff',
        background: '223545',
        token: 'text source'
    },
    {
        foreground: 'ffffff',
        background: '223545',
        token: 'string.unquoted.heredoc'
    },
    {
        foreground: 'ffffff',
        background: '223545',
        token: 'source source'
    },
    {
        foreground: '80fcff',
        fontStyle: 'italic',
        token: 'entity.other.inherited-class'
    },
    {
        foreground: '9eff80',
        token: 'string.quoted source'
    },
    {
        foreground: '80ff82',
        token: 'string constant'
    },
    {
        foreground: '80ffc2',
        token: 'string.regexp'
    },
    {
        foreground: 'edef7d',
        token: 'string variable'
    },
    {
        foreground: 'ffb054',
        token: 'support.function'
    },
    {
        foreground: 'eb939a',
        token: 'support.constant'
    },
    {
        foreground: 'ff1e00',
        token: 'support.type.exception'
    },
    {
        foreground: '8996a8',
        token: 'meta.preprocessor.c'
    },
    {
        foreground: 'afc4db',
        token: 'meta.preprocessor.c keyword'
    },
    {
        foreground: '73817d',
        token: 'meta.sgml.html meta.doctype'
    },
    {
        foreground: '73817d',
        token: 'meta.sgml.html meta.doctype entity'
    },
    {
        foreground: '73817d',
        token: 'meta.sgml.html meta.doctype string'
    },
    {
        foreground: '73817d',
        token: 'meta.xml-processing'
    },
    {
        foreground: '73817d',
        token: 'meta.xml-processing entity'
    },
    {
        foreground: '73817d',
        token: 'meta.xml-processing string'
    },
    {
        foreground: '9effff',
        token: 'meta.tag'
    },
    {
        foreground: '9effff',
        token: 'meta.tag entity'
    },
    {
        foreground: '9effff',
        token: 'meta.selector.css entity.name.tag'
    },
    {
        foreground: 'ffb454',
        token: 'meta.selector.css entity.other.attribute-name.id'
    },
    {
        foreground: '5fe461',
        token: 'meta.selector.css entity.other.attribute-name.class'
    },
    {
        foreground: '9df39f',
        token: 'support.type.property-name.css'
    },
    {
        foreground: 'f6f080',
        token: 'meta.property-group support.constant.property-value.css'
    },
    {
        foreground: 'f6f080',
        token: 'meta.property-value support.constant.property-value.css'
    },
    {
        foreground: 'f6aa11',
        token: 'meta.preprocessor.at-rule keyword.control.at-rule'
    },
    {
        foreground: 'edf080',
        token: 'meta.property-value support.constant.named-color.css'
    },
    {
        foreground: 'edf080',
        token: 'meta.property-value constant'
    },
    {
        foreground: 'eb939a',
        token: 'meta.constructor.argument.css'
    },
    {
        foreground: 'f8f8f8',
        background: '000e1a',
        token: 'meta.diff'
    },
    {
        foreground: 'f8f8f8',
        background: '000e1a',
        token: 'meta.diff.header'
    },
    {
        foreground: 'f8f8f8',
        background: '4c0900',
        token: 'markup.deleted'
    },
    {
        foreground: 'f8f8f8',
        background: '806f00',
        token: 'markup.changed'
    },
    {
        foreground: 'f8f8f8',
        background: '154f00',
        token: 'markup.inserted'
    },
    {
        background: '8fddf630',
        token: 'markup.raw'
    },
    {
        background: '004480',
        token: 'markup.quote'
    },
    {
        background: '130d26',
        token: 'markup.list'
    },
    {
        foreground: 'c1afff',
        fontStyle: 'bold',
        token: 'markup.bold'
    },
    {
        foreground: 'b8ffd9',
        fontStyle: 'italic',
        token: 'markup.italic'
    },
    {
        foreground: 'c8e4fd',
        background: '001221',
        fontStyle: 'bold',
        token: 'markup.heading'
    }
    /*
	,{
		"token": "arithmetical-operation",
		"foreground": "47d3a8"
	}
	*/
]
