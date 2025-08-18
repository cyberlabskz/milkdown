import { $inputRule, $nodeSchema, $remark } from '@milkdown/kit/utils'
import { InputRule } from '@milkdown/kit/prose/inputrules'
import type { DefineFeature } from '../shared'
import { crepeFeatureConfig } from '../../core/slice'
import { CrepeFeature } from '..'
import { toggleIframeCommand } from './command'
import directive from 'remark-directive'

const remarkDirective = $remark('iframe', () => directive)

export const iframeId = 'iframe'

// Define iframe input rule
export const iframeInputRule = $inputRule(
  (ctx) =>
    new InputRule(
      /::iframe\{src="(?<src>[^"]+)?"?\}/,
      (state, match, start, end) => {
        const [okay, src = ''] = match
        const { tr } = state
        if (okay) {
          tr.replaceWith(
            start - 1,
            end,
            iframeNodeSchema.type(ctx).create({ src })
          )
        }
        return tr
      }
    )
)

export const iframeNodeSchema = $nodeSchema(iframeId, () => ({
  group: 'block',
  atom: true,
  isolating: true,
  marks: '',
  attrs: {
    src: { default: null },
    width: { default: '1000' }, // Add width attribute with a default value
    height: { default: '500' }, // Add height attribute with a default value
    allowfullscreen: { default: true },
  },
  parseDOM: [
    {
      tag: 'iframe',
      getAttrs: (dom) => ({
        src: (dom as HTMLElement).getAttribute('src'),
      }),
    },
  ],
  toDOM: (node) => {
    return ['iframe', node.attrs]
  },
  parseMarkdown: {
    match: (node) => node.type === 'leafDirective' && node.name === 'iframe',
    runner: (state, node, type) => {
      state.addNode(type, { src: (node.attributes as { src: string }).src })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === iframeId,
    runner: (state, node) => {
      state.addNode('leafDirective', undefined, undefined, {
        name: 'iframe',
        attributes: { src: node.attrs.src },
      })
    },
  },
}))

export const inputRule = $inputRule(
  (ctx) =>
    new InputRule(
      /::iframe\{src="(?<src>[^"]+)?"?\}/,
      (state, match, start, end) => {
        const [okay, src = ''] = match
        const { tr } = state
        if (okay) {
          tr.replaceWith(
            start - 1,
            end,
            iframeNodeSchema.type(ctx).create({ src })
          )
        }

        return tr
      }
    )
)

export interface IframeConfig {}

export type IframeFeatureConfig = Partial<IframeConfig>

export const iframe: DefineFeature<IframeFeatureConfig> = (editor) => {
  editor.config(crepeFeatureConfig(CrepeFeature.Iframe))

  // editor.config((ctx) => {
  //   ctx.set(iframeTooltip.key, {
  //     view: (view) => {
  //       return new IframeInlineTooltip(ctx, view, {})
  //     },
  //   })
  // })

  editor
    .use(remarkDirective)
    .use(iframeNodeSchema)
    .use(iframeInputRule)
    .use(toggleIframeCommand)
  // .use(iframeTooltip)
}
