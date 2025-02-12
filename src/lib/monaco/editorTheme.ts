import { ThemeStore } from '$stores/themeStore'
import { TinyColor } from '@ctrl/tinycolor'
import type monaco from 'monaco-editor'
export function generateTheme(): monaco.editor.IStandaloneThemeData {
    const base = ThemeStore.getColor('secondary')
    const isDark = new TinyColor(base).isDark()
    return {
        base: isDark ? 'vs-dark' : 'vs',
        inherit: true,
        rules: isDark ? darkOverride : whiteOverride,
        colors: {
            'editor.foreground': ThemeStore.getText('secondary'), //CDCDCD
            'editor.background': ThemeStore.getColor('secondary').toHexString(),
            'editor.selectionBackground': ThemeStore.layer('tertiary', 2).toHexString(),
            'editor.lineHighlightBackground': ThemeStore.layer('secondary', 5).toHexString(),
            'editorCursor.foreground': ThemeStore.getColor('accent').toHexString(),
            'editorWhitespace.foreground':
                new TinyColor(ThemeStore.getText('secondary')).toHexString() + '2A',
            'editorWidget.background': ThemeStore.getColor('tertiary').toHexString(),
            'editorSuggestWidget.selectedBackground': ThemeStore.getColor('accent2')
                .darken(5)
                .toHexString(),
            'input.background': ThemeStore.layer('tertiary', 10).toHexString()
        }
    }
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
        foreground: '506696',
        fontStyle: 'italic',
        token: 'comment'
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
        foreground: '473fd8',
        token: 'keyword'
    },
    {
        foreground: '037280',
        token: 'data-register'
    },
    {
        foreground: '9909eb',
        token: 'address-register'
    },
    {
        foreground: '9f3b3b',
        token: 'directive'
    },
    {
        foreground: '006d4c',
        token: 'number.immediate'
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
        foreground: 'ff9d00',
        token: 'keyword'
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
        foreground: '1f619a',
        fontStyle: 'italic',
        token: 'comment'
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
        foreground: 'f8f8f8',
        background: '800f00',
        token: 'invalid'
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
    },
    {
        foreground: '8673ff',
        token: 'data-register'
    },
    {
        foreground: '8673ff',
        token: 'variable.predefined'
    },
    {
        foreground: 'c26ef2',
        token: 'address-register'
    },
    {
        foreground: 'f26e6e',
        token: 'directive'
    },
    {
        foreground: '47d3a8',
        token: 'number.immediate'
    }
    /*
	,{
		"token": "arithmetical-operation",
		"foreground": "47d3a8"
	}
	*/
]
